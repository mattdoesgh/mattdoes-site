// lib/listening.js — the build-time Listening snapshot (see CONTEXT.md:
// Listening). Fetches the configured Last.fm user's recent tracks and total
// playcount, cached to disk so offline builds still succeed. Called by the
// build entrypoint; the result is an *input* to Emit, never fetched there.
//
// Between deploys the live site is kept fresh by workers/listening, which
// has its own KV-backed stale-while-revalidate cache — this module only
// governs the static snapshot baked into the HTML.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { siteConfig } from '../site.config.js';
import {
  decodeTracks, decodePlaycount, lastfmError, recentTracksUrl, userInfoUrl,
} from './lastfm.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_CACHE_DIR = path.resolve(__dirname, '..', '.cache');
const LASTFM_TRACKS_FILE = 'lastfm.json';
const LASTFM_USER_FILE = 'lastfm-user.json';

function readJsonFile(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch { return null; }
}

function readCachedPlaycount(filePath) {
  const cached = readJsonFile(filePath);
  if (!cached || typeof cached.playcount !== 'number') return null;
  return cached.playcount;
}

function isFresh(filePath, ttl) {
  if (!fs.existsSync(filePath)) return false;
  try { return Date.now() - fs.statSync(filePath).mtimeMs < ttl; } catch { return false; }
}

/**
 * Fetch the configured Last.fm user's recent tracks for the build-time
 * /listening/ snapshot. Cached to disk (`<cacheDir>/lastfm.json`) so offline
 * builds still succeed; a stale cache is returned (with a warning) when
 * the upstream call fails. Missing creds → empty array.
 *
 * @param {object} [opts]
 * @param {string} [opts.cacheDir] cache directory (default <repo>/.cache;
 *   the build entrypoint resolves the CACHE_DIR env override into this)
 * @returns {Promise<Array<{
 *   artist: string, track: string, album: string, link: string,
 *   date: string, nowPlaying: boolean, image: string,
 * }>>}
 */
export async function fetchLastfmTracks({ cacheDir = DEFAULT_CACHE_DIR } = {}) {
  const LASTFM_CACHE = path.join(cacheDir, LASTFM_TRACKS_FILE);
  const cfg = siteConfig.lastfm || {};
  const user = cfg.username || process.env.LASTFM_USERNAME || '';
  const key  = process.env.LASTFM_API_KEY || '';
  const ttl  = (cfg.cacheTtl ?? 900) * 1000;
  const limit = cfg.limit || 50;

  // Serve from cache if it's fresh enough.
  if (isFresh(LASTFM_CACHE, ttl)) {
    const cached = readJsonFile(LASTFM_CACHE);
    if (Array.isArray(cached?.tracks)) return cached.tracks;
  }

  if (!user || !key) {
    // No credentials: fall back to whatever (stale) cache we have, else empty.
    const cached = readJsonFile(LASTFM_CACHE);
    return cached?.tracks || [];
  }

  try {
    const res = await fetch(recentTracksUrl(user, key, limit));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (lastfmError(data)) throw new Error(data.message || `Last.fm error ${data.error}`);
    // No `limit` cap: the snapshot keeps every entry the page returns
    // (limit+1 when a track is now playing). Persist playcount alongside
    // tracks so the stat stays in sync when user.getinfo is unavailable.
    const { playcount, tracks } = decodeTracks(data, { image: true });

    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(
      LASTFM_CACHE,
      JSON.stringify({ fetchedAt: new Date().toISOString(), playcount, tracks }, null, 2),
    );
    return tracks;
  } catch (err) {
    console.warn(`  (note: Last.fm fetch failed — ${err.message}; using cache if available)`);
    const cached = readJsonFile(LASTFM_CACHE);
    return cached?.tracks || [];
  }
}

/**
 * Total scrobble count from Last.fm's `user.getinfo`. Cached separately
 * from the recent-tracks list (`<cacheDir>/lastfm-user.json`) so the stat
 * stays visible offline and across deploys without creds. Falls back to
 * the last good cached value, or `0`, when the upstream call fails.
 *
 * @param {object} [opts]
 * @param {string} [opts.cacheDir] cache directory (default <repo>/.cache)
 * @returns {Promise<number>}
 */
export async function fetchLastfmPlaycount({ cacheDir = DEFAULT_CACHE_DIR } = {}) {
  const LASTFM_USER_CACHE = path.join(cacheDir, LASTFM_USER_FILE);
  const LASTFM_CACHE = path.join(cacheDir, LASTFM_TRACKS_FILE);
  const cfg  = siteConfig.lastfm || {};
  const user = cfg.username || process.env.LASTFM_USERNAME || '';
  const key  = process.env.LASTFM_API_KEY || '';
  const ttl  = (cfg.cacheTtl ?? 900) * 1000;

  const readUserCached = () => readCachedPlaycount(LASTFM_USER_CACHE);
  const readTracksCached = () => readCachedPlaycount(LASTFM_CACHE);
  const readAnyCached = () => readUserCached() ?? readTracksCached();

  if (isFresh(LASTFM_USER_CACHE, ttl)) {
    const hit = readUserCached();
    if (hit !== null) return hit;
  }

  if (!user || !key) return readAnyCached() ?? 0;

  try {
    const res = await fetch(userInfoUrl(user, key));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (lastfmError(data)) throw new Error(data.message || `Last.fm error ${data.error}`);
    const playcount = decodePlaycount(data);
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(
      LASTFM_USER_CACHE,
      JSON.stringify({ fetchedAt: new Date().toISOString(), playcount }, null, 2),
    );
    return playcount;
  } catch (err) {
    console.warn(`  (note: Last.fm user.getinfo failed — ${err.message}; using cache if available)`);
    return readAnyCached() ?? 0;
  }
}
