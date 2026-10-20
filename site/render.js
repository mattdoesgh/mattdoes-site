// Signal / Station pages. String HTML, no React. Routes come from site/verbs.ts.

import { verbs, verbPath, unsharedPlayer, unsharedContact } from './verbs.ts';
import { esc, relFor, safeUrl } from '../lib/safe-url.js';
import { formatScrobbleCount } from '../lib/format.js';

const LETTERBOXD = 'https://letterboxd.com/mattdoes';
const X = 'https://x.com/mattdoes';
const SPOTIFY = 'https://open.spotify.com/artist/617fKVTXkDafXJshlNUzF3';
// Catalog id only. The platform slug is omitted until the project name is settled.
const APPLE = 'https://music.apple.com/us/artist/1676956374';
const LUCIA_MAIL = 'mailto:luciadoes@mail.grokbot.com';

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
 * @param {object | undefined} row
 * @returns {string}
 */
function listenLine(row) {
  if (!row) return 'signal idle';
  const name = [row.artist, row.track].filter(Boolean).join(' — ');
  return row.nowPlaying ? `live · ${name}` : name;
}

/**
 * @param {object | undefined} watch
 * @returns {string}
 */
function watchLine(watch) {
  if (!watch) return 'no recent incident';
  return watch.year ? `${watch.title} (${watch.year})` : String(watch.title || 'untitled');
}

/**
 * @param {string} iso
 * @returns {string}
 */
function stamp(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
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
 * @param {string} bodyHtml
 * @returns {string}
 */
function redaction(bodyHtml) {
  return `<details class="redaction">
        <summary>
          <span class="redaction-bar" aria-hidden="true"></span>
          <span class="redaction-hint">Redacted. Activate to reveal.</span>
        </summary>
        <div class="redaction-body">
          ${bodyHtml}
        </div>
      </details>`;
}

/**
 * Public index. Mechanics only: no name, no address, no secret path.
 *
 * @param {boolean} open
 * @returns {string}
 */
function anomalies(open) {
  return `<details class="anomalies" id="anomalies"${open ? ' open' : ''}>
        <summary>Index of anomalies</summary>
        <ol>
          <li>AN-01. Redaction bars. A solid bar is a closed line. Reach it from the keyboard and press Enter, or use a pointer. It opens with scripts turned off.</li>
          <li>AN-02. A typed sequence, only while scripts run. With scripts off, the bars still open.</li>
        </ol>
      </details>`;
}

/**
 * @param {string} current slug or ''
 * @returns {string}
 */
function verbNav(current) {
  const links = verbs.map((verb) => {
    const currentAttr = verb.slug === current ? ' aria-current="page"' : '';
    return `<a href="${verbPath(verb.slug)}"${currentAttr}>${esc(verb.label)}</a>`;
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
  anomaliesOpen,
  robots,
  builtAt,
  main,
}) {
  const css = assets['station.css'];
  const js = assets['station.js'];
  if (!css || !js) throw new Error('station.css and station.js must be in the asset map.');
  const canonical = `${siteUrl}${path}`;
  const polarityAttr = polarity === 'flip' ? ' data-polarity="flip"' : '';
  const robotsMeta = robots ? `\n    <meta name="robots" content="${esc(robots)}">` : '';
  const nav = showVerbNav ? verbNav(current) : '';
  const homeMark = path === '/'
    ? '<span>STN · MATT</span>'
    : `<a href="/">STN · MATT</a>`;
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
    <p class="status">
      ${homeMark}
      <time class="time" datetime="${esc(builtAt)}">${esc(stamp(builtAt))}</time>
    </p>
    <main id="main">
      ${main}
    </main>
    <footer class="site-footer">
      ${nav}
      ${anomalies(anomaliesOpen)}
    </footer>
    <script src="/${esc(js)}" defer></script>
  </body>
</html>
`;
}

/**
 * @param {object} ctx
 * @returns {string}
 */
export function renderHome(ctx) {
  const rows = listeningRows(ctx.tracks);
  const teasers = {
    watch: watchLine(ctx.watches[0]),
    listen: listenLine(rows[0]),
    unshared: 'music project · restricted door',
  };
  const items = verbs.map((verb) => `<li>
          <a class="verb" href="${verbPath(verb.slug)}">
            <span class="verb-no">${esc(verb.number)}</span>
            <span>
              <span class="verb-name">${esc(verb.label)}</span>
              <span class="verb-teaser"${verb.slug === 'listen' ? ' id="listen-teaser"' : ''}>${esc(teasers[verb.slug])}</span>
            </span>
          </a>
        </li>`).join('\n        ');
  return shell({
    ...ctx,
    path: '/',
    title: 'mattdoes.online',
    description: 'matt does watch, listen, and unshared.',
    polarity: 'field',
    current: '',
    showVerbNav: false,
    anomaliesOpen: false,
    robots: '',
    main: `<h1 class="ident">matt does <span>…</span></h1>
      <p class="lede">An anomalous broadcast. Pick a verb.</p>
      <nav aria-label="verbs">
        <ol class="verbs">
        ${items}
        </ol>
      </nav>
      <nav class="broadcast" aria-label="elsewhere">
        ${link(LETTERBOXD, 'Letterboxd')}
        ${link(X, 'X @mattdoes')}
      </nav>
      ${redaction(`<p>Three verbs are scheduled. The night shift is not on the board. It is filed on the restricted door, under a second bar.</p>
          <p>${link('/unshared/', 'Restricted door')}</p>`)}`,
  });
}

/**
 * @param {object} watch
 * @param {number} index
 * @returns {string}
 */
function incident(watch, index) {
  const href = httpsHref(watch.link);
  const title = esc(watch.title || 'Untitled');
  const heading = href ? `<a href="${esc(href)}"${relFor(href)}>${title}</a>` : title;
  const year = watch.year ? ` <span class="year">${esc(watch.year)}</span>` : '';
  const stars = watch.stars ? `<p class="meta">${esc(watch.stars)}${watch.rewatch ? ' <span class="flag">rewatch</span>' : ''}</p>` : (watch.rewatch ? '<p class="meta"><span class="flag">rewatch</span></p>' : '');
  const when = watch.watchedDate ? `<p class="meta"><time class="time" datetime="${esc(watch.watchedDate)}">${esc(watch.watchedDate)}</time></p>` : '';
  const statement = watch.review
    ? `<p class="statement">${esc(watch.review)}</p>`
    : '<p class="statement">No witness statement.</p>';
  const poster = servedPoster(watch.poster);
  const dims = watch.posterWidth && watch.posterHeight
    ? ` width="${Number(watch.posterWidth)}" height="${Number(watch.posterHeight)}"`
    : '';
  const loading = index === 0 ? 'eager' : 'lazy';
  const priority = index === 0 ? ' fetchpriority="high"' : '';
  const evidence = poster
    ? `<figure class="evidence">
          <figcaption class="kicker">Evidence</figcaption>
          <img src="${esc(poster)}" alt="${esc(`Poster for ${watch.title || 'this film'}`)}"${dims} loading="${loading}"${priority}>
        </figure>`
    : `<div class="evidence">
          <p class="kicker">Evidence</p>
          <p>No still on file.</p>
        </div>`;
  return `<li class="incident">
        <div>
          <h2>${heading}</h2>
          ${year ? `<p class="meta">${year.trim()}</p>` : ''}
          ${stars}
          ${when}
        </div>
        ${statement}
        ${evidence}
      </li>`;
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
 * @param {object} ctx
 * @returns {string}
 */
export function renderWatch(ctx) {
  const watches = Array.isArray(ctx.watches) ? ctx.watches : [];
  const feed = watches.length
    ? `<ol class="feed">
        ${watches.map(incident).join('\n        ')}
      </ol>`
    : '<p class="note">No incidents in this window.</p>';
  return shell({
    ...ctx,
    path: '/watch/',
    title: 'matt does watch · mattdoes.online',
    description: 'Recent Letterboxd watches, filed as incident reports.',
    polarity: 'flip',
    current: 'watch',
    showVerbNav: true,
    anomaliesOpen: false,
    robots: '',
    main: `<h1 class="sign"><span class="sign-small">matt does</span> watch</h1>
      <p class="lede">Incident reports. The review is the witness statement. The poster is the evidence.</p>
      <p class="note">${link(LETTERBOXD, 'Letterboxd / mattdoes')}</p>
      ${feed}`,
  });
}

/**
 * @param {object} row
 * @returns {string}
 */
function logItem(row) {
  const href = httpsHref(row.link);
  const title = esc(row.track || 'Untitled');
  const what = href ? `<a href="${esc(href)}"${relFor(href)}>${title}</a>` : title;
  const when = row.nowPlaying
    ? '<time class="time">live</time>'
    : `<time class="time" datetime="${esc(row.date || '')}">${esc(stamp(row.date))}</time>`;
  const album = row.album ? `<span class="album">${esc(row.album)}</span>` : '';
  return `<li>
          ${when}
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
  const live = rows.some((row) => row.nowPlaying);
  const bars = Array.from({ length: 5 }, (_, i) => {
    const on = live || (!live && rows.length && i < 2);
    return `<span${on ? ' class="on"' : ''}></span>`;
  }).join('');
  const log = rows.length
    ? `<ol class="log" id="listen-log">
        ${rows.map(logItem).join('\n        ')}
      </ol>`
    : '<p class="note" id="listen-log">No intercepts in this window.</p>';
  return shell({
    ...ctx,
    path: '/listen/',
    title: 'matt does listen · mattdoes.online',
    description: 'Recent listening, from the station intercept.',
    polarity: 'flip',
    current: 'listen',
    showVerbNav: true,
    anomaliesOpen: false,
    robots: '',
    main: `<h1 class="sign"><span class="sign-small">matt does</span> listen</h1>
      <p class="lede">Intercept log. The meter is live when something is playing.</p>
      <div class="carrier">
        <p class="kicker">Signal</p>
        <h2 id="signal-state">${live ? 'live' : 'idle'}</h2>
        <div class="bars" id="signal-bars" aria-hidden="true">${bars}</div>
        <p class="total"><span class="total-num" id="scrobble-count">${esc(formatScrobbleCount(ctx.playcount))}</span><span class="total-label">scrobbles</span></p>
      </div>
      <h2 class="log-heading">Log</h2>
      ${log}`,
  });
}

/**
 * @param {object} ctx
 * @returns {string}
 */
export function renderUnshared(ctx) {
  return shell({
    ...ctx,
    path: '/unshared/',
    title: 'matt does unshared · mattdoes.online',
    description: 'Unshared, the music project.',
    polarity: 'flip',
    current: 'unshared',
    showVerbNav: true,
    anomaliesOpen: false,
    robots: '',
    main: `<h1 class="sign"><span class="sign-small">matt does</span> unshared</h1>
      <p class="stamp">Restricted</p>
      <p class="lede">Fun is unshared</p>
      ${contactBlock(unsharedContact.email)}
      ${bandcampSlot(unsharedPlayer.bandcamp)}
      <ul class="outlinks">
        <li>${link(APPLE, 'Apple Music')}</li>
        <li>${link(SPOTIFY, 'Spotify')}</li>
      </ul>
      ${redaction(`<p>The night operator signs Lucia. Her carrier is not listed with the anomalies.</p>
          <p>${link('/frequency/', 'Open the night file')}</p>`)}`,
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
    title: 'night frequency · mattdoes.online',
    description: 'Off the board.',
    polarity: 'field',
    current: '',
    showVerbNav: true,
    anomaliesOpen: false,
    robots: 'noindex',
    main: `<h1 class="sign"><span class="sign-small">off the board</span> night frequency</h1>
      <section class="prize" aria-labelledby="prize-heading">
        <p class="kicker">Night file</p>
        <h2 id="prize-heading">Lucia</h2>
        <p><a href="${LUCIA_MAIL}">send a transmission</a></p>
        <p>luciadoes@mail.grokbot.com</p>
        <p>She logs what arrives. Nothing answers by itself.</p>
      </section>`,
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
    title: 'no carrier · mattdoes.online',
    description: 'This frequency is empty.',
    polarity: 'field',
    current: '',
    showVerbNav: true,
    anomaliesOpen: true,
    robots: 'noindex',
    main: `<h1 class="sign">No carrier</h1>
      <p class="lede">This frequency is empty.</p>
      <p><a href="#anomalies">Index of anomalies</a></p>`,
  });
}

export const renderers = {
  watch: renderWatch,
  listen: renderListen,
  unshared: renderUnshared,
};
