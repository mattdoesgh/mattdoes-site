// /api/listening/* — Last.fm listening state, producer/reader split.
//
// Routes (read path):
//   GET /api/listening/now      → current scrobble (or { nowPlaying: false })
//   GET /api/listening/recent   → playcount + 25 most recent tracks
//
// Called client-side by /now-playing.js (topbar pill) and /listening-live.js
// (the /listening/ page). Response shapes are unchanged.
//
// Producer / reader split:
//   • PRODUCER — a single-writer Durable Object (ListeningPoller) is the ONLY
//     thing that calls Last.fm. It self-reschedules an alarm every
//     POLL_INTERVAL_MS, makes ONE user.getrecenttracks call (limit=25),
//     derives BOTH payloads (now + recent) from that one decode, and writes
//     both KV keys. On upstream failure it writes nothing, so the last good
//     snapshot survives, and the alarm is already re-armed (see alarm()).
//   • READER — the fetch() handler is a pure KV reader. It never calls
//     Last.fm, never blocks, and has zero Last.fm knowledge: rate-limit →
//     edge cache → read KV → serve verbatim. Visitors never reach the DO, so
//     upstream call volume is constant (~1 call / POLL_INTERVAL_MS),
//     independent of how many people are on the site.
//
// Bootstrap / liveness: a DO alarm is durable once set and self-perpetuates,
// but nothing starts it on first deploy (or if the chain ever permanently
// breaks). A cron watchdog (wrangler.toml [triggers]) pokes the DO once a
// minute via scheduled() → it makes NO Last.fm call; it only arms the alarm
// if none is pending. That is the active form of the "pure reader +
// monitoring" resilience posture: detect-and-re-arm a dropped poller without
// ever touching the read path (ADR 0008).
//
// On top of the reader, responses are stored in the Cloudflare edge cache for
// EDGE_TTL_S (s-maxage). Concurrent visitors polling within the same window
// collapse to a single Worker invocation; the rest are served from the edge.
// EDGE_TTL_S ≪ POLL_INTERVAL_MS so it never widens the staleness the poller
// sets. The browser still sees max-age=0 + must-revalidate, so each poll
// re-asks the edge — scrobble updates aren't hidden by a stale browser cache.
//
// Env (wrangler secrets):
//   LASTFM_USERNAME  — Last.fm user to query
//   LASTFM_API_KEY   — Last.fm API key
// Bindings (wrangler.toml):
//   LASTFM_CACHE     — Workers KV namespace used for cached payloads
//   LISTEN_RL        — Workers Rate Limiting binding (read path). Missing/
//                      unhealthy bindings fail closed so abusive traffic
//                      cannot bypass the public route budget.
//   LISTENING_POLLER — Durable Object namespace for the producer.
//
// Notes on Last.fm API etiquette:
//   • The request path never calls Last.fm; only the DO alarm does, at a
//     constant cadence regardless of traffic.
//   • A descriptive User-Agent is sent so Last.fm can identify / rate-limit
//     this client distinctly.

import {
  json, errorJson, withCache, corsPreflight, kvGet, kvPut, getClientIp,
} from '../../lib/transport.js';
import { decodeTrack, decodeTracks, lastfmError, recentTracksUrl } from '../../../lib/lastfm.js';

// Poller cadence (milliseconds). ~25s keeps now-playing sub-minute.
const POLL_INTERVAL_MS = 25 * 1000;
const EDGE_TTL_S       = 15;          // edge-cache window; must be ≪ POLL_INTERVAL_MS / 1000

const RECENT_LIMIT = 25;
const USER_AGENT   = 'mattdoes-site/1.0 (+https://mattdoes.online)';

/**
 * @typedef {object} Env
 * @property {KVNamespace} LASTFM_CACHE  Workers KV namespace for cached
 *   payloads written by the poller.
 * @property {string} LASTFM_USERNAME   Last.fm user to query.
 * @property {string} LASTFM_API_KEY    Last.fm API key.
 * @property {RateLimit} [LISTEN_RL]    Required Workers Rate Limiting
 *   binding for the read path. Absent/throwing → fail closed.
 * @property {DurableObjectNamespace} [LISTENING_POLLER]  The producer DO.
 */

/**
 * Per-IP rate limit gate for the read path. Uses the native Workers Rate
 * Limiting binding (GA Sep 2025); fails closed when the binding isn't
 * configured or healthy so a partially-deployed Worker cannot bypass abuse
 * controls. The simple binding only supports period=10 or period=60
 * (seconds), so the limit configured in wrangler.toml is per-minute; wider
 * windows would need the WAF rate-limiting rules product.
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
   * Read path. Pure KV reader for:
   *   `GET /api/listening/now`     → current scrobble
   *   `GET /api/listening/recent`  → playcount + recent tracks
   * Never calls Last.fm. Responses go through the edge Cache API so client
   * polling collapses to a single Worker invocation per EDGE_TTL_S window.
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
    // responses bypass the edge cache by default, so we drive it via the
    // Cache API explicitly. cache.put honours the s-maxage set in toClient.
    const cache    = caches.default;
    const cacheKey = new Request(url.toString(), { method: 'GET' });
    const hit      = await cache.match(cacheKey);
    if (hit) return hit;

    const res = await handle(env, kind);
    // Only cache successful payloads — a transient unavailable/warming
    // response shouldn't lock in for the full window.
    if (res.status === 200) {
      ctx.waitUntil(cache.put(cacheKey, res.clone()));
    }
    return res;
  },

  /**
   * Cron watchdog (wrangler.toml [triggers]). Liveness only: ensure the
   * singleton poller's alarm is armed. Makes NO Last.fm call — the actual
   * polling is the DO alarm. If the alarm chain ever drops, the next tick
   * re-arms it. No-ops when the DO binding is absent.
   *
   * @param {ScheduledController} event
   * @param {Env} env
   * @param {ExecutionContext} ctx
   * @returns {Promise<void>}
   */
  async scheduled(event, env, ctx) {
    if (!env.LISTENING_POLLER) return;
    const id   = env.LISTENING_POLLER.idFromName('singleton');
    const stub = env.LISTENING_POLLER.get(id);
    ctx.waitUntil(stub.fetch('https://poller/ensure'));
  },
};

// ── producer: ListeningPoller Durable Object ─────────────────────────────
/**
 * The single Last.fm writer. A classic (non-RPC) Durable Object class so the
 * Worker module stays importable under `node --test` without the
 * `cloudflare:workers` module (the read-path test harness imports this file
 * directly). It owns exactly two behaviours:
 *   • fetch('…/ensure') — bootstrap: arm the alarm if none is pending. Called
 *     by the cron watchdog; idempotent, so repeated pokes never reset cadence.
 *   • alarm() — the poll: reschedule FIRST (so an upstream error can never
 *     break the self-perpetuating chain — alarms also auto-retry on a thrown
 *     handler, and refreshBoth swallows its own errors so this never throws),
 *     then refresh both KV payloads from one upstream call.
 */
export class ListeningPoller {
  constructor(state, env) {
    this.state = state;
    this.env   = env;
  }

  async fetch() {
    if ((await this.state.storage.getAlarm()) === null) {
      // Kick almost immediately; alarm() takes over the ~25s cadence.
      await this.state.storage.setAlarm(Date.now() + 1000);
    }
    return new Response(null, { status: 204 });
  }

  async alarm() {
    // Self-perpetuate FIRST: the chain must outlive any single failed poll.
    await this.state.storage.setAlarm(Date.now() + POLL_INTERVAL_MS);
    await refreshBoth(this.env);
  }
}

// ── reader ───────────────────────────────────────────────────────────────
/**
 * Pure KV reader. Serves the last snapshot the poller wrote; never calls
 * Last.fm and never blocks. Before the first poll (e.g. right after deploy,
 * until the watchdog arms the alarm) KV is empty and we return a `warming`
 * fallback — a truthy `reason` so clients keep their last-known-good UI
 * (contract C7) and the build-time snapshot (lib/listening.js) falls through
 * to its disk cache rather than baking an empty page.
 *
 * @param {Env} env
 * @param {'now'|'recent'} kind which payload to return
 * @returns {Promise<Response>}
 */
async function handle(env, kind) {
  if (!env.LASTFM_API_KEY || !env.LASTFM_USERNAME) {
    return toClient(json(emptyPayload(kind, 'unavailable')));
  }
  if (!env.LASTFM_CACHE) {
    return errorJson({ error: 'service_unavailable' }, 503, { retryAfterS: 60 });
  }

  const cached = await readCache(env, `${kind}:${env.LASTFM_USERNAME}`);
  if (cached) return toClient(json(cached.data));
  return toClient(json(emptyPayload(kind, 'warming')));
}

// ── producer fetch ───────────────────────────────────────────────────────
/**
 * Call Last.fm's `user.getrecenttracks` ONCE and write BOTH payloads to KV
 * from a single decode, so `/now` and `/recent` can never disagree and only
 * one upstream call covers both. On any failure — bad creds/binding, non-200,
 * Last.fm error JSON, parse error — write nothing: the last good snapshot
 * survives in KV and the next alarm retries.
 *
 * @param {Env} env
 * @returns {Promise<void>}
 */
async function refreshBoth(env) {
  if (!env.LASTFM_API_KEY || !env.LASTFM_USERNAME || !env.LASTFM_CACHE) return;
  try {
    const api = recentTracksUrl(env.LASTFM_USERNAME, env.LASTFM_API_KEY, RECENT_LIMIT);
    const res = await fetch(api, { headers: { 'User-Agent': USER_AGENT } });
    if (!res.ok) throw new Error(`lastfm ${res.status}`);
    const body = await res.json();
    if (lastfmError(body)) throw new Error(body.message || `lastfm error ${body.error}`);

    // recent: full {playcount, tracks}, capped at RECENT_LIMIT.
    const { playcount, tracks } = decodeTracks(body, { limit: RECENT_LIMIT });

    // now: derived from the RAW track[0] @attr.nowplaying flag (not the
    // filtered `tracks` array), preserving the exact shape the old per-kind
    // refresh produced.
    const raw = body?.recenttracks?.track || [];
    const t   = Array.isArray(raw) ? raw[0] : raw;
    const now = (t && t['@attr']?.nowplaying) ? trackToNow(t) : { nowPlaying: false };

    const user = env.LASTFM_USERNAME;
    await Promise.all([
      writeCache(env, `recent:${user}`, { playcount, tracks }),
      writeCache(env, `now:${user}`, now),
    ]);
  } catch {
    // Upstream sad — leave KV untouched; the alarm is already re-armed.
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
 * Persist a fresh payload to KV. Errors are swallowed — the next alarm's
 * refresh will retry, and the worst case is a slightly older snapshot.
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
// Two invariants must hold for *every* response the reader emits:
//   1. Every error / degraded / fallback payload carries a truthy `reason`.
//   2. No genuine-success payload carries a `reason` at all.
//
// Where each branch lands:
//   • poller-written data → { playcount, tracks } / { nowPlaying, ... } —
//     never carries `reason`. Authoritative, including empty/zero results.
//   • reader serves a surviving KV snapshot when the poller is stalled/down —
//     that data is a previously-successful payload with no `reason`. Correct:
//     it is real data, just stale, so the client keeps showing it.
//   • emptyPayload() → always attaches a guaranteed-truthy `reason`. Used for
//     missing creds (`unavailable`) and the pre-first-poll empty-KV window
//     (`warming`). Missing required bindings fail closed with a 503 envelope
//     instead of a JSON fallback.

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
