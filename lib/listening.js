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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_CACHE_DIR = path.resolve(__dirname, '..', '.cache');

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
 *   track: string, artist: string, album: string, link: string,
 *   image: string, date: string, nowPlaying: boolean,
 * }>>}
 */
export async function fetchLastfmTracks({ cacheDir = DEFAULT_CACHE_DIR } = {}) {
  const LASTFM_CACHE = path.join(cacheDir, 'lastfm.json');
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

  const url = `https://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks&user=${encodeURIComponent(user)}&api_key=${encodeURIComponent(key)}&format=json&limit=${limit}`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const raw  = data?.recenttracks?.track || [];
    const tracks = (Array.isArray(raw) ? raw : [raw]).map(t => ({
      track:  t.name || '',
      artist: (t.artist && (t.artist['#text'] || t.artist.name)) || '',
      album:  (t.album && t.album['#text']) || '',
      link:   t.url || '',
      image:  Array.isArray(t.image) ? (t.image[t.image.length - 1]?.['#text'] || '') : '',
      // `@attr.nowplaying` means no `date.uts`; use now instead.
      date:   t['@attr']?.nowplaying
        ? new Date().toISOString()
        : (t.date?.uts ? new Date(Number(t.date.uts) * 1000).toISOString() : ''),
      nowPlaying: Boolean(t['@attr']?.nowplaying),
    })).filter(t => t.artist && t.track);

    fs.mkdirSync(cacheDir, { recursive: true });
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
 * from the recent-tracks list (`<cacheDir>/lastfm-user.json`) so the stat
 * stays visible offline and across deploys without creds. Falls back to
 * the last good cached value, or `0`, when the upstream call fails.
 *
 * @param {object} [opts]
 * @param {string} [opts.cacheDir] cache directory (default <repo>/.cache)
 * @returns {Promise<number>}
 */
export async function fetchLastfmPlaycount({ cacheDir = DEFAULT_CACHE_DIR } = {}) {
  const LASTFM_USER_CACHE = path.join(cacheDir, 'lastfm-user.json');
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

  const url = `https://ws.audioscrobbler.com/2.0/?method=user.getinfo&user=${encodeURIComponent(user)}&api_key=${encodeURIComponent(key)}&format=json`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const playcount = Number(data?.user?.playcount) || 0;
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(LASTFM_USER_CACHE, JSON.stringify({ fetchedAt: new Date().toISOString(), playcount }, null, 2));
    return playcount;
  } catch (err) {
    console.warn(`  (note: Last.fm user.getinfo failed — ${err.message}; using cache if available)`);
    return readCached() ?? 0;
  }
}
