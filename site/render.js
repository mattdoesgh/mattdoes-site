// Pages from site/verbs.ts. String HTML, no React.

import { verbs, verbCatalog, socials, verbPath, verbHeading, unsharedPlayer, unsharedContact, unsharedEnabled, SECRET_PATHS } from './verbs.ts';
import { socialIcon } from './social-icons.js';
import { esc, relFor, safeUrl } from '../lib/safe-url.js';
import { formatScrobbleCount } from '../lib/format.js';
import { COVER_SPARES, LISTENING_PERIODS, TOP_LIMIT, albumImageUrl, albumsWithCovers, musicUrl } from '../lib/lastfm.js';

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

const FULL_STAR = '★';
const HALF_MARK = '½';

/**
 * The diary string is ★ plus a trailing ½. The fraction is drawn as the
 * left half of a ★ (same glyph, clipped in CSS) so it is not a separate
 * character and does not depend on a half-star codepoint. The outer box
 * carries the cut line; the inner glyph is the clipped fill.
 *
 * @param {unknown} stars
 * @returns {string}
 */
function starGlyphs(stars) {
  const value = String(stars ?? '');
  if (!value) return '';
  const half = value.endsWith(HALF_MARK);
  const full = half ? value.slice(0, -HALF_MARK.length) : value;
  if ([...full].some((ch) => ch !== FULL_STAR)) return esc(value);
  const clipped = half
    ? `<span class="star-half"><span class="star-glyph">${FULL_STAR}</span></span>`
    : '';
  return `${full}${clipped}`;
}

/**
 * @param {unknown} stars
 * @param {unknown} rating
 * @returns {string}
 */
function starsMarkup(stars, rating) {
  const glyphs = starGlyphs(stars);
  if (!glyphs) return '';
  const label = starLabel(rating);
  const named = label ? ` aria-label="${esc(label)}"` : '';
  return `<span class="stars" role="img"${named}>${glyphs}</span>`;
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
 * The same outlink as Apple Music and Spotify. Visible text is "email".
 *
 * @param {unknown} email
 * @returns {string}
 */
function emailOutlink(email) {
  const address = contactAddress(email);
  if (!address) return '';
  return `<li><a href="${esc(`mailto:${address}`)}" aria-label="email unshared">email</a></li>`;
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
 * Quiet footer row of brand marks. The accessible name is the aria-label.
 * rel="me" marks these as the same person. Same tab.
 * Not the shared https helper: that adds noreferrer and drops me.
 *
 * @returns {string}
 */
function socialNav() {
  const links = socials.map((item) =>
    `<a href="${esc(item.href)}" rel="me noopener" aria-label="${esc(item.label)}">${socialIcon(item.label)}</a>`,
  ).join('\n          ');
  return `<nav class="socials" aria-label="socials">
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
  robots,
  main,
}) {
  const css = assets['station.css'];
  const js = assets['station.js'];
  if (!css || !js) throw new Error('station.css and station.js must be in the asset map.');
  const canonical = `${siteUrl}${path}`;
  const polarityAttr = polarity === 'flip' ? ' data-polarity="flip"' : '';
  const robotsMeta = robots ? `\n    <meta name="robots" content="${esc(robots)}">` : '';
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
      ${socialNav()}
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
  const stars = starsMarkup(watch.stars, watch.rating);
  const rating = stars ? ` ${stars}` : '';
  return `<span class="preview">${name}${rating}</span>`;
}

/**
 * Names the published verbs. Two read as "a and b"; more use a serial comma.
 *
 * @returns {string}
 */
function homeDescription() {
  const labels = verbs.map((verb) => verb.label);
  if (labels.length < 2) return `matt does ${labels.join('')}.`;
  if (labels.length === 2) return `matt does ${labels[0]} and ${labels[1]}.`;
  return `matt does ${labels.slice(0, -1).join(', ')}, and ${labels[labels.length - 1]}.`;
}

/**
 * @param {object} ctx
 * @returns {string}
 */
export function renderHome(ctx) {
  const recent = latestWatch(ctx.watches);
  const kicker = verbHeading(verbs[0].label).slice(0, -verbs[0].label.length).trim();
  const items = verbs.map((verb) => {
    const heading = verbHeading(verb.label);
    const prefix = heading.slice(0, heading.length - verb.label.length);
    const preview = verb.slug === 'watching' ? watchPreview(recent) : '';
    return `<li class="verb-row">
          <a class="verb" href="${verbPath(verb.slug)}"><span class="verb-prefix"><span>${esc(prefix)}</span></span><span class="verb-label">${esc(verb.label)}</span></a>
          ${preview}
        </li>`;
  }).join('\n        ');
  return shell({
    ...ctx,
    path: '/',
    title: 'mattdoes.online',
    description: homeDescription(),
    polarity: 'field',
    current: '',
    showVerbNav: false,
    robots: '',
    main: `<nav aria-label="verbs">
        <p class="verb-kicker" aria-hidden="true">${esc(kicker)}</p>
        <ol class="verbs">
        ${items}
        </ol>
      </nav>
      ${unsharedEnabled ? bar('/unshared/', 'unshared') : ''}`,
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
  const stars = starsMarkup(watch.stars, watch.rating);
  const rating = stars
    ? `<p class="meta">${stars}${watch.rewatch ? ' <span class="flag">rewatch</span>' : ''}</p>`
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
          ${rating}
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
  const verb = verbCatalog.find((item) => item.renderer === renderer);
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
  const count = countLine(ctx.filmCount, 'films');
  return shell({
    ...ctx,
    path: verbPath(verb.slug),
    title: `${heading} · mattdoes.online`,
    description: heading,
    polarity: 'flip',
    current: verb.slug,
    showVerbNav: true,
    robots: '',
    main: `<h1 class="sign"><a href="/">${esc(heading)}</a></h1>
      ${count}
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
 * Accessible cover label. The em dash is the separator the page speaks.
 *
 * @param {string} name
 * @param {string} artist
 * @returns {string}
 */
function albumLabel(name, artist) {
  return artist ? `${name} — ${artist}` : name;
}

/**
 * One cover tile. Albums with no real art are omitted. Play counts are not printed.
 *
 * @param {object} row
 * @returns {string}
 */
function albumTile(row) {
  const name = String(row?.name || '').trim();
  if (!name) return '';
  const image = albumImageUrl(row?.image);
  if (!image) return '';
  const artist = String(row?.artist || '').trim();
  const label = albumLabel(name, artist);
  const href = musicUrl(row?.url);
  const cap = `<span class="album-cap"><span class="album-name">${esc(name)}</span>${
    artist ? `<span class="album-by">${esc(artist)}</span>` : ''
  }</span>`;
  const img = `<img src="${esc(image)}" alt="${esc(label)}" width="300" height="300" loading="lazy" decoding="async">`;
  const title = ` title="${esc(label)}"`;
  if (href) return `<a class="album-tile" href="${esc(href)}"${relFor(href)}${title}>${img}${cap}</a>`;
  return `<div class="album-tile"${title}>${img}${cap}</div>`;
}

/**
 * The monthly cover grid. Other periods are not drawn. Albums with no real
 * cover are skipped and later rows fill the empty slots. The first 25 covers
 * are the cells. Further covers sit hidden so a cover that fails in the
 * browser can take that same cell. A short chart ends on the last real cover.
 *
 * @param {unknown} periods
 * @returns {string}
 */
function albumGrid(periods) {
  if (!periods || typeof periods !== 'object') return '';
  const id = LISTENING_PERIODS[0]?.id;
  if (!id) return '';
  const rows = Array.isArray(periods[id]?.albums) ? periods[id].albums : [];
  const tiles = albumsWithCovers(rows, TOP_LIMIT + COVER_SPARES).map(albumTile).filter(Boolean);
  if (!tiles.length) return '';
  const shown = tiles.slice(0, TOP_LIMIT);
  const spares = tiles.slice(TOP_LIMIT);
  const spareBox = spares.length
    ? `<div class="album-spares" hidden>${spares.join('')}</div>`
    : '';
  return `<div class="album-charts"><div class="album-grid">${shown.join('')}</div>${spareBox}</div>`;
}

/**
 * The word beside a count. Both totals use this. Letters are the static sine
 * in `.wave`. The spoken copy stays in the accessibility tree; the painted
 * letters are hidden from it.
 *
 * @param {string} word
 * @returns {string}
 */
function waveLabel(word) {
  const letters = [...word].map((ch) => `<span>${esc(ch)}</span>`).join('');
  return `<span class="total-label"><span class="total-spoken">${esc(word)}</span><span class="wave" aria-hidden="true">${letters}</span></span>`;
}

/**
 * Big number, word on the same line. Missing or zero hides the line.
 *
 * @param {unknown} count
 * @param {string} word
 * @returns {string}
 */
function countLine(count, word) {
  if (!(Number(count) > 0)) return '';
  return `<p class="total"><span class="total-num">${esc(formatScrobbleCount(count))}</span> ${waveLabel(word)}</p>`;
}

export function renderListen(ctx) {
  const rows = listeningRows(ctx.tracks);
  const verb = verbByRenderer('listen');
  const heading = verbHeading(verb.label);
  const charts = albumGrid(ctx.periods);
  const count = countLine(ctx.playcount, 'scrobbles');
  const recent = rows.length ? '<h2 class="recent-label">recent</h2>' : '';
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
    main: `<h1 class="sign"><a href="/">${esc(heading)}</a></h1>
      ${count}
      ${charts}
      ${recent}
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
    main: `<h1 class="sign"><a href="/">${esc(heading)}</a></h1>
      <p class="lede">Fun is unshared</p>
      ${bandcampSlot(unsharedPlayer.bandcamp)}
      <ul class="outlinks">
        ${emailOutlink(unsharedContact.email)}
        <li>${link(APPLE, 'Apple Music')}</li>
        <li>${link(SPOTIFY, 'Spotify')}</li>
      </ul>
      ${SECRET_PATHS.includes('/frequency/') ? bar('/frequency/', 'frequency') : ''}`,
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
    main: '<h1 class="sign"><a href="/">not found</a></h1>',
  });
}

export const renderers = {
  watch: renderWatch,
  listen: renderListen,
  unshared: renderUnshared,
};
