// Pages from site/verbs.ts. String HTML, no React.

import { verbs, verbPath, verbHeading, unsharedPlayer, unsharedContact } from './verbs.ts';
import { esc, relFor, safeUrl } from '../lib/safe-url.js';

const LETTERBOXD = 'https://letterboxd.com/mattdoes/';
const LASTFM = 'https://www.last.fm/user/djverism';
const SPOTIFY = 'https://open.spotify.com/artist/617fKVTXkDafXJshlNUzF3';
// Catalog id only. The platform slug is omitted until the project name is settled.
const APPLE = 'https://music.apple.com/us/artist/1676956374';
const LUCIA_MAIL = 'mailto:luciadoes@mail.grokbot.com';

/**
 * Newest watchedDate first. The build already sorts; this keeps the preview honest.
 *
 * @param {object[]} watches
 * @returns {object | undefined}
 */
function latestWatch(watches) {
  const list = (Array.isArray(watches) ? watches : []).filter((row) => row && row.title);
  return list.slice().sort((a, b) => String(b.watchedDate || '').localeCompare(String(a.watchedDate || '')))[0];
}

/**
 * @param {object[]} tracks
 * @returns {object[]}
 */
function listeningRows(tracks) {
  const rows = (Array.isArray(tracks) ? tracks : []).filter((row) => row && (row.track || row.artist));
  const live = rows.filter((row) => row.nowPlaying);
  const rest = rows
    .filter((row) => !row.nowPlaying && row.date)
    .slice()
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  return [...live, ...rest].slice(0, 25);
}

/**
 * @param {unknown} rating
 * @returns {string}
 */
function starLabel(rating) {
  const n = Number(rating);
  if (!Number.isFinite(n) || n <= 0) return '';
  const shown = Number.isInteger(n) ? String(n) : String(n);
  return `${shown} out of 5 stars`;
}

/**
 * https links only. javascript: and other schemes become no href.
 *
 * @param {unknown} link
 * @returns {string}
 */
function httpsHref(link) {
  const safe = safeUrl(link);
  return /^https:\/\//i.test(safe) ? safe : '';
}

/**
 * @param {string} href
 * @param {string} text
 * @returns {string}
 */
function link(href, text) {
  return `<a href="${esc(href)}"${relFor(href)}>${esc(text)}</a>`;
}

/**
 * https URL on bandcamp.com only. Anything else is not a player.
 *
 * @param {unknown} url
 * @returns {string}
 */
export function bandcampSrc(url) {
  if (typeof url !== 'string' || !url.trim()) return '';
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return '';
  }
  if (parsed.protocol !== 'https:') return '';
  if (parsed.username || parsed.password) return '';
  if (!/(^|\.)bandcamp\.com$/i.test(parsed.hostname)) return '';
  return parsed.href;
}

/**
 * A bare mailbox. Anything else is not a public contact.
 *
 * @param {unknown} email
 * @returns {string}
 */
export function contactAddress(email) {
  if (typeof email !== 'string') return '';
  const value = email.trim();
  if (!/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(value)) return '';
  return value;
}

/**
 * The contact block. Empty when no address is configured.
 *
 * @param {unknown} email
 * @returns {string}
 */
export function contactBlock(email) {
  const address = contactAddress(email);
  if (!address) return '';
  const href = `mailto:${address}`;
  return `<section class="contact">
        <h2>Contact</h2>
        <p><a href="${esc(href)}">${esc(address)}</a></p>
      </section>`;
}

/**
 * The player slot. Empty when no Bandcamp URL is configured.
 *
 * @param {unknown} url
 * @returns {string}
 */
export function bandcampSlot(url) {
  const src = bandcampSrc(url);
  if (!src) return '';
  return `<section class="players" aria-labelledby="player-heading">
        <h2 id="player-heading">Player</h2>
        <div class="slot">
          <iframe title="Bandcamp" src="${esc(src)}" loading="lazy" referrerpolicy="no-referrer"></iframe>
        </div>
      </section>`;
}

/**
 * A plain bar. The summary has no visible words. The next step is the link inside.
 *
 * @param {string} href
 * @param {string} name accessible name, also the opened link text
 * @returns {string}
 */
function bar(href, name) {
  return `<details class="redaction">
        <summary>
          <span class="redaction-bar" aria-hidden="true"></span>
          <span class="redaction-hint">${esc(name)}</span>
        </summary>
        <div class="redaction-body">
          <p>${link(href, name)}</p>
        </div>
      </details>`;
}

/**
 * @param {string} current slug or ''
 * @returns {string}
 */
function verbNav(current) {
  const links = verbs.map((verb) => {
    const currentAttr = verb.slug === current ? ' aria-current="page"' : '';
    const heading = verbHeading(verb.label);
    return `<a href="${verbPath(verb.slug)}"${currentAttr}>${esc(heading)}</a>`;
  }).join('\n          ');
  return `<nav class="verb-nav" aria-label="verbs">
          ${links}
        </nav>`;
}

/**
 * @param {object} page
 * @returns {string}
 */
function shell({
  siteUrl,
  assets,
  path,
  title,
  description,
  polarity,
  current,
  showVerbNav,
  robots,
  main,
}) {
  const css = assets['station.css'];
  const js = assets['station.js'];
  if (!css || !js) throw new Error('station.css and station.js must be in the asset map.');
  const canonical = `${siteUrl}${path}`;
  const polarityAttr = polarity === 'flip' ? ' data-polarity="flip"' : '';
  const robotsMeta = robots ? `\n    <meta name="robots" content="${esc(robots)}">` : '';
  const nav = showVerbNav ? verbNav(current) : '';
  const home = path === '/' ? '' : '<p class="home-link"><a href="/">home</a></p>';
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${esc(title)}</title>
    <meta name="description" content="${esc(description)}">
    <link rel="canonical" href="${esc(canonical)}">
    <link rel="icon" href="/favicon.svg" type="image/svg+xml">
    <meta property="og:title" content="${esc(title)}">
    <meta property="og:description" content="${esc(description)}">
    <meta property="og:url" content="${esc(canonical)}">
    <meta property="og:type" content="website">${robotsMeta}
    <link rel="stylesheet" href="/${esc(css)}">
  </head>
  <body data-root="/"${polarityAttr}>
    <a class="skip-link" href="#main">Skip to content</a>
    <main id="main">
      ${main}
    </main>
    <footer class="site-footer">
      ${home}
      ${nav}
    </footer>
    <script src="/${esc(js)}" defer></script>
  </body>
</html>
`;
}

/**
 * Title plus stars, inline. No stars when the film is unrated.
 *
 * @param {object | undefined} watch
 * @returns {string}
 */
function watchPreview(watch) {
  if (!watch) return '';
  const href = httpsHref(watch.link);
  const title = esc(watch.title);
  const name = href ? `<a href="${esc(href)}"${relFor(href)}>${title}</a>` : title;
  const stars = watch.stars ? String(watch.stars) : '';
  const label = starLabel(watch.rating);
  const rating = stars
    ? ` <span class="stars" role="img"${label ? ` aria-label="${esc(label)}"` : ''}>${esc(stars)}</span>`
    : '';
  return `<span class="preview">${name}${rating}</span>`;
}

/**
 * @param {object} ctx
 * @returns {string}
 */
export function renderHome(ctx) {
  const recent = latestWatch(ctx.watches);
  const items = verbs.map((verb) => {
    const heading = verbHeading(verb.label);
    const preview = verb.slug === 'watching' ? watchPreview(recent) : '';
    return `<li class="verb-row">
          <a class="verb" href="${verbPath(verb.slug)}">${esc(heading)}</a>
          ${preview}
        </li>`;
  }).join('\n        ');
  return shell({
    ...ctx,
    path: '/',
    title: 'mattdoes.online',
    description: 'matt does letterboxd, last.fm, and unshared.',
    polarity: 'field',
    current: '',
    showVerbNav: false,
    robots: '',
    main: `<nav aria-label="verbs">
        <ol class="verbs">
        ${items}
        </ol>
      </nav>
      ${bar('/unshared/', 'unshared')}`,
  });
}

/**
 * Only our media host. A Letterboxd URL that was not mirrored stays off the page.
 *
 * @param {unknown} url
 * @returns {string}
 */
function servedPoster(url) {
  let parsed;
  try { parsed = new URL(String(url || '')); } catch { return ''; }
  if (parsed.protocol !== 'https:' || parsed.hostname !== 'media.mattdoes.online') return '';
  return parsed.toString();
}

/**
 * @param {object} watch
 * @param {number} index
 * @returns {string}
 */
function film(watch, index) {
  const href = httpsHref(watch.link);
  const title = esc(watch.title || 'Untitled');
  const heading = href ? `<a href="${esc(href)}"${relFor(href)}>${title}</a>` : title;
  const year = watch.year ? `<p class="meta">${esc(watch.year)}</p>` : '';
  const stars = watch.stars
    ? `<p class="meta"><span class="stars" role="img"${starLabel(watch.rating) ? ` aria-label="${esc(starLabel(watch.rating))}"` : ''}>${esc(watch.stars)}</span>${watch.rewatch ? ' <span class="flag">rewatch</span>' : ''}</p>`
    : (watch.rewatch ? '<p class="meta"><span class="flag">rewatch</span></p>' : '');
  const review = watch.review ? `<p class="statement">${esc(watch.review)}</p>` : '';
  const poster = servedPoster(watch.poster);
  const dims = watch.posterWidth && watch.posterHeight
    ? ` width="${Number(watch.posterWidth)}" height="${Number(watch.posterHeight)}"`
    : '';
  const loading = index === 0 ? 'eager' : 'lazy';
  const priority = index === 0 ? ' fetchpriority="high"' : '';
  const still = poster
    ? `<figure class="evidence"><img src="${esc(poster)}" alt="${esc(`Poster for ${watch.title || 'this film'}`)}"${dims} loading="${loading}"${priority}></figure>`
    : '';
  return `<li class="incident">
        <div>
          <h2>${heading}</h2>
          ${year}
          ${stars}
        </div>
        ${review}
        ${still}
      </li>`;
}

/**
 * @param {object} ctx
 * @returns {string}
 */
function verbByRenderer(renderer) {
  const verb = verbs.find((item) => item.renderer === renderer);
  if (!verb) throw new Error(`verb registry: missing verb for renderer "${renderer}"`);
  return verb;
}

export function renderWatch(ctx) {
  const watches = Array.isArray(ctx.watches) ? ctx.watches : [];
  const verb = verbByRenderer('watch');
  const heading = verbHeading(verb.label);
  const feed = `<ol class="feed">
        ${watches.map(film).join('\n        ')}
      </ol>`;
  return shell({
    ...ctx,
    path: verbPath(verb.slug),
    title: `${heading} · mattdoes.online`,
    description: heading,
    polarity: 'flip',
    current: verb.slug,
    showVerbNav: true,
    robots: '',
    main: `<h1 class="sign">${esc(heading)}</h1>
      <p class="credit">${link(LETTERBOXD, 'Letterboxd')}</p>
      ${feed}`,
  });
}

/**
 * @param {object} row
 * @returns {string}
 */
function trackItem(row) {
  const href = httpsHref(row.link);
  const title = esc(row.track || 'Untitled');
  const what = href ? `<a href="${esc(href)}"${relFor(href)}>${title}</a>` : title;
  const album = row.album ? `<span class="album">${esc(row.album)}</span>` : '';
  return `<li>
          <span class="what">${what}</span>
          <span class="by">${esc(row.artist || '')}</span>
          ${album}
        </li>`;
}

/**
 * @param {object} ctx
 * @returns {string}
 */
export function renderListen(ctx) {
  const rows = listeningRows(ctx.tracks);
  const verb = verbByRenderer('listen');
  const heading = verbHeading(verb.label);
  const list = `<ol class="tracks" id="tracks">
        ${rows.map(trackItem).join('\n        ')}
      </ol>`;
  return shell({
    ...ctx,
    path: verbPath(verb.slug),
    title: `${heading} · mattdoes.online`,
    description: heading,
    polarity: 'flip',
    current: verb.slug,
    showVerbNav: true,
    robots: '',
    main: `<h1 class="sign">${esc(heading)}</h1>
      <p class="credit">${link(LASTFM, 'Last.fm')}</p>
      ${list}`,
  });
}

/**
 * @param {object} ctx
 * @returns {string}
 */
export function renderUnshared(ctx) {
  const verb = verbByRenderer('unshared');
  const heading = verbHeading(verb.label);
  return shell({
    ...ctx,
    path: verbPath(verb.slug),
    title: `${heading} · mattdoes.online`,
    description: 'Fun is unshared.',
    polarity: 'flip',
    current: verb.slug,
    showVerbNav: true,
    robots: '',
    main: `<h1 class="sign">${esc(heading)}</h1>
      <p class="lede">Fun is unshared</p>
      ${contactBlock(unsharedContact.email)}
      ${bandcampSlot(unsharedPlayer.bandcamp)}
      <ul class="outlinks">
        <li>${link(APPLE, 'Apple Music')}</li>
        <li>${link(SPOTIFY, 'Spotify')}</li>
      </ul>
      ${bar('/frequency/', 'frequency')}`,
  });
}

/**
 * Secret page. noindex. The prize mailto lives only here.
 *
 * @param {object} ctx
 * @returns {string}
 */
export function renderFrequency(ctx) {
  return shell({
    ...ctx,
    path: '/frequency/',
    title: 'mattdoes.online',
    description: 'mattdoes.online',
    polarity: 'field',
    current: '',
    showVerbNav: true,
    robots: 'noindex',
    main: `<p class="prize-line"><a href="${LUCIA_MAIL}">luciadoes@mail.grokbot.com</a></p>`,
  });
}

/**
 * @param {object} ctx
 * @returns {string}
 */
export function renderNotFound(ctx) {
  return shell({
    ...ctx,
    path: '/404.html',
    title: 'not found · mattdoes.online',
    description: 'Not found.',
    polarity: 'field',
    current: '',
    showVerbNav: true,
    robots: 'noindex',
    main: '<h1 class="sign">not found</h1>',
  });
}

export const renderers = {
  watch: renderWatch,
  listen: renderListen,
  unshared: renderUnshared,
};
