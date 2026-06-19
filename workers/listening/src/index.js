// /api/listening/* — Last.fm listening state via stale-while-revalidate.
//
// Routes:
//   GET /api/listening/now      → current scrobble (or { nowPlaying: false })
//   GET /api/listening/recent   → playcount + 25 most recent tracks
//
// Called client-side by /now-playing.js (topbar pill) and /listening-live.js
// (the /listening/ page). Response shapes are unchanged from the previous
// edge-cache-only implementation so the static clients keep working.
//
// Refresh policy per endpoint (medium defaults):
//   FRESH (age <  5 min)           → serve KV, no upstream call
//   SOFT  (age  5–30 min)          → serve stale KV immediately, kick off a
//                                    background refresh via ctx.waitUntil
//   HARD  (age ≥ 30 min, or empty) → block, refresh, write KV, serve fresh
//
// A 60s KV lock key dedupes concurrent background refreshes so a burst of
// polling clients only triggers one upstream call per SOFT window.
//
// On top of that, responses are stored in the Cloudflare edge cache for
// EDGE_TTL_S (s-maxage). Concurrent visitors polling within the same window
// collapse to a single Worker invocation; the rest are served from the edge
// without ever entering this Worker. EDGE_TTL_S << FRESH_MS, so this never
// widens the staleness budget set by the SWR layer above. The browser still
// sees max-age=0 + must-revalidate, so each poll re-asks the edge — matching
// the original design intent that scrobble updates aren't hidden by a stale
// browser cache.
//
// Env (wrangler secrets):
//   LASTFM_USERNAME  — Last.fm user to query
//   LASTFM_API_KEY   — Last.fm API key
// Bindings (wrangler.toml):
//   LASTFM_CACHE     — Workers KV namespace used for cached payloads + locks
//   LISTEN_RL        — Workers Rate Limiting binding. Missing/unhealthy
//                      bindings fail closed so abusive traffic cannot bypass
//                      the public route budget.
//
// Notes on Last.fm API etiquette:
//   • We always serve from KV on the request path; upstream calls happen
//     only during background refreshes, keeping call volume bounded by the
//     FRESH window regardless of traffic.
//   • A descriptive User-Agent is sent so Last.fm can identify / rate-limit
//     this client distinctly.

import {
  json, errorJson, withCache, corsPreflight, kvGet, kvPut, getClientIp,
} from '../../lib/transport.js';
import { decodeTrack, decodeTracks, lastfmError, recentTracksUrl } from '../../../lib/lastfm.js';

// Thresholds (milliseconds).
const FRESH_MS    =      60 * 1000;   //  1 min — keep now-playing within ~a client poll of real time
const HARD_MS     = 30 * 60 * 1000;   // 30 min — upper bound on served staleness
const LOCK_TTL_S  = 60;               // KV minimum expirationTtl is 60s
const EDGE_TTL_S  = 15;               // edge-cache window; must be ≪ FRESH_MS / 1000

const RECENT_LIMIT = 25;
const USER_AGENT   = 'mattdoes-site/1.0 (+https://mattdoes.online)';

/**
 * @typedef {object} Env
 * @property {KVNamespace} LASTFM_CACHE  Workers KV namespace for cached
 *   payloads and dedupe locks.
 * @property {string} LASTFM_USERNAME   Last.fm user to query.
 * @property {string} LASTFM_API_KEY    Last.fm API key.
 * @property {RateLimit} [LISTEN_RL]    Required Workers Rate Limiting
 *   binding. Absent/throwing → fail closed.
 */

/**
 * Per-IP rate limit gate. Uses the native Workers Rate Limiting binding
 * (GA Sep 2025); fails closed when the binding isn't configured or healthy
 * so a partially-deployed Worker cannot bypass abuse controls. The simple binding only
 * supports period=10 or period=60 (seconds), so the limit configured in
 * wrangler.toml is per-minute, not the 10-minute window mentioned in the
 * code review — wider windows would need the WAF rate-limiting rules
 * product or a Durable Object / KV implementation.
 *
 * @param {Request} request
 * @param {Env} env
 * @returns {Promise<Response|null>} a 429 response when the caller is over
 *   limit, or `null` when the request should proceed
 */
async function checkRateLimit(request, env) {
  if (!env.LISTEN_RL || typeof env.LISTEN_RL.limit !== 'function') {
    return errorJson({ error: 'service_unavailable' }, 503, { retryAfterS: 60 });
  }
  const ip = getClientIp(request) || 'unknown';
  // Key on IP + path so /now and /recent are budgeted independently.
  const key = `${ip}:${new URL(request.url).pathname}`;
  try {
    const { success } = await env.LISTEN_RL.limit({ key });
    if (success) return null;
  } catch {
    return errorJson({ error: 'service_unavailable' }, 503, { retryAfterS: 60 });
  }
  // The binding's period is 60s, so retry-after points at the next window.
  return errorJson({ error: 'rate_limited' }, 429, { retryAfterS: 60 });
}

export default {
  /**
   * Worker entrypoint. Handles the two routes:
   *   `GET /api/listening/now`     → current scrobble
   *   `GET /api/listening/recent`  → playcount + recent tracks
   * Responses go through a two-layer cache (Workers Cache API + KV) so
   * client polling collapses to a single upstream call per FRESH window.
   *
   * @param {Request} request
   * @param {Env} env
   * @param {ExecutionContext} ctx
   * @returns {Promise<Response>}
   */
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') return corsPreflight();
    if (request.method !== 'GET')     return json({ error: 'method_not_allowed' }, 405);

    const url = new URL(request.url);
    let kind;
    if      (url.pathname.endsWith('/now'))    kind = 'now';
    else if (url.pathname.endsWith('/recent')) kind = 'recent';
    else return json({ error: 'not_found' }, 404);

    // Per-IP rate limit. Runs before the edge-cache lookup so a flood of
    // requests from a single IP can't consume cache CPU even on cold paths.
    const limited = await checkRateLimit(request, env);
    if (limited) return limited;

    // Edge cache layer. Cache key is just the URL — there are no per-user or
    // per-origin variations (CORS only allows ALLOWED_ORIGIN). Workers
    // responses bypass the edge cache by default, so we have to drive it via
    // the Cache API explicitly. cache.put honours the s-maxage on the stored
    // response (set in toClient).
    const cache    = caches.default;
    const cacheKey = new Request(url.toString(), { method: 'GET' });
    const hit      = await cache.match(cacheKey);
    if (hit) return hit;

    const res = await handle(env, ctx, kind);
    // Only cache successful payloads — a transient unavailable/config or
    // upstream-failure response shouldn't lock in for the full window.
    if (res.status === 200) {
      ctx.waitUntil(cache.put(cacheKey, res.clone()));
    }
    return res;
  },
};

// ── core SWR handler ────────────────────────────────────────────────────
/**
 * Stale-while-revalidate core: serves KV when possible, kicks off background
 * refreshes for the SOFT band, and blocks only when we truly have nothing
 * fresh enough (HARD band or empty KV).
 *
 * @param {Env} env
 * @param {ExecutionContext} ctx
 * @param {'now'|'recent'} kind which payload to return
 * @returns {Promise<Response>}
 */
async function handle(env, ctx, kind) {
  if (!env.LASTFM_API_KEY || !env.LASTFM_USERNAME) {
    return toClient(json(emptyPayload(kind, 'unavailable')));
  }
  if (!env.LASTFM_CACHE) {
    return errorJson({ error: 'service_unavailable' }, 503, { retryAfterS: 60 });
  }

  const kvKey   = `${kind}:${env.LASTFM_USERNAME}`;
  const lockKey = `lock:${kvKey}`;
  const cached  = await readCache(env, kvKey);
  const age     = cached ? Date.now() - cached.fetchedAt : Infinity;

  // FRESH — just serve.
  if (cached && age < FRESH_MS) return toClient(json(cached.data));

  // SOFT — serve stale, schedule background refresh (deduped by lock).
  if (cached && age < HARD_MS) {
    ctx.waitUntil(backgroundRefresh(env, kind, kvKey, lockKey));
    return toClient(json(cached.data));
  }

  // HARD — block, refresh, write, serve.
  const fresh = await refresh(env, kind);
  if (fresh.ok) {
    ctx.waitUntil(writeCache(env, kvKey, fresh.data));
    return toClient(json(fresh.data));
  }
  // Upstream failed — serve whatever stale copy we have rather than erroring.
  if (cached) return toClient(json(cached.data));
  return toClient(json(emptyPayload(kind, 'upstream_failed')));
}

/**
 * SOFT-band background refresh: deduped via a short-lived KV lock so a
 * burst of polling clients only triggers one upstream call per window.
 *
 * @param {Env} env
 * @param {'now'|'recent'} kind
 * @param {string} kvKey  KV key for the cached payload
 * @param {string} lockKey KV key used purely as a mutex
 * @returns {Promise<void>}
 */
async function backgroundRefresh(env, kind, kvKey, lockKey) {
  // Short-lived lock: first Worker through claims it; subsequent clients
  // within the TTL see the lock and skip. KV is eventually consistent so
  // an occasional duplicate fetch is possible — within rate-limit budget.
  const locked = await kvGet(env.LASTFM_CACHE, lockKey);
  if (locked) return;
  await kvPut(env.LASTFM_CACHE, lockKey, '1', { expirationTtl: LOCK_TTL_S });

  const fresh = await refresh(env, kind);
  if (fresh.ok) await writeCache(env, kvKey, fresh.data);
}

// ── upstream fetch ──────────────────────────────────────────────────────
/**
 * Call Last.fm's `user.getrecenttracks` and reshape the response into the
 * payload our client expects. Returns a discriminated `{ ok, data }` /
 * `{ ok: false, error }` so callers can distinguish "fresh data" from
 * "upstream sad, keep serving stale".
 *
 * @param {Env} env
 * @param {'now'|'recent'} kind
 * @returns {Promise<{ ok: true, data: object } | { ok: false, error: string }>}
 */
async function refresh(env, kind) {
  try {
    const limit = kind === 'now' ? 1 : RECENT_LIMIT;
    const api = recentTracksUrl(env.LASTFM_USERNAME, env.LASTFM_API_KEY, limit);
    const res = await fetch(api, { headers: { 'User-Agent': USER_AGENT } });
    if (!res.ok) throw new Error(`lastfm ${res.status}`);
    const body = await res.json();
    if (lastfmError(body)) throw new Error(body.message || `lastfm error ${body.error}`);

    if (kind === 'now') {
      const raw = body?.recenttracks?.track || [];
      const t   = Array.isArray(raw) ? raw[0] : raw;
      const data = (t && t['@attr']?.nowplaying) ? trackToNow(t) : { nowPlaying: false };
      return { ok: true, data };
    }

    const { playcount, tracks } = decodeTracks(body, { limit: RECENT_LIMIT });
    return { ok: true, data: { playcount, tracks } };
  } catch (err) {
    return { ok: false, error: 'upstream_failed' };
  }
}

// ── KV helpers ──────────────────────────────────────────────────────────
/**
 * Read and validate a cached payload. Returns `null` on any error or
 * malformed shape so callers can treat "missing" and "corrupt" uniformly.
 *
 * @param {Env} env
 * @param {string} key
 * @returns {Promise<{ data: object, fetchedAt: number }|null>}
 */
async function readCache(env, key) {
  const entry = await kvGet(env.LASTFM_CACHE, key, { type: 'json' });
  if (!entry || typeof entry.fetchedAt !== 'number' || !entry.data) return null;
  return entry;
}

/**
 * Persist a fresh payload to KV. Errors are swallowed — the *next* tick's
 * refresh will retry, and the worst case is "extra upstream call".
 *
 * @param {Env} env
 * @param {string} key
 * @param {object} data
 * @returns {Promise<void>}
 */
async function writeCache(env, key, data) {
  await kvPut(env.LASTFM_CACHE, key, JSON.stringify({ data, fetchedAt: Date.now() }));
}

// ── payload contract (C7) ───────────────────────────────────────────────
// The static clients (static/listening-live.js, static/now-playing.js) treat
// the *presence of a truthy `reason` field* as "this is an error/fallback
// payload — do not overwrite the live UI; keep whatever is on screen".
//
//   • NO `reason`  → AUTHORITATIVE. The client applies the payload verbatim,
//     even when `playcount` is 0 or `tracks` is empty (a real "you haven't
//     scrobbled" state must be allowed to render).
//   • truthy `reason` → ERROR / DEGRADED / FALLBACK. The client ignores the
//     data and leaves the last-known-good content in place.
//
// Two invariants must therefore hold for *every* response this Worker emits:
//   1. Every error / degraded / fallback payload carries a truthy `reason`.
//   2. No genuine-success payload carries a `reason` at all.
//
// Where each branch lands:
//   • refresh() success data → { playcount, tracks } / { nowPlaying, ... } —
//     never carries `reason`. Authoritative, including empty/zero results.
//   • HARD band "upstream failed, serve stale `cached.data`" → that data is a
//     previously-successful payload with no `reason`. Correct: it is real
//     data, just stale, so the client should keep showing it.
//   • emptyPayload() → always attaches a guaranteed-truthy `reason` (see
//     below). Used for config + upstream/refresh failures that still return
//     a client-facing fallback payload. Missing required bindings fail closed
//     with a 503 envelope instead of a JSON fallback.

/**
 * Build a non-authoritative fallback payload. Always carries a truthy
 * `reason` so clients keep their live UI (contract C7 above). `reason` is
 * coerced to a non-empty string defensively — an error/fallback payload must
 * never escape with a missing or empty `reason`, or a client would mistake
 * it for an authoritative empty state and wipe good content.
 *
 * @param {'now'|'recent'} kind
 * @param {string} [reason] short machine-readable cause
 * @returns {object} payload with a guaranteed-truthy `reason`
 */
function emptyPayload(kind, reason) {
  const safeReason = (typeof reason === 'string' && reason) ? reason : 'unavailable';
  return kind === 'now'
    ? { nowPlaying: false, reason: safeReason }
    : { playcount: 0, tracks: [], reason: safeReason };
}

// ── shape helpers ───────────────────────────────────────────────────────
/**
 * The /now payload contract: `nowPlaying: true` leads, no date, no image.
 * This is a payload shape owned by this Worker (the topbar pill client
 * reads it), so it stays here — the field extraction is the codec's.
 */
function trackToNow(t) {
  const d = decodeTrack(t);
  return { nowPlaying: true, artist: d.artist, track: d.track, album: d.album, link: d.link };
}

// ── transport ───────────────────────────────────────────────────────────
// Envelope helpers (json, errorJson, corsPreflight, …) come from
// workers/lib/transport.js; only this Worker's caching POLICY lives here.
//
// Two-layer caching policy:
//   • s-maxage=EDGE_TTL_S  → Cloudflare edge stores the response for that long,
//     so concurrent polls collapse to one Worker run per window.
//   • max-age=0, must-revalidate → browser always re-asks (the request hits
//     the edge cache, not the Worker, on a HIT). Scrobble updates aren't
//     hidden behind a stale browser cache, matching the original intent.
function toClient(response) {
  return withCache(response, `public, max-age=0, s-maxage=${EDGE_TTL_S}, must-revalidate`);
}
