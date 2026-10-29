// Published Unshared songs. The page reads the committed snapshot.
// concepts/suno/songs.json is written by scripts/suno-sync.js.

import fs from 'node:fs';
import { esc, relFor } from './safe-url.js';

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SONG_FILE = /^\/unshared\/songs\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?:-(?:240|300))?\.(?:avif|webp|jpg)$/;
const TYPES = new Set(['image/avif', 'image/webp', 'image/jpeg']);

// Same slot math as the listening chart. Phone padding is --space-page.
// Desktop padding is the horizontal half of --space-page-desk.
const COVER_SIZES = '(min-width: 1024px) calc((100vw - max(clamp(1.25rem, 2vw, 2.4rem), env(safe-area-inset-left, 0px)) - max(clamp(1.25rem, 2vw, 2.4rem), env(safe-area-inset-right, 0px))) / 5), calc((100vw - max(clamp(1rem, 3vw, 2.75rem), env(safe-area-inset-left, 0px)) - max(clamp(1rem, 3vw, 2.75rem), env(safe-area-inset-right, 0px))) / 5)';

/**
 * @param {unknown} url
 * @returns {string}
 */
export function sunoImageUrl(url) {
  let parsed;
  try { parsed = new URL(String(url ?? '').trim()); } catch { return ''; }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port) return '';
  const host = parsed.hostname.toLowerCase();
  if (host !== 'cdn1.suno.ai' && host !== 'cdn2.suno.ai') return '';
  return parsed.href;
}

/**
 * Public, finished clips with artwork. Drafts, hidden clips, trashed clips,
 * and duplicates stay out. Order is the profile order.
 *
 * @param {unknown} clips
 * @returns {{ included: { id: string, title: string, image: string }[], excluded: { id: string, title: string, reason: string }[] }}
 */
export function selectPublicSongs(clips) {
  const included = [];
  const excluded = [];
  const seen = new Set();
  const list = Array.isArray(clips) ? clips : [];
  for (const clip of list) {
    const id = String(clip?.id || '').trim();
    const rawTitle = String(clip?.title || '').trim();
    const drop = (reason) => excluded.push({ id, title: rawTitle, reason });
    if (!ID.test(id)) {
      drop('missing id');
      continue;
    }
    if (seen.has(id)) {
      drop('duplicate');
      continue;
    }
    if (clip?.is_public !== true) {
      drop('not public');
      continue;
    }
    if (clip?.is_hidden === true) {
      drop('hidden');
      continue;
    }
    if (clip?.is_trashed === true) {
      drop('trashed');
      continue;
    }
    if (clip?.status !== 'complete') {
      drop(`status ${String(clip?.status || 'missing')}`);
      continue;
    }
    const image = sunoImageUrl(clip?.image_large_url) || sunoImageUrl(clip?.image_url);
    if (!image) {
      drop('no artwork');
      continue;
    }
    const title = rawTitle.toLocaleLowerCase('en-US');
    if (!title) {
      drop('missing title');
      continue;
    }
    seen.add(id);
    included.push({ id, title, image });
  }
  return { included, excluded };
}

/**
 * @param {unknown} url
 * @returns {string}
 */
function songFile(url) {
  const value = String(url || '');
  return SONG_FILE.test(value) ? value : '';
}

/**
 * @param {unknown} snapshot
 * @returns {{ id: string, title: string, href: string, image: string, imageSet: { url: string, width: number, type: string }[] }[]}
 */
export function songsFromSnapshot(snapshot) {
  const rows = Array.isArray(snapshot?.songs) ? snapshot.songs : [];
  const songs = [];
  const seen = new Set();
  for (const row of rows) {
    const id = String(row?.id || '');
    if (!ID.test(id) || seen.has(id)) continue;
    const title = String(row?.title || '').trim().toLocaleLowerCase('en-US');
    if (!title) continue;
    const image = songFile(row?.image);
    if (!image.endsWith(`${id}.jpg`)) continue;
    const imageSet = [];
    const variants = Array.isArray(row?.imageSet) ? row.imageSet : [];
    const taken = new Set();
    for (const item of variants) {
      const url = songFile(item?.url);
      const width = Number(item?.width);
      const type = String(item?.type || '');
      if (!url || !url.includes(`/${id}`)) continue;
      if (!Number.isInteger(width) || (width !== 240 && width !== 300)) continue;
      if (!TYPES.has(type)) continue;
      const key = `${type}:${width}`;
      if (taken.has(key)) continue;
      taken.add(key);
      imageSet.push({ url, width, type });
    }
    seen.add(id);
    songs.push({
      id,
      title,
      href: `https://suno.com/song/${id}`,
      image,
      imageSet,
    });
  }
  return songs;
}

/**
 * @param {string} file
 * @returns {{ id: string, title: string, href: string, image: string, imageSet: { url: string, width: number, type: string }[] }[]}
 */
export function loadSunoSongs(file) {
  const snapshot = JSON.parse(fs.readFileSync(file, 'utf8'));
  return songsFromSnapshot(snapshot);
}

/**
 * @param {{ url: string, width: number, type: string }[]} set
 * @param {string} type
 * @returns {string}
 */
function coverSrcset(set, type) {
  const items = set.filter((item) => item.type === type).sort((a, b) => a.width - b.width);
  if (type !== 'image/jpeg' && !items.some((item) => item.width >= 300)) return '';
  if (type === 'image/jpeg' && !items.some((item) => item.width < 300)) return '';
  return items.map((item) => `${item.url} ${item.width}w`).join(', ');
}

/**
 * @param {{ title: string, image: string, imageSet: { url: string, width: number, type: string }[] }} song
 * @param {boolean} lazy
 * @returns {string}
 */
function coverImg(song, lazy) {
  const loading = lazy ? ' loading="lazy"' : '';
  const set = song.imageSet.slice();
  if (!set.some((item) => item.type === 'image/jpeg' && item.url === song.image && item.width === 300)) {
    set.push({ url: song.image, width: 300, type: 'image/jpeg' });
  }
  const sources = ['image/avif', 'image/webp'].map((type) => {
    const srcset = coverSrcset(set, type);
    return srcset ? `<source type="${type}" srcset="${esc(srcset)}" sizes="${COVER_SIZES}">` : '';
  }).join('');
  const jpegSet = coverSrcset(set, 'image/jpeg');
  const srcset = jpegSet ? ` srcset="${esc(jpegSet)}" sizes="${COVER_SIZES}"` : '';
  const img = `<img src="${esc(song.image)}"${srcset} alt="${esc(song.title)}" width="300" height="300"${loading} decoding="async">`;
  return sources ? `<picture>${sources}${img}</picture>` : img;
}

/**
 * Cover grid, then the titles. The first row is eager. The rest are lazy.
 *
 * @param {{ id: string, title: string, href: string, image: string, imageSet: { url: string, width: number, type: string }[] }[]} songs
 * @returns {string}
 */
export function renderSunoSongs(songs) {
  if (!songs.length) return '';
  const tiles = songs.map((song, index) => {
    const img = coverImg(song, index >= 5);
    return `<a class="album-tile" href="${esc(song.href)}"${relFor(song.href)}>${img}</a>`;
  }).join('');
  const items = songs.map((song) => `<li><span class="what"><a href="${esc(song.href)}"${relFor(song.href)}>${esc(song.title)}</a></span></li>`).join('\n          ');
  return `<div class="album-charts"><div class="album-grid">${tiles}</div></div>
      <ol class="tracks">
          ${items}
      </ol>`;
}
