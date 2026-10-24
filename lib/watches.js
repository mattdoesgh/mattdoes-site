// lib/watches.js — build-time Letterboxd snapshot.
//
// Called by the build entrypoint and passed into Emit. Never fetched inside
// Emit. The diary and the lifetime films-watched count resolve separately, so
// a miss on one does not blank the other. Each one:
//   1. a fresh disk cache
//   2. the network (skipped when LETTERBOXD_OFFLINE=1)
//   3. a stale disk cache
//   4. empty (the page hides the count; it does not print zero)
//
// The diary comes from the public RSS. The count is the Watched total on the
// public films page (the RSS has no total). Both use `letterboxd.cacheTtl`.
// The rebuild worker redeploys Pages every six hours, which is what refreshes
// them in production. CI and the test harness set LETTERBOXD_OFFLINE=1.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { siteConfig } from '../site.config.js';
import { filmsPageUrl, parseFilmCount, parseLetterboxdRss, selectRecentWatches } from './letterboxd.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_CACHE_DIR = path.resolve(__dirname, '..', '.cache');
const CACHE_FILE = 'letterboxd.json';
const COUNT_FILE = 'letterboxd-count.json';
const FETCH_TIMEOUT_MS = 8000;
const MAX_FILMS_HTML = 2_000_000;

function readJsonFile(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch { return null; }
}

function isFresh(filePath, ttl) {
  if (!fs.existsSync(filePath)) return false;
  try { return Date.now() - fs.statSync(filePath).mtimeMs < ttl; } catch { return false; }
}

function toWatches(obj) {
  return Array.isArray(obj?.watches) ? obj.watches : null;
}

function writeCache(cacheDir, cacheFile, watches) {
  try {
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(cacheFile, JSON.stringify(
      { fetchedAt: new Date().toISOString(), watches }, null, 2,
    ));
  } catch (err) {
    console.warn(`  (note: couldn't persist Letterboxd cache — ${err.message})`);
  }
}

/**
 * @param {string} feed
 * @param {number} limit
 * @returns {Promise<object[]|null>}
 */
async function fetchFeed(feed, limit) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(feed, {
      headers: {
        accept: 'application/rss+xml, application/xml, text/xml',
        'user-agent': 'mattdoes-site/build (+https://mattdoes.online)',
      },
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const xml = await res.text();
    const watches = selectRecentWatches(parseLetterboxdRss(xml), limit);
    if (!watches.length) throw new Error('feed had no film entries');
    return watches;
  } catch (err) {
    console.warn(`  (note: Letterboxd fetch failed — ${err.message}; falling back)`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * @param {object} [opts]
 * @param {string} [opts.cacheDir]
 * @returns {Promise<object[]>}
 */
export async function fetchWatches({ cacheDir = DEFAULT_CACHE_DIR } = {}) {
  const cfg = siteConfig.letterboxd || {};
  const feed = cfg.feed || '';
  const limit = cfg.limit || 25;
  const ttl = (cfg.cacheTtl ?? 6 * 60 * 60) * 1000;
  const offline = process.env.LETTERBOXD_OFFLINE === '1';
  const cacheFile = path.join(cacheDir, CACHE_FILE);

  if (isFresh(cacheFile, ttl)) {
    const cached = toWatches(readJsonFile(cacheFile));
    if (cached) return selectRecentWatches(cached, limit);
  }

  if (!offline && feed) {
    const fresh = await fetchFeed(feed, limit);
    if (fresh) {
      console.log(`  letterboxd: ${fresh.length} recent watches`);
      writeCache(cacheDir, cacheFile, fresh);
      return fresh;
    }
  }

  const stale = toWatches(readJsonFile(cacheFile));
  if (stale) return selectRecentWatches(stale, limit);
  return [];
}

/**
 * A positive integer from a cache object, or null. Zero is not a count:
 * the page hides the line instead of printing it.
 *
 * @param {unknown} obj
 * @returns {number|null}
 */
function storedCount(obj) {
  const n = Number(obj?.filmCount);
  if (!Number.isInteger(n) || n <= 0 || n > 100_000) return null;
  return n;
}

/**
 * @param {string} cacheDir
 * @param {number} ttl
 * @returns {number|null}
 */
function freshCount(cacheDir, ttl) {
  const dedicated = path.join(cacheDir, COUNT_FILE);
  if (isFresh(dedicated, ttl)) {
    const n = storedCount(readJsonFile(dedicated));
    if (n) return n;
  }
  const alongside = path.join(cacheDir, CACHE_FILE);
  if (isFresh(alongside, ttl)) {
    const n = storedCount(readJsonFile(alongside));
    if (n) return n;
  }
  return null;
}

/**
 * @param {string} cacheDir
 * @returns {number|null}
 */
function staleCount(cacheDir) {
  const dedicated = storedCount(readJsonFile(path.join(cacheDir, COUNT_FILE)));
  if (dedicated) return dedicated;
  return storedCount(readJsonFile(path.join(cacheDir, CACHE_FILE)));
}

/**
 * @param {string} cacheDir
 * @param {number} filmCount
 */
function writeCountCache(cacheDir, filmCount) {
  try {
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(path.join(cacheDir, COUNT_FILE), JSON.stringify(
      { fetchedAt: new Date().toISOString(), filmCount }, null, 2,
    ));
  } catch (err) {
    console.warn(`  (note: couldn't persist Letterboxd count cache — ${err.message})`);
  }
}

/**
 * @param {string} pageUrl
 * @returns {Promise<number|null>}
 */
async function fetchFilmsPage(pageUrl) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(pageUrl, {
      headers: {
        accept: 'text/html',
        'user-agent': 'mattdoes-site/build (+https://mattdoes.online)',
      },
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    let finalUrl;
    try { finalUrl = new URL(res.url || pageUrl); } catch { throw new Error('bad final url'); }
    if (finalUrl.protocol !== 'https:') throw new Error('films page left https');
    if (finalUrl.hostname !== 'letterboxd.com' && finalUrl.hostname !== 'www.letterboxd.com') {
      throw new Error('films page left letterboxd');
    }
    if (!/\/films\/?$/.test(finalUrl.pathname)) throw new Error('films page redirected');
    const type = res.headers.get('content-type') || '';
    if (!/text\/html/i.test(type)) throw new Error('films page was not html');
    const advertised = Number(res.headers.get('content-length'));
    if (Number.isFinite(advertised) && advertised > MAX_FILMS_HTML) throw new Error('films page too large');
    const html = await res.text();
    if (html.length > MAX_FILMS_HTML) throw new Error('films page too large');
    const count = parseFilmCount(html);
    if (count == null) throw new Error('films page had no watched total');
    return count;
  } catch (err) {
    console.warn(`  (note: Letterboxd film count failed — ${err.message}; hiding the line if uncached)`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Lifetime films watched, or null when it cannot be known. Null hides the
 * line. A cached total is kept when the films page cannot be fetched.
 *
 * @param {object} [opts]
 * @param {string} [opts.cacheDir]
 * @returns {Promise<number|null>}
 */
export async function fetchFilmCount({ cacheDir = DEFAULT_CACHE_DIR } = {}) {
  const cfg = siteConfig.letterboxd || {};
  const ttl = (cfg.cacheTtl ?? 6 * 60 * 60) * 1000;
  const offline = process.env.LETTERBOXD_OFFLINE === '1';
  const pageUrl = filmsPageUrl(cfg.profile || '');

  const fresh = freshCount(cacheDir, ttl);
  if (fresh) return fresh;

  if (!offline && pageUrl) {
    const count = await fetchFilmsPage(pageUrl);
    if (count) {
      console.log(`  letterboxd: ${count} films`);
      writeCountCache(cacheDir, count);
      return count;
    }
  }

  return staleCount(cacheDir);
}
