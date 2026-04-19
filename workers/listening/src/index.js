// /api/listening/now — returns what (if anything) is currently scrobbling on
// Last.fm. Called client-side by /now-playing.js to keep the topbar status
// pill live between deploys.
//
// Env (wrangler.toml [vars] + secrets):
//   LASTFM_USERNAME — Last.fm user to query (secret; not shown publicly)
//   LASTFM_API_KEY  — Last.fm API key (secret)
//
// Response shape:
//   { nowPlaying: true, artist, track, album, link }
//   { nowPlaying: false }
//
// Caching:
//   Edge-cached for 30s via Cache API so rapid client polls don't hit
//   Last.fm. Clients can still poll every minute without concern.

const ALLOWED_ORIGIN = 'https://mattdoes.online';
const EDGE_TTL       = 30;          // seconds at the CF edge
const CLIENT_TTL     = 30;          // seconds in the browser
const LASTFM_LIMIT   = 1;           // we only need the most recent track

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') return corsPreflight();
    if (request.method !== 'GET')     return json({ error: 'method_not_allowed' }, 405);

    // Cache-key is origin-independent so all callers share one cached response.
    const cacheUrl = new URL(request.url);
    cacheUrl.search = '';
    const cacheKey = new Request(cacheUrl.toString(), { method: 'GET' });
    const cache    = caches.default;

    const cached = await cache.match(cacheKey);
    if (cached) return withCors(cached);

    if (!env.LASTFM_API_KEY || !env.LASTFM_USERNAME) {
      return json({ nowPlaying: false, reason: 'not_configured' }, 200, CLIENT_TTL);
    }

    let payload;
    try {
      const url = `https://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks&user=${encodeURIComponent(env.LASTFM_USERNAME)}&api_key=${encodeURIComponent(env.LASTFM_API_KEY)}&format=json&limit=${LASTFM_LIMIT}`;
      const res = await fetch(url, { cf: { cacheTtl: EDGE_TTL, cacheEverything: true } });
      if (!res.ok) throw new Error(`lastfm ${res.status}`);
      const data = await res.json();
      const raw  = data?.recenttracks?.track || [];
      const t    = Array.isArray(raw) ? raw[0] : raw;

      if (t && t['@attr']?.nowplaying) {
        payload = {
          nowPlaying: true,
          artist: (t.artist && (t.artist['#text'] || t.artist.name)) || '',
          track:  t.name || '',
          album:  (t.album && t.album['#text']) || '',
          link:   t.url || '',
        };
      } else {
        payload = { nowPlaying: false };
      }
    } catch (err) {
      return json({ nowPlaying: false, error: String(err?.message || err).slice(0, 200) }, 200, CLIENT_TTL);
    }

    const response = json(payload, 200, CLIENT_TTL);
    // Stash a clone in the edge cache so the next poller doesn't re-hit Last.fm.
    ctx.waitUntil(cache.put(cacheKey, response.clone()));
    return response;
  },
};

// ── helpers ──────────────────────────────────────────────────────────────

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
