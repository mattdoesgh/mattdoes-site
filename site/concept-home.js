// Concept home. Preview only.
//
// Emitted when CONCEPT_HOME=1, or when Cloudflare Pages builds a branch
// other than main. The production build keeps renderHome. The page is
// noindex. Pink on black is the interface. --laser is light in the
// Unshared room and in the tap, never a label color.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { socials } from './verbs.ts';
import { socialIcon } from './social-icons.js';
import { esc, relFor } from '../lib/safe-url.js';
import { staticListen } from '../lib/listen-line.js';
import { musicUrl } from '../lib/lastfm.js';
import { expandCssImports, processAsset } from '../lib/emit/assets.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const LOG_FILE = path.join(HERE, 'build-log.json');
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const INTRO = 'houston. horror films, industrial music, and the y2k web.';
// Classes composed onto the page: .mark .section-title .series .stage-name .cut-1 .cut-2 .cut-3 .cut-4 .cut-5 .cut-6

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {boolean}
 */
export function conceptHomeEnabled(env = process.env) {
  if (env.CONCEPT_HOME === '0') return false;
  if (env.CONCEPT_HOME === '1') return true;
  const branch = env.CF_PAGES_BRANCH || '';
  return branch !== '' && branch !== 'main' && branch !== 'master';
}

/**
 * Copy the concept stylesheet and the laser script into dist and hash them.
 * They are not in static/, so a main-branch build does not ship them.
 *
 * @param {string} distDir
 * @returns {Promise<Array<[string, string]>>}
 */
export async function publishConceptAssets(distDir) {
  const cssPath = path.join(HERE, 'concept-online.css');
  const jsPath = path.join(HERE, 'concept-laser.js');
  let css = expandCssImports(fs.readFileSync(cssPath, 'utf8'), cssPath);
  css = css.replace(
    /url\((["']?)\.\.\/static\/fonts\/Anton-latin\.woff2\1\)/g,
    'url("/fonts/Anton-latin.woff2")',
  );
  fs.writeFileSync(path.join(distDir, 'concept-online.css'), css);
  fs.copyFileSync(jsPath, path.join(distDir, 'concept-laser.js'));
  const pairs = await Promise.all([
    processAsset(distDir, 'concept-online.css', 'css'),
    processAsset(distDir, 'concept-laser.js', 'js'),
  ]);
  return pairs.filter(Boolean);
}

/**
 * @param {unknown} iso
 * @returns {string}
 */
function shortDate(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  if (!match) return '';
  const month = MONTHS[Number(match[2]) - 1];
  if (!month) return '';
  return `${month} ${Number(match[3])}`;
}

/**
 * @param {unknown} url
 * @returns {string}
 */
function githubPr(url) {
  let parsed;
  try { parsed = new URL(String(url || '')); } catch { return ''; }
  if (parsed.protocol !== 'https:' || parsed.hostname !== 'github.com') return '';
  if (parsed.username || parsed.password) return '';
  if (!/^\/mattdoesgh\/mattdoes-site\/pull\/\d+\/?$/.test(parsed.pathname)) return '';
  return parsed.toString();
}

/**
 * @param {unknown} link
 * @returns {string}
 */
function letterboxdHref(link) {
  let parsed;
  try { parsed = new URL(String(link || '')); } catch { return ''; }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return '';
  const host = parsed.hostname.toLowerCase();
  if (host !== 'letterboxd.com' && host !== 'www.letterboxd.com') return '';
  return parsed.toString();
}

/**
 * @param {object[]} watches
 * @returns {object | undefined}
 */
function latestWatch(watches) {
  const list = (Array.isArray(watches) ? watches : []).filter((row) => row && row.title);
  return list.slice().sort((a, b) => String(b.watchedDate || '').localeCompare(String(a.watchedDate || '')))[0];
}

/**
 * Six visual slices. The live text stays in the DOM and is never rewritten.
 *
 * @param {string} tag
 * @param {string} cls
 * @param {string} text
 * @param {string} [id]
 * @returns {string}
 */
function combo(tag, cls, text, id) {
  const safe = esc(text);
  const slices = Array.from({ length: 6 }, () => `<span class="slice">${safe}</span>`).join('');
  const idAttr = id ? ` id="${esc(id)}"` : '';
  return `<${tag}${idAttr} class="${cls} combo" data-combo tabindex="0"><span class="combo-face"><span class="combo-live">${safe}</span><span class="slices" aria-hidden="true">${slices}</span></span><span class="meter" aria-hidden="true"><span class="meter-hits"></span><span class="meter-badge"><span class="meter-rank"></span><span class="meter-name"></span></span></span><span class="fan" aria-hidden="true"><span class="fan-line"></span><span class="fan-line"></span><span class="fan-line"></span></span></${tag}>`;
}

/**
 * @returns {object[]}
 */
function loadBuildLog() {
  const data = JSON.parse(fs.readFileSync(LOG_FILE, 'utf8'));
  const entries = Array.isArray(data.entries) ? data.entries : [];
  return entries.filter((row) => row && githubPr(row.href) && String(row.title || '').trim());
}

/**
 * @param {object} ctx
 * @returns {string}
 */
export function renderConceptHome(ctx) {
  const css = ctx.assets && ctx.assets['concept-online.css'];
  const laser = ctx.assets && ctx.assets['concept-laser.js'];
  const station = ctx.assets && ctx.assets['station.js'];
  if (!css || !laser || !station) {
    throw new Error('concept home needs concept-online.css, concept-laser.js, and station.js');
  }

  const line = staticListen(ctx.tracks);
  const listenHref = line ? musicUrl(line.link) : '';
  const listenWhat = line
    ? (listenHref
      ? `<a class="listen-what" href="${esc(listenHref)}"${relFor(listenHref)}>${esc(line.pair)}</a>`
      : `<span class="listen-what">${esc(line.pair)}</span>`)
    : '';
  const listen = line
    ? `<p class="listen-line"><span class="listen-state">${esc(line.state)}</span> ${listenWhat}</p>`
    : '';

  const watch = latestWatch(ctx.watches);
  const watchHref = watch ? letterboxdHref(watch.link) : '';
  const stars = watch && watch.stars ? ` <span class="stars">${esc(watch.stars)}</span>` : '';
  const watchWhat = watch
    ? (watchHref
      ? `<a class="watch-what" href="${esc(watchHref)}"${relFor(watchHref)}>${esc(watch.title)}</a>`
      : `<span class="watch-what">${esc(watch.title)}</span>`)
    : '';
  const watched = watch
    ? `<p class="watch-line"><span class="watch-state">last watched</span> ${watchWhat}${stars}</p>`
    : '';
  const presence = `<section class="presence" aria-labelledby="on-title">
        ${combo('h2', 'section-title', 'on', 'on-title')}
        <p class="presence-row"><a class="row-link" href="/listening/"><span class="hit-label">last.fm</span></a></p>
        ${listen}
        <p class="presence-row"><a class="row-link" href="/watching/"><span class="hit-label">letterboxd</span></a></p>
        ${watched}
      </section>`;

  const log = loadBuildLog().map((row) => {
    const href = githubPr(row.href);
    const when = shortDate(row.when);
    const time = when ? `<time class="log-when" datetime="${esc(String(row.when).slice(0, 10))}">${esc(when)}</time>` : '';
    return `<li class="log-row"><a href="${esc(href)}"${relFor(href)}><span class="hit-label"><span class="log-n">${esc(row.n)}</span> ${esc(row.title)}</span></a>${time}</li>`;
  }).join('\n          ');

  const social = socials.map((item) =>
    `<a href="${esc(item.href)}" rel="me noopener" aria-label="${esc(item.label)}">${socialIcon(item.label)}</a>`,
  ).join('\n          ');

  const siteUrl = String(ctx.siteUrl || 'https://mattdoes.online').replace(/\/$/, '');
  const canonical = `${siteUrl}/`;

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
    <title>mattdoes.online</title>
    <meta name="description" content="matt does online. ${esc(INTRO)}">
    <meta name="robots" content="noindex">
    <link rel="canonical" href="${esc(canonical)}">
    <link rel="icon" href="/favicon.svg" type="image/svg+xml">
    <link rel="stylesheet" href="/${esc(css)}">
  </head>
  <body data-root="/">
    <a class="skip-link" href="#main">Skip to content</a>
    <main id="main">
      <p class="channel"><span class="channel-dot" aria-hidden="true"></span> now online · houston</p>
      ${combo('h1', 'mark', 'matt does online')}
      <p class="intro">${esc(INTRO)}</p>
      <div class="columns">
        <div class="lead">
          <section class="stage" aria-labelledby="made-title">
            <div class="room" aria-hidden="true">
              <span class="rake"></span>
              <span class="beam"></span>
              <span class="flare"></span>
              <span class="spill"></span>
            </div>
            <div class="stage-copy">
              ${combo('h2', 'stage-name', 'unshared', 'made-title')}
              <div class="stage-row">
                ${combo('p', 'series', '01')}
                <a class="stage-link" href="/unshared/birds1/"><span class="hit-label">birds1</span></a>
              </div>
              <p class="stage-note">number one</p>
            </div>
          </section>
        </div>
        <div class="side">
          ${presence}
          <section class="built" aria-labelledby="built-title">
            ${combo('h2', 'section-title', 'built', 'built-title')}
            <ol class="log">
          ${log}
            </ol>
          </section>
        </div>
      </div>
      <p class="end-note" aria-live="polite"></p>
    </main>
    <footer class="site-footer">
      <nav class="socials" aria-label="socials">
          ${social}
      </nav>
    </footer>
    <script src="/${esc(station)}" defer></script>
    <script src="/${esc(laser)}" defer></script>
  </body>
</html>
`;
}
