// lib/listening.js — the build-time Listening snapshot. Produces the recent-tracks list + total scrobble count baked
// into the static HTML, disk-cached so offline builds still succeed. Called by
// the build entrypoint; the result is an *input* to Emit, never fetched there.
//
// Source of truth is the deployed listening Worker's own API
// (`${siteUrl}/api/listening/recent`): the production Cloudflare Pages build
// has no Last.fm credentials, so the Worker — which already serves live
// scrobbles from its KV cache — is the only build-time source that reflects
// reality. Resolution order:
//   1. a fresh disk cache    — short-circuits all network (keeps tests hermetic)
//   2. the listening Worker   — production path; needs no credentials
//   3. Last.fm direct         — only when this build has LASTFM_API_KEY
//   4. a stale disk cache     — still beats an empty page across a Worker-down deploy
//   5. empty
// Set LISTENING_OFFLINE=1 to skip the network steps (2 + 3) — used by the test
// fixture builds and CI so they stay hermetic and fast.
//
// Both the Worker payload and the Last.fm response decode through lib/lastfm.js,
// and the total playcount is the recent-tracks `@attr.total` in either case —
// the same source the live Worker uses, so the static stat and the live stat
// can never disagree.
//
// The monthly album chart comes from the same Worker, `GET /api/listening/charts`.
// The Pages build has no Last.fm key, and the preview's CSP is connect-src 'self',
// so the chart is baked into the HTML here rather than fetched in the
// browser. A failed chart call leaves the recent tracks in place and omits
// the grid. The Worker's recent-tracks poll is a separate path.
//
// Between deploys the live site is kept fresh by the same Worker (its KV-backed
// stale-while-revalidate cache); this module only governs the static snapshot.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { siteConfig } from '../site.config.js';
import {
  LISTENING_PERIODS, TOP_LIMIT, albumImageUrl, albumsWithCovers, decodeTracks, lastfmError, musicUrl, recentTracksUrl,
} from './lastfm.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_CACHE_DIR = path.resolve(__dirname, '..', '.cache');
const LASTFM_TRACKS_FILE = 'lastfm.json';
const WORKER_TIMEOUT_MS = 6000;
// A cold charts miss calls Last.fm for the monthly album chart. That can
// outlast the recent-tracks budget, so charts get their own timeout.
const CHARTS_TIMEOUT_MS = 20000;
const PERIOD_IDS = LISTENING_PERIODS.map((period) => period.id);

function readJsonFile(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch { return null; }
}

function isFresh(filePath, ttl) {
  if (!fs.existsSync(filePath)) return false;
  try { return Date.now() - fs.statSync(filePath).mtimeMs < ttl; } catch { return false; }
}

/** Coerce any cache/fetch object to the `{ tracks, playcount }` snapshot shape. */
function toSnapshot(obj) {
  return {
    tracks: Array.isArray(obj?.tracks) ? obj.tracks : [],
    playcount: Number(obj?.playcount) || 0,
  };
}

function writeCache(cacheDir, cacheFile, { tracks, playcount, periods }) {
  try {
    fs.mkdirSync(cacheDir, { recursive: true });
    const body = { fetchedAt: new Date().toISOString(), playcount, tracks };
    // Absent charts stay off the file so a later build can fill them in.
    // An explicit object (even with empty lists) is a successful fetch and
    // is kept until the TTL expires.
    if (periods) body.periods = periods;
    fs.writeFileSync(cacheFile, JSON.stringify(body, null, 2));
  } catch (err) {
    console.warn(`  (note: couldn't persist Last.fm cache — ${err.message})`);
  }
}

/**
 * One chart name, limited to the fields the page prints. Profile URLs and
 * anything that is not a Last.fm music link are dropped so a username cannot
 * ride along from a poisoned cache.
 *
 * @param {unknown} row
 * @param {'artist'|'album'} kind
 * @returns {object|null}
 */
function cleanChartRow(row, kind) {
  if (!row || typeof row !== 'object') return null;
  const name = String(row.name || '').trim();
  if (!name) return null;
  const cleaned = {
    name,
    playcount: Number(row.playcount) || 0,
    url: musicUrl(row.url),
  };
  if (kind === 'album') {
    cleaned.artist = String(row.artist || '').trim();
    cleaned.image = albumImageUrl(row.image);
  }
  return cleaned;
}

/**
 * @param {unknown} list
 * @param {'artist'|'album'} kind
 * @returns {object[]}
 */
function cleanChartList(list, kind) {
  if (!Array.isArray(list)) return [];
  const cleaned = list.map((row) => cleanChartRow(row, kind)).filter(Boolean);
  if (kind === 'album') return albumsWithCovers(cleaned, TOP_LIMIT);
  return cleaned.slice(0, TOP_LIMIT);
}

/**
 * Keep a cached chart object only when it carries the period ids we ask for.
 * Anything else is treated as missing so the build can fetch again.
 *
 * @param {unknown} value
 * @returns {object|null}
 */
function cachedPeriods(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const out = {};
  let known = false;
  for (const id of PERIOD_IDS) {
    if (!Object.prototype.hasOwnProperty.call(value, id)) continue;
    known = true;
    const row = value[id] && typeof value[id] === 'object' ? value[id] : {};
    out[id] = {
      artists: cleanChartList(row.artists, 'artist'),
      albums: cleanChartList(row.albums, 'album'),
    };
  }
  return known ? out : null;
}

/**
 * Top albums from the listening Worker. Null when the call
 * fails or the payload is tagged with a reason — the page then hides the
 * charts. Does not need a Last.fm key in this build.
 *
 * @param {string} siteUrl
 * @returns {Promise<object|null>}
 */
async function fetchChartsFromWorker(siteUrl) {
  let url;
  try {
    url = new URL('/api/listening/charts', siteUrl).toString();
  } catch {
    console.warn(`  (note: listening charts skipped — invalid SITE_URL "${siteUrl}")`);
    return null;
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), CHARTS_TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: { accept: 'application/json' }, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data?.reason) throw new Error(`worker reason "${data.reason}"`);
    const periods = cachedPeriods(data?.periods);
    if (!periods) throw new Error('payload missing periods');
    console.log('  listening: periods from Worker');
    return periods;
  } catch (err) {
    console.warn(`  (note: listening charts fetch failed — ${err.message}; hiding charts)`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch the snapshot from the deployed listening Worker's `/api/listening/recent`
 * route. The Worker tags every error/fallback payload with a truthy `reason`;
 * only a reason-free (authoritative) payload is trusted. Returns null on any
 * failure so the caller can fall through to the next source.
 *
 * @param {string} siteUrl  origin of the deployed site (build's SITE_URL)
 * @returns {Promise<{ tracks: object[], playcount: number }|null>}
 */
async function fetchFromWorker(siteUrl) {
  let url;
  try {
    url = new URL('/api/listening/recent', siteUrl).toString();
  } catch {
    // A missing or scheme-less SITE_URL is a misconfiguration, not an outage —
    // say so loudly rather than silently degrading to an empty snapshot.
    console.warn(`  (note: listening Worker skipped — invalid SITE_URL "${siteUrl}"; falling back)`);
    return null;
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), WORKER_TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: { accept: 'application/json' }, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data?.reason) throw new Error(`worker reason "${data.reason}"`);
    if (!Array.isArray(data?.tracks)) throw new Error('payload missing tracks[]');
    // `@attr.total` (the playcount source) is always ≥ the number of tracks
    // shown, so a populated list with a zero/absent playcount is corrupt —
    // reject it rather than bake a self-contradictory "0 scrobbles" stat over
    // real rows (the very wrong-content state ADR 0006 set out to kill).
    if (data.tracks.length && !(Number(data.playcount) > 0)) {
      throw new Error('tracks present but playcount missing/zero');
    }
    return toSnapshot(data);
  } catch (err) {
    console.warn(`  (note: listening Worker fetch failed — ${err.message}; falling back)`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch the snapshot directly from Last.fm's `user.getrecenttracks` (playcount
 * read from the response's `@attr.total`). Returns null when this build has no
 * credentials or the call fails.
 *
 * @param {string} user  Last.fm username
 * @param {string} key   Last.fm API key
 * @param {number} limit recent-tracks limit
 * @returns {Promise<{ tracks: object[], playcount: number }|null>}
 */
async function fetchFromLastfm(user, key, limit) {
  if (!user || !key) return null;
  try {
    const res = await fetch(recentTracksUrl(user, key, limit));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (lastfmError(data)) throw new Error(data.message || `Last.fm error ${data.error}`);
    // Cap at the same limit the Worker path uses so both build sources produce
    // an identically-shaped snapshot (the API returns limit+1 when a track is
    // now playing).
    return toSnapshot(decodeTracks(data, { limit }));
  } catch (err) {
    console.warn(`  (note: Last.fm fetch failed — ${err.message}; falling back)`);
    return null;
  }
}

/**
 * Resolve the build-time Listening snapshot — the recent tracks and total
 * scrobble count baked into the static HTML — following the source order
 * documented at the top of this file. Always resolves to a usable shape;
 * the worst case is `{ tracks: [], playcount: 0, periods: null }`.
 *
 * @param {object} [opts]
 * @param {string} [opts.siteUrl]  origin used to reach the listening Worker
 *   (the build entrypoint passes its SITE_URL)
 * @param {string} [opts.cacheDir] cache directory (default <repo>/.cache;
 *   the build entrypoint resolves the CACHE_DIR env override into this)
 * @returns {Promise<{
 *   tracks: Array<{ artist: string, track: string, album: string, link: string,
 *     date: string, nowPlaying: boolean }>,
 *   playcount: number,
 *   periods: object|null,
 * }>}
 */
export async function fetchListeningSnapshot({ siteUrl = '', cacheDir = DEFAULT_CACHE_DIR } = {}) {
  const cacheFile = path.join(cacheDir, LASTFM_TRACKS_FILE);
  const cfg     = siteConfig.lastfm || {};
  const user    = cfg.username || process.env.LASTFM_USERNAME || '';
  const key     = process.env.LASTFM_API_KEY || '';
  const ttl     = (cfg.cacheTtl ?? 900) * 1000;
  const limit   = cfg.limit || 50;
  const offline = process.env.LISTENING_OFFLINE === '1';

  const withPeriods = (snap, periods) => ({ ...toSnapshot(snap), periods: periods || null });

  // 1. A fresh cache wins for tracks — no track network. Fixture builds seed
  //    one, so the test suite never reaches out (hermetic + fast). Charts are
  //    filled from the Worker when the cache lacks them. No Last.fm key needed.
  if (isFresh(cacheFile, ttl)) {
    const cached = readJsonFile(cacheFile);
    if (Array.isArray(cached?.tracks)) {
      let periods = cachedPeriods(cached.periods);
      if (!periods && !offline) {
        periods = await fetchChartsFromWorker(siteUrl);
        if (periods) {
          writeCache(cacheDir, cacheFile, {
            tracks: cached.tracks,
            playcount: cached.playcount,
            periods,
          });
        }
      }
      return withPeriods(cached, periods);
    }
  }

  // 2 + 3. Network sources, freshest first. Skipped entirely when offline.
  // Each success logs its source: a build that reaches out when it shouldn't
  // have (LISTENING_OFFLINE forgotten on a new entry point) is then visible in
  // the log rather than silently hitting production.
  // Charts are fetched from the Worker beside the tracks. A chart failure
  // does not discard tracks that already resolved, and this build never calls
  // user.gettopalbums itself.
  if (!offline) {
    const [fromWorker, fetchedPeriods] = await Promise.all([
      fetchFromWorker(siteUrl),
      fetchChartsFromWorker(siteUrl),
    ]);
    const tracksSnap = fromWorker || await fetchFromLastfm(user, key, limit);
    if (fromWorker) {
      console.log(`  listening: snapshot from Worker (${fromWorker.tracks.length} tracks, ${fromWorker.playcount} scrobbles)`);
    } else if (tracksSnap) {
      console.log(`  listening: snapshot from Last.fm (${tracksSnap.tracks.length} tracks, ${tracksSnap.playcount} scrobbles)`);
    }
    if (tracksSnap) {
      const kept = fetchedPeriods || cachedPeriods(readJsonFile(cacheFile)?.periods);
      writeCache(cacheDir, cacheFile, { ...tracksSnap, periods: kept });
      return withPeriods(tracksSnap, kept);
    }
    if (fetchedPeriods) {
      const staleTracks = readJsonFile(cacheFile);
      if (Array.isArray(staleTracks?.tracks)) {
        writeCache(cacheDir, cacheFile, { ...toSnapshot(staleTracks), periods: fetchedPeriods });
        return withPeriods(staleTracks, fetchedPeriods);
      }
      return { tracks: [], playcount: 0, periods: fetchedPeriods };
    }
  }

  // 4. A stale cache still beats an empty page across a Worker-down deploy.
  const stale = readJsonFile(cacheFile);
  if (Array.isArray(stale?.tracks)) return withPeriods(stale, cachedPeriods(stale.periods));

  // 5. Nothing anywhere.
  return { tracks: [], playcount: 0, periods: null };
}
