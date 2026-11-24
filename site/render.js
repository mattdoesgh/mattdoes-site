// Pages from site/verbs.ts. String HTML, no React.

import { verbs, verbCatalog, socials, verbPath, verbHeading, surfaceWords } from './verbs.ts';
import { renderHubDocument } from '../concepts/hub.js';
import { socialIcon } from './social-icons.js';
import { esc, relFor, safeUrl } from '../lib/safe-url.js';
import { renderHomeSuno } from '../lib/suno-songs.js';

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
 * https on letterboxd.com only. The scene link is not a general web link.
 *
 * @param {unknown} link
 * @returns {string}
 */
function letterboxdHref(link) {
  const href = httpsHref(link);
  if (!href) return '';
  try {
    const url = new URL(href);
    if (url.protocol !== 'https:' || url.username || url.password) return '';
    const host = url.hostname.toLowerCase();
    if (host !== 'letterboxd.com' && host !== 'www.letterboxd.com') return '';
    return url.toString();
  } catch {
    return '';
  }
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
  blocking = '',
  extraStyles = [],
  extraScripts = [],
}) {
  const css = assets['station.css'];
  const js = assets['station.js'];
  if (!css || !js) throw new Error('station.css and station.js must be in the asset map.');
  const styleLinks = extraStyles.map((name) => {
    const file = assets[name];
    if (!file) throw new Error(`${name} must be in the asset map.`);
    return `\n    <link rel="stylesheet" href="/${esc(file)}">`;
  }).join('');
  const scriptTags = extraScripts.map((name) => {
    const file = assets[name];
    if (!file) throw new Error(`${name} must be in the asset map.`);
    return `\n    <script src="/${esc(file)}" defer></script>`;
  }).join('');
  const canonical = `${siteUrl}${path}`;
  const polarityAttr = polarity === 'flip' || polarity === 'ether' ? ` data-polarity="${polarity}"` : '';
  const robotsMeta = robots ? `\n    <meta name="robots" content="${esc(robots)}">` : '';
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
    <title>${esc(title)}</title>
    <meta name="description" content="${esc(description)}">
    <link rel="canonical" href="${esc(canonical)}">
    <link rel="icon" href="/favicon.svg" type="image/svg+xml">
    <meta property="og:title" content="${esc(title)}">
    <meta property="og:description" content="${esc(description)}">
    <meta property="og:url" content="${esc(canonical)}">
    <meta property="og:type" content="website">${robotsMeta}
    <link rel="stylesheet" href="/${esc(css)}">${styleLinks}${blocking}
  </head>
  <body data-root="/"${polarityAttr}>
    <a class="skip-link" href="#main">Skip to content</a>
    <main id="main">
      ${main}
    </main>
    <footer class="site-footer">
      ${socialNav()}
    </footer>
    <script src="/${esc(js)}" defer></script>${scriptTags}
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
 * The ether. hero.js draws the scene into the canvas: the name half under a
 * water line, the surface words drifting through it, and a summoning circle
 * around it. The heading stays the name for readers and for a page without
 * the script. The verb menu sits inside the scene as the prompt.
 *
 * @param {string} menu
 * @returns {string}
 */
function renderHero(menu) {
  const words = esc(surfaceWords.join('|'));
  return `<section class="hero" data-hero>
        <div class="hero-pin">
          <h1 class="hero-word"><span class="hero-above">matt does</span><span class="hero-below" aria-hidden="true">matt does</span></h1>
          <canvas class="hero-water" aria-hidden="true" data-words="${words}"></canvas>
          <p class="hero-log" aria-hidden="true"></p>
          ${menu}
        </div>
      </section>`;
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
  const menuRows = `${items}\n        ${renderHomeSuno()}`;
  return shell({
    ...ctx,
    path: '/',
    title: 'mattdoes.online',
    description: homeDescription(),
    polarity: 'field',
    current: '',
    showVerbNav: false,
    robots: '',
    extraStyles: ['hero.css'],
    extraScripts: ['hero.js'],
    main: renderHero(`<nav aria-label="verbs" class="hero-prompt">
            <p class="verb-kicker" aria-hidden="true">${esc(kicker)}</p>
            <ol class="verbs">
            ${menuRows}
            </ol>
          </nav>`),
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
/**
 * Positive intrinsic size, or '' so a missing measurement is omitted.
 *
 * @param {string} name
 * @param {unknown} value
 * @returns {string}
 */
function dimAttr(name, value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return '';
  return ` ${name}="${Math.round(n)}"`;
}

/**
 * One film in the strip. The review stays off the card. The wide poster
 * is a data attribute until the scene opens.
 *
 * @param {object} watch
 * @param {number} index
 * @returns {string}
 */
function film(watch, index) {
  const href = httpsHref(watch.link);
  const title = esc(watch.title || 'Untitled');
  const stars = starsMarkup(watch.stars, watch.rating);
  const flag = watch.rewatch ? '<span class="flag">rewatch</span>' : '';
  const rating = (stars || flag) ? `<span class="meta">${stars}${flag ? ` ${flag}` : ''}</span>` : '';
  const poster = servedPoster(watch.poster);
  const full = servedPoster(watch.posterFull) || poster;
  const dims = `${dimAttr('width', watch.posterWidth)}${dimAttr('height', watch.posterHeight)}`;
  const loading = index === 0 ? 'eager' : 'lazy';
  const priority = index === 0 ? ' fetchpriority="high"' : '';
  const still = poster
    ? `<img data-src="${esc(poster)}" alt=""${dims} loading="${loading}" decoding="async"${priority}>`
    : '';
  const review = watch.review ? ` data-review="${esc(String(watch.review).replace(/\s+/g, ' ').trim())}"` : '';
  const year = watch.year ? ` data-year="${esc(watch.year)}"` : '';
  const rewatch = watch.rewatch ? ' data-rewatch="1"' : '';
  const fullAttr = full
    ? ` data-full="${esc(full)}"${dimAttr('data-full-width', watch.posterFullWidth || watch.posterWidth)}${dimAttr('data-full-height', watch.posterFullHeight || watch.posterHeight)}`
    : '';
  const attrs = `class="film-open" data-scene="${index}" aria-haspopup="dialog" aria-controls="scene" aria-expanded="false"${review}${year}${rewatch}${fullAttr}`;
  const inner = `${still}<span class="copy"><span class="name">${title}</span>${rating}</span>`;
  const control = href
    ? `<a ${attrs} href="${esc(href)}"${relFor(href)}>${inner}</a>`
    : `<button type="button" ${attrs}>${inner}</button>`;
  return `<li class="film">
        ${control}
      </li>`;
}

/**
 * The closed scene. Rendered only when there is a film, and after the
 * feed so the watch head's sibling stays the strip. The wide image is
 * not in the tree until the scene opens.
 *
 * @param {object[]} watches
 * @returns {string}
 */
function scene(watches) {
  if (!watches.length) return '';
  const title = esc(watches[0].title || 'Untitled');
  const href = letterboxdHref(watches[0].link);
  const source = href
    ? `<p class="scene-source" hidden><a id="scene-link" href="${esc(href)}" rel="noopener noreferrer">letterboxd</a></p>`
    : '<p class="scene-source" hidden></p>';
  return `<dialog id="scene" class="scene" hidden aria-modal="true" aria-labelledby="scene-title">
      <div class="scene-panel">
        <button type="button" class="scene-close">close</button>
        <figure class="scene-still"></figure>
        <div class="scene-copy">
          <h2 id="scene-title" class="scene-title">${title}</h2>
          <p id="scene-year" class="scene-year" hidden></p>
          <p id="scene-rate" class="scene-rate" hidden></p>
          <p id="scene-review" class="statement" hidden></p>
          ${source}
        </div>
      </div>
    </dialog>`;
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

/**
 * Parser-blocking prefs. Omitted when the asset map has no file, so a
 * partial render in a unit test still builds. The hashed file is external:
 * the CSP does not allow an inline script.
 *
 * @param {Record<string, string>} assets
 * @returns {string}
 */
function posterPrefsTag(assets) {
  const src = assets && assets['poster-prefs.js'];
  if (!src) return '';
  return `\n    <script src="/${esc(src)}"></script>`;
}

/**
 * Posters on or off, and the strip's direction. Both words of each switch
 * are visible. A zero-width space separates those words so the accessible
 * name can contain them in order. aria-pressed is the state. Defaults match
 * the server HTML: posters on, across.
 *
 * @returns {string}
 */
function posterControls() {
  return `<span class="poster-controls" role="group" aria-label="poster strip"><button type="button" class="poster-switch" data-posters-toggle aria-pressed="true" aria-controls="feed" aria-label="posters on off"><span class="poster-key">posters\u200B</span><span class="poster-track"><span class="poster-seg poster-on">on\u200B</span><span class="poster-seg poster-off">off</span></span></button><button type="button" class="poster-switch" data-axis-toggle aria-pressed="false" aria-controls="feed" aria-label="layout across down"><span class="poster-key">layout\u200B</span><span class="poster-track"><span class="poster-seg axis-across">across\u200B</span><span class="poster-seg axis-down">down</span></span></button></span>`;
}

/**
 * Count on the left, controls on the right. The count line stays a
 * `.total` so it keeps the films wave. A missing count leaves the controls.
 *
 * @param {string} count
 * @returns {string}
 */
/**
 * The glyph band that crowns a verb page. static/ether.js draws a summoning
 * circle into it, ringed by the page's word. Decoration only.
 *
 * @param {string} word
 * @returns {string}
 */
export function etherBand(word) {
  return `<canvas class="ether-band" aria-hidden="true" data-word="${esc(word)}"></canvas>`;
}

function watchHead(count) {
  const line = count ? `\n        ${count}` : '';
  return `<div class="watch-head">${line}
        ${posterControls()}
      </div>`;
}

/**
 * The live region speaks a layout change. The pull hint is visual only.
 * Both sit after the scene so the feed's next sibling stays the dialog.
 *
 * @returns {string}
 */
function watchStatus() {
  return `<p class="layout-live" aria-live="polite"></p>
      <p class="pull-hint" aria-hidden="true"><span class="pull-hint-label">pull for down</span><span class="pull-hint-bar"></span></p>`;
}

export function renderWatch(ctx) {
  const watches = Array.isArray(ctx.watches) ? ctx.watches : [];
  const verb = verbByRenderer('watch');
  const heading = verbHeading(verb.label);
  const feed = `<ol class="feed" id="feed">
        ${watches.map(film).join('\n        ')}
      </ol>`;
  const count = countLine(ctx.filmCount, 'films');
  return shell({
    ...ctx,
    path: verbPath(verb.slug),
    title: `${heading} · mattdoes.online`,
    description: heading,
    polarity: 'ether',
    current: verb.slug,
    showVerbNav: true,
    robots: '',
    blocking: posterPrefsTag(ctx.assets),
    extraStyles: ['ether.css'],
    extraScripts: ['ether.js'],
    main: `${etherBand(verb.label)}
      <h1 class="sign"><a href="/">${esc(heading)}</a></h1>
      ${watchHead(count)}
      ${feed}
      ${scene(watches)}
      ${watchStatus()}`,
  });
}

/** The only words that take the wave. Anything else stays plain. */
const WAVE_WORDS = new Set(['films']);

/**
 * The word beside a count. Letters ride `.wave` only for films.
 * The spoken copy stays in the accessibility tree; the painted letters are
 * hidden from it.
 *
 * @param {string} word
 * @returns {string}
 */
function waveLabel(word) {
  const spoken = `<span class="total-spoken">${esc(word)}</span>`;
  if (!WAVE_WORDS.has(word)) return `<span class="total-label">${spoken}</span>`;
  const letters = [...word].map((ch) => `<span>${esc(ch)}</span>`).join('');
  return `<span class="total-label">${spoken}<span class="wave" aria-hidden="true">${letters}</span></span>`;
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
  return `<p class="total"><span class="total-num">${esc(Number(count || 0).toLocaleString('en-US'))}</span> ${waveLabel(word)}</p>`;
}

/** The published hub. Song art is the committed Suno snapshot. No mailbox or player. */
export function renderUnshared(ctx) {
  return renderHubDocument(ctx && ctx.siteUrl, ctx && ctx.assets);
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
  unshared: renderUnshared,
};
