// Build the throwaway /watching/ poster studies from the Letterboxd RSS.
// Grid files are 500px mozjpeg. The full-screen scene loads a 960px file
// only when that film opens. Posters are not committed.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { parseLetterboxdRss, selectRecentWatches } from '../../lib/letterboxd.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const artRoot = path.join(here, 'art');
const thumbDir = path.join(artRoot, '500');
const fullDir = path.join(artRoot, '960');
const FEED = 'https://letterboxd.com/mattdoes/rss/';
const STAR = '★';
const HALF = '½';

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function resized(url, width) {
  const height = Math.round(width * 1.5);
  const next = String(url).replace(/0-\d+-0-\d+-crop/, `0-${width}-0-${height}-crop`);
  return next === url ? '' : next;
}

function weightFor(film, index) {
  const rating = Number(film.rating) || 0;
  if (index === 0 || rating >= 5) return 'xl';
  if (rating >= 4.5) return 'lg';
  return 'sm';
}

function starMarkup(stars, rating) {
  const value = String(stars || '');
  if (!value) return '';
  const half = value.endsWith(HALF);
  const full = half ? value.slice(0, -HALF.length) : value;
  if ([...full].some((ch) => ch !== STAR)) return esc(value);
  const clipped = half
    ? '<span class="star-half"><span class="star-glyph">★</span></span>'
    : '';
  const label = rating ? ` aria-label="${esc(String(rating) + ' out of 5 stars')}"` : '';
  return `<span class="stars" role="img"${label}>${full}${clipped}</span>`;
}

async function fetchBuffer(url) {
  const res = await fetch(url, {
    headers: {
      accept: 'image/jpeg,image/webp,image/*',
      'user-agent': 'mattdoes-site/posters',
    },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

async function posterBuffers(source) {
  const large = resized(source, 1000) || source;
  try {
    return await fetchBuffer(large);
  } catch {
    return fetchBuffer(source);
  }
}

async function writeJpeg(buf, width, file) {
  const out = await sharp(buf, { failOn: 'none' })
    .rotate()
    .resize({ width, withoutEnlargement: true })
    .jpeg({ quality: width > 500 ? 72 : 68, mozjpeg: true })
    .toBuffer();
  const meta = await sharp(out).metadata();
  fs.writeFileSync(file, out);
  return { width: meta.width || width, height: meta.height || Math.round(width * 1.5), bytes: out.length };
}

async function mapPool(items, limit, worker) {
  const out = new Array(items.length);
  let cursor = 0;
  async function run() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      out[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return out;
}

function filmItem(film, index) {
  const loading = index === 0 ? 'eager' : 'lazy';
  const priority = index === 0 ? ' fetchpriority="high"' : '';
  const stars = starMarkup(film.stars, film.rating);
  const year = film.year ? `<span class="year">${esc(film.year)}</span>` : '';
  const flag = film.rewatch ? '<span class="flag">rewatch</span>' : '';
  const meta = (year || stars || flag)
    ? `<span class="meta">${year}${stars}${flag}</span>`
    : '';
  return `<li class="film film--${film.weight}">
          <button type="button" data-scene="${esc(film.id)}" data-reviewed="${film.review ? '1' : '0'}" aria-haspopup="dialog" aria-controls="scene" aria-expanded="false">
            <span class="still"><img src="${esc(film.thumb)}" alt="" width="${film.thumbWidth}" height="${film.thumbHeight}" loading="${loading}" decoding="async"${priority}></span>
            <span class="caption">
              <span class="name">${esc(film.title)}</span>
              ${meta}
            </span>
          </button>
        </li>`;
}

function page(films) {
  const json = JSON.stringify(films.map((film) => ({
    id: film.id,
    title: film.title,
    year: film.year,
    rating: film.rating,
    stars: film.stars,
    rewatch: film.rewatch,
    review: film.review,
    link: film.link,
    full: film.full,
    fullWidth: film.fullWidth,
    fullHeight: film.fullHeight,
  }))).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

  return `<!DOCTYPE html>
<html lang="en" data-layout="weighted">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex">
    <title>matt does letterboxd · mattdoes.online</title>
    <script>
      (function () {
        var layout = new URLSearchParams(location.search).get('layout');
        if (layout === 'strip' || layout === 'reflow' || layout === 'weighted') {
          document.documentElement.setAttribute('data-layout', layout);
        }
      })();
    </script>
    <link rel="stylesheet" href="posters.css">
  </head>
  <body data-polarity="flip">
    <a class="skip-link" href="#main">Skip to content</a>
    <main id="main">
      <h1 class="sign"><a href="/">matt does letterboxd</a></h1>
      <ol class="feed">
        ${films.map(filmItem).join('\n        ')}
      </ol>
    </main>
    <dialog class="scene" id="scene" aria-modal="true" aria-labelledby="scene-title">
      <button type="button" class="scene-close">close</button>
      <div class="scene-panel">
        <figure class="scene-still">
          <img id="scene-img" alt="" width="960" height="1440" decoding="async">
        </figure>
        <div class="scene-copy">
          <h2 class="scene-title" id="scene-title"></h2>
          <p class="scene-year" id="scene-year" hidden></p>
          <div class="scene-rate" id="scene-rate"></div>
          <p class="scene-review" id="scene-review" hidden></p>
          <p class="scene-source"><a id="scene-link">letterboxd</a></p>
        </div>
      </div>
    </dialog>
    <script type="application/json" id="film-data">${json}</script>
    <script src="scene.js" defer></script>
  </body>
</html>
`;
}

const rssRes = await fetch(FEED, {
  headers: {
    accept: 'application/rss+xml, application/xml, text/xml',
    'user-agent': 'mattdoes-site/build (+https://mattdoes.online)',
  },
  signal: AbortSignal.timeout(20000),
});
if (!rssRes.ok) throw new Error(`Letterboxd RSS HTTP ${rssRes.status}`);
const watches = selectRecentWatches(parseLetterboxdRss(await rssRes.text()), 25);
fs.rmSync(artRoot, { recursive: true, force: true });
fs.mkdirSync(thumbDir, { recursive: true });
fs.mkdirSync(fullDir, { recursive: true });

const saved = new Map();
let thumbBytes = 0;
let fullBytes = 0;

const films = await mapPool(watches, 4, async (watch, index) => {
  const source = String(watch.posterSource || '');
  if (!source) throw new Error(`no poster for ${watch.title}`);
  let files = saved.get(source);
  if (!files) {
    const key = crypto.createHash('sha256').update(source).digest('hex').slice(0, 12);
    const buf = await posterBuffers(source);
    const thumb = await writeJpeg(buf, 500, path.join(thumbDir, `${key}.jpg`));
    const full = await writeJpeg(buf, 960, path.join(fullDir, `${key}.jpg`));
    files = { key, thumb, full };
    saved.set(source, files);
    thumbBytes += thumb.bytes;
    fullBytes += full.bytes;
  }
  return {
    id: String(index),
    title: watch.title,
    year: watch.year || '',
    rating: watch.rating,
    stars: watch.stars || '',
    rewatch: Boolean(watch.rewatch),
    review: watch.review || '',
    link: watch.link || '',
    weight: weightFor(watch, index),
    thumb: `art/500/${files.key}.jpg`,
    thumbWidth: files.thumb.width,
    thumbHeight: files.thumb.height,
    full: `art/960/${files.key}.jpg`,
    fullWidth: files.full.width,
    fullHeight: files.full.height,
  };
});

fs.writeFileSync(path.join(here, 'index.html'), page(films));
const reviewed = films.filter((film) => film.review).length;
console.log(`prototype: ${films.length} films, ${reviewed} with reviews`);
console.log(`posters: ${saved.size} unique, thumbs ${Math.round(thumbBytes / 1024)}kb, scene files ${Math.round(fullBytes / 1024)}kb`);
