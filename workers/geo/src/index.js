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

const ALLOWED_ORIGIN = 'https://mattdoes.online';

const COORD_PRECISION  = 1;                          // ~11 km grid
const KV_TTL_S         = 7 * 24 * 60 * 60;           // 7 days
const LOCK_TTL_S       = 60;
const EDGE_TTL_S       = 24 * 60 * 60;               // 1 day at the edge
const NOMINATIM_DELAY  = 1100;                       // ms; OSM 1 req/sec policy

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

    // KV cache check.
    if (env.GEO_CACHE) {
      const cached = await env.GEO_CACHE.get(key, { type: 'json' });
      if (cached && cached.feature) {
        const res = toClient(json(cached));
        ctx.waitUntil(edge.put(cacheKey, res.clone()));
        return res;
      }
    }

    // 60s lock so a thundering herd doesn't fan out to Nominatim.
    if (env.GEO_CACHE) {
      const locked = await env.GEO_CACHE.get(`lock:${key}`);
      if (locked) return json({ error: 'busy' }, 503);
      try { await env.GEO_CACHE.put(`lock:${key}`, '1', { expirationTtl: LOCK_TTL_S }); } catch {}
    }

    let payload;
    try {
      payload = await lookup(lat, lng);
    } catch (err) {
      return json({ error: 'upstream_failed', detail: short(err) }, 502);
    }
    if (!payload) return json({ error: 'no_polygon' }, 404);

    if (env.GEO_CACHE) {
      ctx.waitUntil(env.GEO_CACHE.put(key, JSON.stringify(payload), { expirationTtl: KV_TTL_S }));
    }
    const res = toClient(json(payload));
    ctx.waitUntil(edge.put(cacheKey, res.clone()));
    return res;
  },
};

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
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function short(err) { return String(err?.message || err).slice(0, 200); }
function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      'content-type':                 'application/json; charset=utf-8',
      'access-control-allow-origin':  ALLOWED_ORIGIN,
      'access-control-allow-methods': 'GET, OPTIONS',
      'access-control-allow-headers': 'content-type',
      'vary':                         'origin',
    },
  });
}
function toClient(response) {
  const h = new Headers(response.headers);
  // Polygons are stable for the lifetime of the cache key (a metro
  // doesn't move). Browser revalidates after 1h, edge holds for a day.
  h.set('cache-control', `public, max-age=3600, s-maxage=${EDGE_TTL_S}`);
  h.set('access-control-allow-origin', ALLOWED_ORIGIN);
  return new Response(response.body, { status: response.status, headers: h });
}
function corsPreflight() {
  return new Response(null, {
    status: 204,
    headers: {
      'access-control-allow-origin':  ALLOWED_ORIGIN,
      'access-control-allow-methods': 'GET, OPTIONS',
      'access-control-allow-headers': 'content-type',
      'access-control-max-age':       '86400',
    },
  });
}
