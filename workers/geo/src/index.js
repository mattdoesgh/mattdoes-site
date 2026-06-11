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
//   GEO_CACHE — Workers KV (added in wrangler.toml after first deploy)

import {
  json, errorJson, withCache, corsPreflight, kvGet, kvPut, getClientIp, shortError,
} from '../../lib/transport.js';

const COORD_PRECISION  = 1;                          // ~11 km grid
const KV_TTL_S         = 7 * 24 * 60 * 60;           // 7 days
const LOCK_TTL_S       = 60;
const EDGE_TTL_S       = 24 * 60 * 60;               // 1 day at the edge
const NOMINATIM_DELAY  = 1100;                       // ms; OSM 1 req/sec policy

// ── Upstream abuse budget (F4) ─────────────────────────────────────────
// The 60s lock above only dedupes the *same* rounded key. A caller that
// varies coordinates produces a stream of distinct cache-miss keys and can
// fan that out to Nominatim without bound. To cap that, we keep a per-IP
// counter of how many *distinct upstream lookups* a single caller has
// triggered inside a rolling window, independent of the location key.
//
// Cap rationale: a legitimate visitor opts in once via the tweaks panel and
// (after rounding to an ~11 km grid) needs exactly one upstream lookup per
// metro they're in. Even a traveller crossing several grid cells, plus the
// occasional cache-cold retry, stays well under ~15 distinct lookups in a
// 10-minute window. Anything above that is a coordinate-fuzzing abuser, so
// 15 / 10 min is generous for humans yet hard-bounds Nominatim traffic.
const RL_WINDOW_S      = 10 * 60;                    // 10 min rolling window
const RL_MAX_LOOKUPS   = 15;                         // distinct upstream lookups / window / IP

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

// Tolerance for in-worker simplification, in degrees. ~0.005° ≈ 500 m,
// matches what we use for the baked home polygon.
const SIMPLIFY_EPS = 0.005;

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') return corsPreflight();
    if (request.method !== 'GET')     return json({ error: 'method_not_allowed' }, 405);

    const url = new URL(request.url);
    if (!url.pathname.endsWith('/lookup')) return json({ error: 'not_found' }, 404);

    const rawLat = parseFloat(url.searchParams.get('lat'));
    const rawLng = parseFloat(url.searchParams.get('lng'));
    if (!isFinite(rawLat) || !isFinite(rawLng)) {
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
    // kvGet fails OPEN (absent binding or a KV read error reads as a miss):
    // a cache miss is recoverable, a crashed handler is not. Mirrors the
    // lock/budget posture below.
    const cached = await kvGet(env.GEO_CACHE, key, { type: 'json' });
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
    // Independent of the rounded location key by design. Fails OPEN: no
    // binding, or any KV error, skips the limit so the Worker still works
    // without GEO_CACHE — same posture as the lock code below.
    const overBudget = await checkUpstreamBudget(request, env, ctx);
    if (overBudget) return overBudget;

    // 60s lock so a thundering herd doesn't fan out to Nominatim.
    // 503 busy: brief retry-after so polling clients back off instead of
    // hammering the locked key in a tight loop. kvGet/kvPut fail OPEN —
    // skip the lock rather than crash the handler.
    const locked = await kvGet(env.GEO_CACHE, `lock:${key}`);
    if (locked) return errorJson({ error: 'busy' }, 503, { edgeTtlS: ERROR_EDGE_TTL_S });
    await kvPut(env.GEO_CACHE, `lock:${key}`, '1', { expirationTtl: LOCK_TTL_S });

    let payload;
    try {
      payload = await lookup(lat, lng);
    } catch (err) {
      // 502 upstream_failed: brief edge cache + retry-after so a flapping
      // Nominatim doesn't get re-probed on every single request.
      return errorJson({ error: 'upstream_failed', detail: shortError(err) }, 502, { edgeTtlS: ERROR_EDGE_TTL_S });
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
 * Nominatim traffic. This counts how many cache-miss requests a single IP
 * has driven inside a rolling {@link RL_WINDOW_S} window and rejects further
 * lookups once over {@link RL_MAX_LOOKUPS}.
 *
 * Only called on the cache-*miss* path, so edge/KV hits never consume budget.
 *
 * Fails OPEN: when `env.GEO_CACHE` is absent or KV throws, the limit is
 * skipped and the request proceeds — the Worker must keep functioning
 * without the binding, exactly like the in-flight lock code.
 *
 * @param {Request} request
 * @param {{ GEO_CACHE?: KVNamespace }} env
 * @param {ExecutionContext} ctx
 * @returns {Promise<Response|null>} a 429 response when over budget, else null
 */
async function checkUpstreamBudget(request, env, ctx) {
  if (!env.GEO_CACHE) return null;            // fail open — no binding
  const ip = getClientIp(request);
  if (!ip) return null;                       // fail open — can't attribute
  // Bucket the window so the counter key naturally expires and resets:
  // every request inside the same RL_WINDOW_S slice shares one key.
  const bucket = Math.floor(Date.now() / 1000 / RL_WINDOW_S);
  const rlKey  = `rl:${ip}:${bucket}`;
  // Deliberately NOT kvGet/kvPut: a read error must also skip the increment,
  // so the read and the conditional write share one fail-open guard.
  try {
    const count = parseInt(await env.GEO_CACHE.get(rlKey), 10) || 0;
    if (count >= RL_MAX_LOOKUPS) {
      // retry-after points at the end of the current bucket window.
      const retryAfter = RL_WINDOW_S - (Math.floor(Date.now() / 1000) % RL_WINDOW_S);
      return errorJson({ error: 'rate_limited' }, 429, { retryAfterS: retryAfter });
    }
    // Count this upcoming upstream lookup. expirationTtl gives the slot a
    // hard lifetime even if the bucket math and TTL drift slightly.
    ctx.waitUntil(
      env.GEO_CACHE.put(rlKey, String(count + 1), { expirationTtl: RL_WINDOW_S }),
    );
    return null;
  } catch {
    return null;                              // fail open — KV error
  }
}

// ── Nominatim lookup ───────────────────────────────────────────────────
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

// ── inline RDP simplifier (same shape as scripts/bake-home-geojson.js) ─
function perpDist([px, py], [ax, ay], [bx, by]) {
  const dx = bx - ax, dy = by - ay;
  if (dx === 0 && dy === 0) return Math.hypot(px - ax, py - ay);
  const t = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy);
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
function rdp(points, eps) {
  if (points.length < 3) return points.slice();
  let maxDist = 0, idx = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const d = perpDist(points[i], points[0], points[points.length - 1]);
    if (d > maxDist) { maxDist = d; idx = i; }
  }
  if (maxDist > eps) {
    const left  = rdp(points.slice(0, idx + 1), eps);
    const right = rdp(points.slice(idx),        eps);
    return left.slice(0, -1).concat(right);
  }
  return [points[0], points[points.length - 1]];
}
function simplifyRing(ring, eps) {
  if (ring.length < 4) return ring;
  const closed = ring[0][0] === ring[ring.length - 1][0]
              && ring[0][1] === ring[ring.length - 1][1];
  const open = closed ? ring.slice(0, -1) : ring;
  const simplified = rdp(open, eps);
  if (closed) simplified.push(simplified[0]);
  return simplified;
}
const isValidRing = (r) => r.length >= 4;
function simplifyGeometry(g, eps) {
  if (g.type === 'Polygon') {
    const rings = g.coordinates.map(r => simplifyRing(r, eps)).filter(isValidRing);
    return rings.length ? { type: 'Polygon', coordinates: rings } : null;
  }
  if (g.type === 'MultiPolygon') {
    const polys = g.coordinates
      .map(p => p.map(r => simplifyRing(r, eps)).filter(isValidRing))
      .filter(p => p.length > 0);
    if (!polys.length) return null;
    if (polys.length === 1) return { type: 'Polygon', coordinates: polys[0] };
    return { type: 'MultiPolygon', coordinates: polys };
  }
  return null;
}

// ── transport / helpers ────────────────────────────────────────────────
// Envelope helpers (json, errorJson, corsPreflight, …) come from
// workers/lib/transport.js; only this Worker's caching POLICY lives here.
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function toClient(response) {
  // Polygons are stable for the lifetime of the cache key (a metro
  // doesn't move). Browser revalidates after 1h, edge holds for a day.
  return withCache(response, `public, max-age=3600, s-maxage=${EDGE_TTL_S}`);
}
