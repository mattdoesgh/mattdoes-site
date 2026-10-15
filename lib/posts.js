// lib/posts.js — build-time X post snapshot (see CONTEXT.md: Posts).
//
// Called by the build entrypoint and passed into Emit. Never fetched inside
// Emit. Resolution order, matching the Letterboxd snapshot:
//   1. a fresh disk cache
//   2. the X API (skipped when X_OFFLINE=1, or when X_BEARER_TOKEN is unset)
//   3. a stale disk cache
//   4. empty
//
// The handle and the window live in site.config.js (`x`). CI and the test
// harness set X_OFFLINE=1 so they never reach out. A production Pages build
// with X_BEARER_TOKEN bakes a new snapshot; between deploys the page stays
// at that bake. There is no Worker: the page is static HTML, and X has no
// public RSS.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { siteConfig } from '../site.config.js';
import { selectOriginalPosts } from './x-posts.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_CACHE_DIR = path.resolve(__dirname, '..', '.cache');
const CACHE_FILE = 'x-posts.json';
const FETCH_TIMEOUT_MS = 8000;
const API = 'https://api.x.com/2';

function readJsonFile(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch { return null; }
}

function isFresh(filePath, ttl) {
  if (!fs.existsSync(filePath)) return false;
  try { return Date.now() - fs.statSync(filePath).mtimeMs < ttl; } catch { return false; }
}

function toPosts(obj, handle, limit) {
  if (!obj) return null;
  const rows = Array.isArray(obj.posts) ? obj.posts : null;
  if (!rows) return null;
  return selectOriginalPosts(
    rows.map((post) => ({
      id: post.id,
      text: post.text,
      created_at: post.createdAt,
    })),
    { handle, limit },
  );
}

function writeCache(cacheDir, cacheFile, posts) {
  try {
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(cacheFile, JSON.stringify(
      { fetchedAt: new Date().toISOString(), posts }, null, 2,
    ));
  } catch (err) {
    console.warn(`  (note: couldn't persist X post cache — ${err.message})`);
  }
}

/**
 * @param {string} token
 * @param {string} handle
 * @param {number} limit
 * @returns {Promise<object[]|null>}
 */
async function fetchFeed(token, handle, limit) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  const headers = {
    accept: 'application/json',
    authorization: `Bearer ${token}`,
    'user-agent': 'mattdoes-site/build (+https://mattdoes.online)',
  };
  try {
    const userRes = await fetch(`${API}/users/by/username/${encodeURIComponent(handle)}`, {
      headers,
      signal: ctrl.signal,
    });
    if (!userRes.ok) throw new Error(`user lookup HTTP ${userRes.status}`);
    const user = await userRes.json();
    const id = String(user?.data?.id || '');
    if (!/^\d{1,25}$/.test(id)) throw new Error('user lookup returned no id');

    const tweets = new URL(`${API}/users/${id}/tweets`);
    tweets.searchParams.set('max_results', '100');
    tweets.searchParams.set('exclude', 'retweets,replies');
    tweets.searchParams.set('tweet.fields', 'created_at,text,referenced_tweets,note_tweet');
    const postRes = await fetch(tweets, { headers, signal: ctrl.signal });
    if (!postRes.ok) throw new Error(`posts HTTP ${postRes.status}`);
    const body = await postRes.json();
    return selectOriginalPosts(body, { handle, limit });
  } catch (err) {
    console.warn(`  (note: X fetch failed — ${err.message}; falling back)`);
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
export async function fetchPosts({ cacheDir = DEFAULT_CACHE_DIR } = {}) {
  const cfg = siteConfig.x || {};
  const handle = cfg.handle || 'mattdoes';
  const limit = cfg.limit || 20;
  const ttl = (cfg.cacheTtl ?? 60 * 60) * 1000;
  const offline = process.env.X_OFFLINE === '1';
  const token = process.env.X_BEARER_TOKEN || '';
  const cacheFile = path.join(cacheDir, CACHE_FILE);

  if (isFresh(cacheFile, ttl)) {
    const cached = toPosts(readJsonFile(cacheFile), handle, limit);
    if (cached) return cached;
  }

  if (!offline && token) {
    const fresh = await fetchFeed(token, handle, limit);
    if (fresh) {
      console.log(`  x: ${fresh.length} original posts`);
      writeCache(cacheDir, cacheFile, fresh);
      return fresh;
    }
  } else if (!offline && !token) {
    console.warn('  (note: X_BEARER_TOKEN unset — /posts/ keeps the last bake or stays empty)');
  }

  const stale = toPosts(readJsonFile(cacheFile), handle, limit);
  if (stale) return stale;
  return [];
}
