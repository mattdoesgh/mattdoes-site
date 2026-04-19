// /api/listening/* — tiny edge Worker reporting Last.fm listening state.
//
// Routes:
//   GET /api/listening/now      → what (if anything) is currently scrobbling
//   GET /api/listening/recent   → total scrobble count + the 25 most recent tracks
//
// Called client-side by /now-playing.js (topbar pill, all pages) and by
// /listening-live.js (recent list + counter, /listening/ page only) so both
// stay fresh between deploys.
//
// Env (wrangler secrets):
//   LASTFM_USERNAME — Last.fm user to query
//   LASTFM_API_KEY  — Last.fm API key
//
// Response shapes:
//   GET /now    → { nowPlaying: true, artist, track, album, link } | { nowPlaying: false }
//   GET /recent → { playcount: number, tracks: [{ artist, track, album, link, date, nowPlaying }, ...] }
//
// Caching:
//   Each endpoint is edge-cached via the Cache API so rapid client polls
//   don't hit Last.fm. /now is short-lived (30s); /recent is a touch longer
//   (45s) because it's heavier and scrobbles don't change that fast.

const ALLOWED_ORIGIN  = 'https://mattdoes.online';
const NOW_TTL         = 30;   // /now cache seconds (edge + browser)
const RECENT_TTL      = 45;   // /recent cache seconds (edge + browser)
const RECENT_LIMIT    = 25;   // tracks returned by /recent

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') return corsPreflight();
    if (request.method !== 'GET')     return json({ error: 'method_not_allowed' }, 405);

    const url = new URL(request.url);
    if (url.pathname.endsWith('/now'))    return handleNow(env, ctx, url);
    if (url.pathname.endsWith('/recent')) return handleRecent(env, ctx, url);
    return json({ error: 'not_found' }, 404);
  },
};

// ── /now ────────────────────────────────────────────────────────────────
async function handleNow(env, ctx, reqUrl) {
  const cacheKey = cacheKeyFor(reqUrl);
  const cache    = caches.default;
  const cached   = await cache.match(cacheKey);
  if (cached) return withCors(cached);

  if (!env.LASTFM_API_KEY || !env.LASTFM_USERNAME) {
    return json({ nowPlaying: false, reason: 'not_configured' }, 200, NOW_TTL);
  }

  let payload;
  try {
    const api = `https://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks&user=${encodeURIComponent(env.LASTFM_USERNAME)}&api_key=${encodeURIComponent(env.LASTFM_API_KEY)}&format=json&limit=1`;
    const res = await fetch(api, { cf: { cacheTtl: NOW_TTL, cacheEverything: true } });
    if (!res.ok) throw new Error(`lastfm ${res.status}`);
    const data = await res.json();
    const raw  = data?.recenttracks?.track || [];
    const t    = Array.isArray(raw) ? raw[0] : raw;
    payload    = (t && t['@attr']?.nowplaying) ? trackToNow(t) : { nowPlaying: false };
  } catch (err) {
    return json({ nowPlaying: false, error: short(err) }, 200, NOW_TTL);
  }

  const response = json(payload, 200, NOW_TTL);
  ctx.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}

// ── /recent ─────────────────────────────────────────────────────────────
// One call to user.getrecenttracks is enough: Last.fm returns both the
// track list and a `@attr.total` field carrying the all-time scrobble
// count, so we don't need a second user.getinfo round-trip.
async function handleRecent(env, ctx, reqUrl) {
  const cacheKey = cacheKeyFor(reqUrl);
  const cache    = caches.default;
  const cached   = await cache.match(cacheKey);
  if (cached) return withCors(cached);

  if (!env.LASTFM_API_KEY || !env.LASTFM_USERNAME) {
    return json({ playcount: 0, tracks: [], reason: 'not_configured' }, 200, RECENT_TTL);
  }

  let payload;
  try {
    const api = `https://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks&user=${encodeURIComponent(env.LASTFM_USERNAME)}&api_key=${encodeURIComponent(env.LASTFM_API_KEY)}&format=json&limit=${RECENT_LIMIT}`;
    const res = await fetch(api, { cf: { cacheTtl: RECENT_TTL, cacheEverything: true } });
    if (!res.ok) throw new Error(`lastfm ${res.status}`);
    const data   = await res.json();
    const raw    = data?.recenttracks?.track || [];
    const attr   = data?.recenttracks?.['@attr'] || {};
    const arr    = Array.isArray(raw) ? raw : [raw];
    const tracks = arr.map(trackToRow).filter(t => t.artist && t.track).slice(0, RECENT_LIMIT);
    payload = { playcount: Number(attr.total) || 0, tracks };
  } catch (err) {
    return json({ playcount: 0, tracks: [], error: short(err) }, 200, RECENT_TTL);
  }

  const response = json(payload, 200, RECENT_TTL);
  ctx.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}

// ── shape helpers ───────────────────────────────────────────────────────
function trackToNow(t) {
  return {
    nowPlaying: true,
    artist: (t.artist && (t.artist['#text'] || t.artist.name)) || '',
    track:  t.name || '',
    album:  (t.album && t.album['#text']) || '',
    link:   t.url || '',
  };
}

function trackToRow(t) {
  const nowPlaying = Boolean(t['@attr']?.nowplaying);
  return {
    artist: (t.artist && (t.artist['#text'] || t.artist.name)) || '',
    track:  t.name || '',
    album:  (t.album && t.album['#text']) || '',
    link:   t.url || '',
    // `@attr.nowplaying` rows have no date.uts; stamp with now so the
    // client can still sort and render a year label.
    date: nowPlaying
      ? new Date().toISOString()
      : (t.date?.uts ? new Date(Number(t.date.uts) * 1000).toISOString() : ''),
    nowPlaying,
  };
}

// ── transport helpers ───────────────────────────────────────────────────
function cacheKeyFor(reqUrl) {
  const keyUrl = new URL(reqUrl);
  keyUrl.search = '';
  return new Request(keyUrl.toString(), { method: 'GET' });
}

function json(obj, status = 200, ttl = 0) {
  const headers = {
    'content-type':                 'application/json; charset=utf-8',
    'access-control-allow-origin':  ALLOWED_ORIGIN,
    'access-control-allow-methods': 'GET, OPTIONS',
    'access-control-allow-headers': 'content-type',
    'vary':                         'origin',
  };
  if (ttl > 0) headers['cache-control'] = `public, max-age=${ttl}, s-maxage=${ttl}`;
  return new Response(JSON.stringify(obj), { status, headers });
}

function withCors(response) {
  // Cached responses already carry CORS headers; this is a defensive pass-through.
  return new Response(response.body, response);
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

function short(err) { return String(err?.message || err).slice(0, 200); }
