// lib/watches.js — build-time Letterboxd snapshot (see CONTEXT.md: Watches).
//
// Called by the build entrypoint and passed into Emit. Never fetched inside
// Emit. Resolution order, matching the listening snapshot's cache posture:
//   1. a fresh disk cache
//   2. the public Letterboxd RSS (skipped when LETTERBOXD_OFFLINE=1)
//   3. a stale disk cache
//   4. empty
//
// The feed URL and the 25-item window live in site.config.js (`letterboxd`).
// CI and the test harness set LETTERBOXD_OFFLINE=1 so they never reach out;
// the production Pages build does not, and bakes whatever the feed returns.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { siteConfig } from '../site.config.js';
import { parseLetterboxdRss, selectRecentWatches } from './letterboxd.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_CACHE_DIR = path.resolve(__dirname, '..', '.cache');
const CACHE_FILE = 'letterboxd.json';
const FETCH_TIMEOUT_MS = 8000;

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
