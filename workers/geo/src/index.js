// /api/geo/lookup — reverse-geocode coords to a city polygon.
//
//   GET /api/geo/lookup?lat=29.76&lng=-95.37
//   → { feature: GeoJSON Feature, label: "City, State, Country" }
//
// Called by /static/geo-background.js when a visitor opts in via the
// tweaks panel and grants geolocation. Returns a simplified polygon
// suitable for the drifting SVG background.
//
// Caching strategy (mirrors mattdoes-listening):
//   • KV cache by rounded lat,lng — 7 day TTL.
//   • Cloudflare edge cache by URL — s-maxage=86400.
//   • 60s in-flight lock so concurrent misses collapse to one
//     upstream call.
//
// Privacy: incoming coords are rounded to ~11 km grid before being
// used as a cache key and before hitting Nominatim. The original
// precision is never persisted anywhere.
//
// Env / bindings:
//   GEO_CACHE — Workers KV for response cache, locks, and a best-effort budget
//   GEO_RL    — enforced native rate-limit gate for cache-miss abuse

import {
  json, errorJson, withCache, corsPreflight, kvPut, getClientIp,
} from '../../lib/transport.js';
import { simplifyGeometry } from '../../lib/simplify.js';

const COORD_PRECISION  = 1;                          // ~11 km grid
const KV_TTL_S         = 7 * 24 * 60 * 60;           // 7 days
const LOCK_TTL_S       = 60;
const EDGE_TTL_S       = 24 * 60 * 60;               // 1 day at the edge
const NOMINATIM_DELAY  = 1100;                       // ms; OSM 1 req/sec policy

// ── Upstream abuse budget (F4) ─────────────────────────────────────────
// The 60s lock above only dedupes the *same* rounded key. A caller that
// varies coordinates produces a stream of distinct cache-miss keys and can
// fan that out to Nominatim without bound.
//
// The enforced control is the native GEO_RL binding (workers/geo/wrangler.toml):
// it is race-free, and a missing or throwing binding fails closed. Its simple
// period only supports 10s or 60s, so it bounds bursts, not a 10-minute window.
//
// The KV counter below is a best-effort extra for that wider window. It is a
// read followed by a write, so concurrent requests can race past the count.
// A KV error on that path must not reject a request GEO_RL already allowed,
// and must not be treated as the control that stops a burst. The raw IP is
// hashed before it is written so the key does not store the caller address.
//
// Cap rationale: a legitimate visitor opts in once via the tweaks panel and
// (after rounding to an ~11 km grid) needs exactly one upstream lookup per
// metro they're in. Even a traveller crossing several grid cells, plus the
// occasional cache-cold retry, stays well under ~15 distinct lookups in a
// 10-minute window.
const RL_WINDOW_S      = 10 * 60;                    // 10 min rolling window
const RL_MAX_LOOKUPS   = 15;                         // best-effort lookups / window / IP

// Short TTLs so a repeated bad/empty coordinate doesn't re-hit Nominatim on
// every request. Negative ("no polygon here") results and transient upstream
// failures are cheap to remember for a few minutes.
const NEG_TTL_S        = 10 * 60;                    // negative-result cache
const ERROR_EDGE_TTL_S = 30;                         // brief edge cache for 5xx

const ADMIN_LEVELS = [
  { level: 8, zoom: 10 },
  { level: 6, zoom: 8  },
  { level: 4, zoom: 5  },
];

const USER_AGENT = 'mattdoes-site-geo/1.0 (+https://mattdoes.online)';
const COORD_LITERAL_RE = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;

// Tolerance for in-worker simplification, in degrees. ~0.005° ≈ 500 m,
// matches what we use for the baked home polygon.
const SIMPLIFY_EPS = 0.005;

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') return corsPreflight();
    if (request.method !== 'GET')     return json({ error: 'method_not_allowed' }, 405);

    const url = new URL(request.url);
    if (!url.pathname.endsWith('/lookup')) return json({ error: 'not_found' }, 404);

    const rawLat = parseCoord(url.searchParams.get('lat'));
    const rawLng = parseCoord(url.searchParams.get('lng'));
    if (rawLat == null || rawLng == null) {
      return json({ error: 'bad_request', detail: 'lat and lng required' }, 400);
    }
    // Range-validate before the coords are rounded or used as a cache key.
    // Out-of-range values can't name a real place; rejecting them here keeps
    // junk coordinates from minting cache entries or reaching Nominatim.
    if (rawLat < -90 || rawLat > 90) {
      return json({ error: 'bad_request', detail: 'lat out of range [-90, 90]' }, 400);
    }
    if (rawLng < -180 || rawLng > 180) {
      return json({ error: 'bad_request', detail: 'lng out of range [-180, 180]' }, 400);
    }
    // Round before doing anything else with the coords.
    const lat = +rawLat.toFixed(COORD_PRECISION);
    const lng = +rawLng.toFixed(COORD_PRECISION);
    const key = `geo:${lat},${lng}`;
    if (!env.GEO_CACHE) {
      return errorJson({ error: 'service_unavailable' }, 503, { retryAfterS: 60 });
    }

    // Edge cache check.
    const edge = caches.default;
    const cacheKey = new Request(
      `${url.origin}/api/geo/lookup?lat=${lat}&lng=${lng}`,
      { method: 'GET' },
    );
    const hit = await edge.match(cacheKey);
    if (hit) return hit;

    // KV cache check. A polygon entry is a real hit; a negative marker means
    // "we already looked here recently and Nominatim had nothing" — serve a
    // cached 404 instead of re-hitting upstream for the same empty cell.
    let cached;
    try {
      cached = await env.GEO_CACHE.get(key, { type: 'json' });
    } catch {
      return errorJson({ error: 'service_unavailable' }, 503, { retryAfterS: 60 });
    }
    if (cached && cached.feature) {
      const res = toClient(json(cached));
      ctx.waitUntil(edge.put(cacheKey, res.clone()));
      return res;
    }
    if (cached && cached.negative) {
      return errorJson({ error: 'no_polygon' }, 404, { edgeTtlS: NEG_TTL_S });
    }

    // Per-IP upstream budget. Everything above this point is an edge/KV cache
    // *hit* and costs us nothing upstream — only requests that reach here are
    // about to (potentially) call Nominatim. We gate exactly those so a caller
    // that fuzzes coordinates to dodge the per-key lock still can't fan out.
    // Independent of the rounded location key by design.
    const overBudget = await checkUpstreamBudget(request, env);
    if (overBudget) return overBudget;

    // 60s lock so a thundering herd doesn't fan out to Nominatim.
    // 503 busy: brief retry-after so polling clients back off instead of
    // hammering the locked key in a tight loop.
    let locked;
    try {
      locked = await env.GEO_CACHE.get(`lock:${key}`);
    } catch {
      return errorJson({ error: 'service_unavailable' }, 503, { retryAfterS: 60 });
    }
    if (locked) return errorJson({ error: 'busy' }, 503, { edgeTtlS: ERROR_EDGE_TTL_S });
    try {
      await env.GEO_CACHE.put(`lock:${key}`, '1', { expirationTtl: LOCK_TTL_S });
    } catch {
      return errorJson({ error: 'service_unavailable' }, 503, { retryAfterS: 60 });
    }

    let payload;
    try {
      payload = await lookup(lat, lng);
    } catch (err) {
      // 502 upstream_failed: brief edge cache + retry-after so a flapping
      // Nominatim doesn't get re-probed on every single request.
      return errorJson({ error: 'upstream_failed' }, 502, { edgeTtlS: ERROR_EDGE_TTL_S });
    }
    if (!payload) {
      // No polygon for this cell. Remember that briefly so a repeated empty
      // coordinate serves a cached 404 instead of re-hitting Nominatim.
      ctx.waitUntil(
        kvPut(env.GEO_CACHE, key, JSON.stringify({ negative: true }), { expirationTtl: NEG_TTL_S }),
      );
      return errorJson({ error: 'no_polygon' }, 404, { edgeTtlS: NEG_TTL_S });
    }

    ctx.waitUntil(kvPut(env.GEO_CACHE, key, JSON.stringify(payload), { expirationTtl: KV_TTL_S }));
    const res = toClient(json(payload));
    ctx.waitUntil(edge.put(cacheKey, res.clone()));
    return res;
  },
};

// ── per-IP upstream request budget ─────────────────────────────────────
/**
 * Caller-based upstream budget, independent of the rounded location key.
 *
 * The 60s lock only collapses concurrent misses for the *same* key, so a
 * caller that varies coordinates produces unbounded distinct misses and
 * Nominatim traffic. {@link env.GEO_RL} is the enforced gate for that. The
 * KV counter is a best-effort wider window: when the read succeeds and the
 * count is already at {@link RL_MAX_LOOKUPS} the request is rejected, but
 * a KV failure is ignored because concurrent read/write races already make
 * that counter an unreliable control.
 *
 * Only called on the cache-*miss* path, so edge/KV hits never consume budget.
 *
 * @param {Request} request
 * @param {{ GEO_CACHE?: KVNamespace, GEO_RL?: { limit: Function } }} env
 * @returns {Promise<Response|null>} a 429 response when over budget, else null
 */
async function checkUpstreamBudget(request, env) {
  const ip = getClientIp(request);
  if (!ip) {
    return errorJson({ error: 'service_unavailable' }, 503, { retryAfterS: 60 });
  }
  if (!env.GEO_RL || typeof env.GEO_RL.limit !== 'function') {
    return errorJson({ error: 'service_unavailable' }, 503, { retryAfterS: 60 });
  }
  // Native binding is the enforced control. It only supports 10s/60s windows
  // (see the listening Worker's checkRateLimit), so the configured limit is
  // per minute. Missing or throwing fails closed: a partially deployed Worker
  // must not reach Nominatim.
  try {
    const { success } = await env.GEO_RL.limit({ key: `${await sha256Hex(ip)}:lookup` });
    if (!success) return errorJson({ error: 'rate_limited' }, 429, { retryAfterS: 60 });
  } catch {
    return errorJson({ error: 'service_unavailable' }, 503, { retryAfterS: 60 });
  }
  // Best-effort wider window. Read-then-write can race under concurrency, so
  // this is not the burst control. Errors are ignored after GEO_RL allowed
  // the request.
  const bucket = Math.floor(Date.now() / 1000 / RL_WINDOW_S);
  const ipHash = await sha256Hex(ip);
  const rlKey  = `rl:${ipHash}:${bucket}`;
  try {
    const count = parseInt(await env.GEO_CACHE.get(rlKey), 10) || 0;
    if (count >= RL_MAX_LOOKUPS) {
      // retry-after points at the end of the current bucket window.
      const retryAfter = RL_WINDOW_S - (Math.floor(Date.now() / 1000) % RL_WINDOW_S);
      return errorJson({ error: 'rate_limited' }, 429, { retryAfterS: retryAfter });
    }
    // Count this upcoming upstream lookup. expirationTtl gives the slot a
    // hard lifetime even if the bucket math and TTL drift slightly.
    await env.GEO_CACHE.put(rlKey, String(count + 1), { expirationTtl: RL_WINDOW_S });
  } catch {
    // GEO_RL already admitted this request.
  }
  return null;
}

// ── Nominatim lookup ───────────────────────────────────────────────────
function parseCoord(value) {
  if (value == null) return null;
  const s = String(value).trim();
  if (!COORD_LITERAL_RE.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

async function lookup(lat, lng) {
  for (let i = 0; i < ADMIN_LEVELS.length; i++) {
    const { level, zoom } = ADMIN_LEVELS[i];
    if (i > 0) await sleep(NOMINATIM_DELAY);
    try {
      const url = `https://nominatim.openstreetmap.org/reverse`
        + `?lat=${lat}&lon=${lng}`
        + `&format=jsonv2`
        + `&zoom=${zoom}`
        + `&polygon_geojson=1`
        + `&addressdetails=1`;
      const res = await fetch(url, {
        headers: {
          'User-Agent': USER_AGENT,
          'Accept':     'application/json',
        },
        cf: { cacheTtl: EDGE_TTL_S, cacheEverything: true },
      });
      if (!res.ok) continue;
      const data = await res.json();
      if (!data?.geojson) continue;
      const t = data.geojson.type;
      if (t !== 'Polygon' && t !== 'MultiPolygon') continue;
      const simplified = simplifyGeometry(data.geojson, SIMPLIFY_EPS);
      if (!simplified) continue;
      return {
        feature: {
          type: 'Feature',
          properties: {
            label:      data.display_name || '',
            adminLevel: level,
            osmId:      data.osm_id || null,
            home:       false,
          },
          geometry: simplified,
        },
        label: data.display_name || '',
      };
    } catch { /* fall through to next level */ }
  }
  return null;
}

// ── transport / helpers ────────────────────────────────────────────────
// Envelope helpers (json, errorJson, corsPreflight, …) come from
// workers/lib/transport.js; only this Worker's caching POLICY lives here.
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
async function sha256Hex(value) {
  const data = new TextEncoder().encode(String(value));
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}
function toClient(response) {
  // Polygons are stable for the lifetime of the cache key (a metro
  // doesn't move). Browser revalidates after 1h, edge holds for a day.
  return withCache(response, `public, max-age=3600, s-maxage=${EDGE_TTL_S}`);
}
