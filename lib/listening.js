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
import { decodeTracks, decodePlaycount, recentTracksUrl, userInfoUrl } from './lastfm.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR  = path.resolve(__dirname, '..', '.cache');
const LASTFM_CACHE = path.join(CACHE_DIR, 'lastfm.json');
const LASTFM_USER_CACHE = path.join(CACHE_DIR, 'lastfm-user.json');

/**
 * Fetch the configured Last.fm user's recent tracks for the build-time
 * /listening/ snapshot. Cached to disk (`.cache/lastfm.json`) so offline
 * builds still succeed; a stale cache is returned (with a warning) when
 * the upstream call fails. Missing creds → empty array.
 *
 * @returns {Promise<Array<{
 *   artist: string, track: string, album: string, link: string,
 *   date: string, nowPlaying: boolean, image: string,
 * }>>}
 */
export async function fetchLastfmTracks() {
  const cfg = siteConfig.lastfm || {};
  const user = cfg.username || process.env.LASTFM_USERNAME || '';
  const key  = process.env.LASTFM_API_KEY || '';
  const ttl  = (cfg.cacheTtl ?? 900) * 1000;
  const limit = cfg.limit || 50;

  // Serve from cache if it's fresh enough.
  if (fs.existsSync(LASTFM_CACHE)) {
    try {
      const stat = fs.statSync(LASTFM_CACHE);
      if (Date.now() - stat.mtimeMs < ttl) {
        const cached = JSON.parse(fs.readFileSync(LASTFM_CACHE, 'utf8'));
        if (Array.isArray(cached.tracks)) return cached.tracks;
      }
    } catch {}
  }

  if (!user || !key) {
    // No credentials: fall back to whatever (stale) cache we have, else empty.
    if (fs.existsSync(LASTFM_CACHE)) {
      try { return JSON.parse(fs.readFileSync(LASTFM_CACHE, 'utf8')).tracks || []; } catch {}
    }
    return [];
  }

  try {
    const res = await fetch(recentTracksUrl(user, key, limit));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    // No `limit` cap: the snapshot keeps every entry the page returns
    // (limit+1 when a track is now playing).
    const { tracks } = decodeTracks(data, { image: true });

    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(LASTFM_CACHE, JSON.stringify({ fetchedAt: new Date().toISOString(), tracks }, null, 2));
    return tracks;
  } catch (err) {
    console.warn(`  (note: Last.fm fetch failed — ${err.message}; using cache if available)`);
    if (fs.existsSync(LASTFM_CACHE)) {
      try { return JSON.parse(fs.readFileSync(LASTFM_CACHE, 'utf8')).tracks || []; } catch {}
    }
    return [];
  }
}

/**
 * Total scrobble count from Last.fm's `user.getinfo`. Cached separately
 * from the recent-tracks list (`.cache/lastfm-user.json`) so the stat
 * stays visible offline and across deploys without creds. Falls back to
 * the last good cached value, or `0`, when the upstream call fails.
 *
 * @returns {Promise<number>}
 */
export async function fetchLastfmPlaycount() {
  const cfg  = siteConfig.lastfm || {};
  const user = cfg.username || process.env.LASTFM_USERNAME || '';
  const key  = process.env.LASTFM_API_KEY || '';
  const ttl  = (cfg.cacheTtl ?? 900) * 1000;

  const readCached = () => {
    if (!fs.existsSync(LASTFM_USER_CACHE)) return null;
    try {
      const cached = JSON.parse(fs.readFileSync(LASTFM_USER_CACHE, 'utf8'));
      return typeof cached.playcount === 'number' ? cached.playcount : null;
    } catch { return null; }
  };

  if (fs.existsSync(LASTFM_USER_CACHE)) {
    try {
      const stat = fs.statSync(LASTFM_USER_CACHE);
      if (Date.now() - stat.mtimeMs < ttl) {
        const hit = readCached();
        if (hit !== null) return hit;
      }
    } catch {}
  }

  if (!user || !key) return readCached() ?? 0;

  try {
    const res = await fetch(userInfoUrl(user, key));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const playcount = decodePlaycount(await res.json());
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(LASTFM_USER_CACHE, JSON.stringify({ fetchedAt: new Date().toISOString(), playcount }, null, 2));
    return playcount;
  } catch (err) {
    console.warn(`  (note: Last.fm user.getinfo failed — ${err.message}; using cache if available)`);
    return readCached() ?? 0;
  }
}
