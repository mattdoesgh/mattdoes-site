// /api/listening/* — Last.fm listening state, producer/reader split.
//
// Routes (read path):
//   GET /api/listening/now      → current scrobble (or { nowPlaying: false })
//   GET /api/listening/recent   → playcount + 25 most recent tracks
//   GET /api/listening/charts   → top artists and albums for the fixed periods
//
// /now and /recent are called client-side by /now-playing.js (topbar pill)
// and /listening-live.js (the /listening/ page). Response shapes for those
// two are unchanged. /charts is fetched by the Pages build (lib/listening.js).
// The page does not call it from the browser, so connect-src stays 'self'.
//
// Producer / reader split:
//   • PRODUCER — a Durable Object (ListeningPoller) is the only caller of
//     user.getrecenttracks. It self-reschedules an alarm every
//     POLL_INTERVAL_MS, makes ONE call (limit=25), derives BOTH payloads
//     (now + recent) from that one decode, and writes both KV keys. On
//     upstream failure it writes nothing, so the last good snapshot
//     survives, and the alarm is already re-armed (see alarm()).
//   • READER — /now and /recent never call Last.fm: rate-limit → edge cache
//     → read KV → serve verbatim. Visitors never reach the DO, so recent-
//     track call volume stays constant (~1 call / POLL_INTERVAL_MS).
//   • CHARTS — GET /api/listening/charts reads a KV entry cached for hours.
//     A miss calls user.gettopartists and user.gettopalbums for the fixed
//     period list, then stores the result. The poller is not involved. The
//     Last.fm user is the Worker secret, never a request field.
//
// Bootstrap / liveness: a DO alarm is durable once set and self-perpetuates,
// but nothing starts it on first deploy (or if the chain ever permanently
// breaks). A cron watchdog (wrangler.toml [triggers]) pokes the DO once a
// minute via scheduled() → it makes NO Last.fm call; it only arms the alarm
// if none is pending. That is the active form of the "pure reader +
// monitoring" resilience posture: detect-and-re-arm a dropped poller without
// ever touching the read path.
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
//   • /now and /recent never call Last.fm. The DO alarm does, at a constant
//     cadence, one user.getrecenttracks per tick.
//   • /charts calls Last.fm only when its KV entry is older than
//     CHARTS_TTL_MS. A short lock collapses a burst into one round.
//   • A descriptive User-Agent is sent so Last.fm can identify this client.
//     Request URLs are not logged: they carry the API key.

import {
  json, errorJson, withCache, corsPreflight, kvGet, kvPut, getClientIp, sha256Hex,
} from '../../lib/transport.js';
import {
  LISTENING_PERIODS, TOP_LIMIT, decodeTopAlbums, decodeTopArtists, decodeTrack,
  decodeTracks, lastfmError, recentTracksUrl, topAlbumsUrl, topArtistsUrl,
} from '../../../lib/lastfm.js';

// Poller cadence (milliseconds). ~25s keeps now-playing sub-minute.
const POLL_INTERVAL_MS = 25 * 1000;
const EDGE_TTL_S       = 15;          // edge-cache window; must be ≪ POLL_INTERVAL_MS / 1000

const RECENT_LIMIT = 25;
const USER_AGENT   = 'mattdoes-site/1.0 (+https://mattdoes.online)';
// Charts move on a scale of months. Six hours matches the site rebuild and
// keeps a cold Pages build from calling Last.fm again on the next deploy.
const CHARTS_TTL_MS      = 6 * 60 * 60 * 1000;
const CHARTS_EDGE_TTL_S  = 6 * 60 * 60;
const CHARTS_KEY         = 'charts';
const CHARTS_LOCK_KEY    = 'charts:lock';

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
 * configured or healthy, or when Cloudflare did not supply a client IP, so
 * a partially-deployed Worker cannot bypass abuse controls. The simple
 * binding only supports period=10 or period=60 (seconds), so the limit
 * configured in wrangler.toml is per-minute; wider windows would need the
 * WAF rate-limiting rules product.
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
  // No client IP means the binding cannot be keyed. Fail closed rather than
  // sharing one 'unknown' bucket that a caller could hide in.
  const ip = getClientIp(request);
  if (!ip) return errorJson({ error: 'service_unavailable' }, 503, { retryAfterS: 60 });
  // Hash the address so the rate-limit key is not the raw IP. Path stays in
  // the key so /now, /recent, and /charts are budgeted independently.
  const key = `${await sha256Hex(ip)}:${new URL(request.url).pathname}`;
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
   *   `GET /api/listening/charts`  → top artists and albums, cached for hours
   * `/now` and `/recent` never call Last.fm. `/charts` calls Last.fm only on
   * a cache miss, then stores the result for CHARTS_TTL_MS. The recent-tracks
   * poller is not involved.
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
    // Exact paths only. A suffix match would admit a route that merely
    // finished with /now if the Worker route ever widened. /charts takes
    // no query string: the period list and the Last.fm user come from
    // this Worker, not the request.
    let kind;
    if (url.pathname === '/api/listening/now') kind = 'now';
    else if (url.pathname === '/api/listening/recent') kind = 'recent';
    else if (url.pathname === '/api/listening/charts') kind = 'charts';
    else return json({ error: 'not_found' }, 404);

    // Per-IP rate limit. Runs before the edge-cache lookup so a flood of
    // requests from a single IP can't consume cache CPU even on cold paths.
    const limited = await checkRateLimit(request, env);
    if (limited) return limited;
    // A query string is not an input. 404, no-store, and the body does not
    // echo it. Rate limit already ran, so a scan still spends the budget.
    if (kind === 'charts' && url.search) return errorJson({ error: 'not_found' }, 404);

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
    // response shouldn't lock in for the full window. Chart failures carry
    // `reason` and stay uncached so the next build can try again.
    if (res.status === 200 && kind !== 'charts') {
      ctx.waitUntil(cache.put(cacheKey, res.clone()));
    }
    if (kind === 'charts' && res.status === 200) {
      const body = await res.clone().json().catch(() => null);
      if (chartsCacheable(body)) {
        const cached = toChartsClient(res);
        ctx.waitUntil(cache.put(cacheKey, cached.clone()));
        return cached;
      }
      // A reason payload must not sit in a browser or edge cache.
      const headers = new Headers(res.headers);
      headers.set('cache-control', 'no-store');
      return new Response(res.body, { status: res.status, headers });
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
 * The single recent-tracks writer. A classic (non-RPC) Durable Object class so the
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
 * /now and /recent serve the last snapshot the poller wrote and never call
 * Last.fm. /charts is dispatched first. Before the first poll (e.g. right
 * after deploy, until the watchdog arms the alarm) KV is empty and we return
 * a `warming` fallback — a truthy `reason` so clients keep their last-known-
 * good UI (contract C7) and the build-time snapshot (lib/listening.js) falls
 * through to its disk cache rather than baking an empty page.
 *
 * @param {Env} env
 * @param {'now'|'recent'|'charts'} kind which payload to return
 * @returns {Promise<Response>}
 */
async function handle(env, kind) {
  if (kind === 'charts') return handleCharts(env);
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

/**
 * Top artists and top albums for the fixed period list. The Last.fm user is
 * the Worker secret, never a request field, and it is not copied into the
 * payload. A miss fetches Last.fm once and stores the result for hours. A
 * failed refresh keeps the previous payload when there is one.
 *
 * @param {Env} env
 * @returns {Promise<Response>}
 */
async function handleCharts(env) {
  if (!env.LASTFM_API_KEY || !env.LASTFM_USERNAME) {
    return json({ periods: {}, reason: 'unavailable' });
  }
  if (!env.LASTFM_CACHE) {
    return errorJson({ error: 'service_unavailable' }, 503, { retryAfterS: 60 });
  }

  const cached = await readCache(env, CHARTS_KEY);
  const fresh = cached && (Date.now() - cached.fetchedAt < CHARTS_TTL_MS) && cached.data?.periods;
  if (fresh) return json(cached.data);

  const lock = await kvGet(env.LASTFM_CACHE, CHARTS_LOCK_KEY);
  if (lock) {
    if (cached?.data?.periods) return json(cached.data);
    return json({ periods: {}, reason: 'warming' });
  }
  // Short lock so a burst of cold requests shares one Last.fm round.
  await kvPut(env.LASTFM_CACHE, CHARTS_LOCK_KEY, '1', { expirationTtl: 60 });
  try {
    const periods = await fetchChartPeriods(env);
    if (!periods) {
      if (cached?.data?.periods) return json(cached.data);
      return json({ periods: {}, reason: 'unavailable' });
    }
    const data = { periods };
    await writeCache(env, CHARTS_KEY, data);
    return json(data);
  } finally {
    try { await env.LASTFM_CACHE.delete(CHARTS_LOCK_KEY); } catch { /* ttl clears it */ }
  }
}

/**
 * One Last.fm chart call. Null on any failure. The URL is not logged: it
 * carries the API key.
 *
 * @param {string} url
 * @param {(body: object) => object[]} decode
 * @returns {Promise<object[]|null>}
 */
async function fetchOneChart(url, decode) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (lastfmError(data)) return null;
    return decode(data);
  } catch {
    return null;
  }
}

/**
 * Fixed periods only. Returns null when every call failed so the caller can
 * keep a stale snapshot instead of caching an empty page.
 *
 * @param {Env} env
 * @returns {Promise<object|null>}
 */
async function fetchChartPeriods(env) {
  const user = env.LASTFM_USERNAME;
  const key = env.LASTFM_API_KEY;
  let any = false;
  const periods = {};
  await Promise.all(LISTENING_PERIODS.map(async ({ id }) => {
    const [artists, albums] = await Promise.all([
      fetchOneChart(topArtistsUrl(user, key, id, TOP_LIMIT), decodeTopArtists),
      fetchOneChart(topAlbumsUrl(user, key, id, TOP_LIMIT), decodeTopAlbums),
    ]);
    // null is a failed call. An array, including an empty one, is a success.
    if (artists !== null || albums !== null) any = true;
    periods[id] = { artists: artists || [], albums: albums || [] };
  }));
  return any ? periods : null;
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

    const { now, recent } = deriveBoth(body);
    const user = env.LASTFM_USERNAME;
    await Promise.all([
      writeCache(env, `recent:${user}`, recent),
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
 * Derive BOTH KV payloads from one parsed `user.getrecenttracks` body. Pure —
 * no env, no network, no clock decisions of its own — so the two-source
 * derivation (`/recent` from the decoded track list, `/now` from the raw
 * track[0] `@attr.nowplaying` flag) is testable without fetch mocks.
 * Exported for tests only; the poller is the sole runtime caller.
 *
 * @param {object} body  parsed JSON response (already checked for
 *   {@link lastfmError} by the caller)
 * @returns {{ now: object, recent: { playcount: number, tracks: object[] } }}
 */
export function deriveBoth(body) {
  // recent: full {playcount, tracks}, capped at RECENT_LIMIT.
  const recent = decodeTracks(body, { limit: RECENT_LIMIT });

  // now: derived from the RAW track[0] @attr.nowplaying flag (not the
  // filtered `tracks` array), preserving the exact shape the old per-kind
  // refresh produced.
  const raw = body?.recenttracks?.track || [];
  const t   = Array.isArray(raw) ? raw[0] : raw;
  const now = (t && t['@attr']?.nowplaying) ? trackToNow(t) : { nowPlaying: false };

  return { now, recent };
}

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

function toChartsClient(response) {
  return withCache(response, `public, max-age=0, s-maxage=${CHARTS_EDGE_TTL_S}, must-revalidate`);
}

/**
 * Long-cache only a real chart payload. Reason responses and anything
 * without the fixed period ids stay uncached.
 *
 * @param {object|null} body
 * @returns {boolean}
 */
function chartsCacheable(body) {
  if (!body || body.reason) return false;
  const periods = body.periods;
  if (!periods || typeof periods !== 'object' || Array.isArray(periods)) return false;
  return LISTENING_PERIODS.some(({ id }) => Object.prototype.hasOwnProperty.call(periods, id));
}
