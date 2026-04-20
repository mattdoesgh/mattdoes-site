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
// Env (wrangler secrets):
//   LASTFM_USERNAME  — Last.fm user to query
//   LASTFM_API_KEY   — Last.fm API key
// Bindings (wrangler.toml):
//   LASTFM_CACHE     — Workers KV namespace used for cached payloads + locks
//
// Notes on Last.fm API etiquette:
//   • We always serve from KV on the request path; upstream calls happen
//     only during background refreshes, keeping call volume bounded by the
//     FRESH window regardless of traffic.
//   • A descriptive User-Agent is sent so Last.fm can identify / rate-limit
//     this client distinctly.

const ALLOWED_ORIGIN = 'https://mattdoes.online';

// Thresholds (milliseconds).
const FRESH_MS    =  5 * 60 * 1000;   //  5 min — "medium" default
const HARD_MS     = 30 * 60 * 1000;   // 30 min — upper bound on served staleness
const LOCK_TTL_S  = 60;               // KV minimum expirationTtl is 60s

const RECENT_LIMIT = 25;
const USER_AGENT   = 'mattdoes-site/1.0 (+https://mattdoes.online)';

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') return corsPreflight();
    if (request.method !== 'GET')     return json({ error: 'method_not_allowed' }, 405);

    const url = new URL(request.url);
    if (url.pathname.endsWith('/now'))    return handle(env, ctx, 'now');
    if (url.pathname.endsWith('/recent')) return handle(env, ctx, 'recent');
    return json({ error: 'not_found' }, 404);
  },
};

// ── core SWR handler ────────────────────────────────────────────────────
async function handle(env, ctx, kind) {
  if (!env.LASTFM_API_KEY || !env.LASTFM_USERNAME) {
    return toClient(json(emptyPayload(kind, 'not_configured')));
  }
  if (!env.LASTFM_CACHE) {
    // KV binding missing — degrade to a direct fetch so the site still works.
    const res = await refresh(env, kind);
    return toClient(json(res.ok ? res.data : emptyPayload(kind, res.error)));
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
  return toClient(json(emptyPayload(kind, fresh.error)));
}

async function backgroundRefresh(env, kind, kvKey, lockKey) {
  // Short-lived lock: first Worker through claims it; subsequent clients
  // within the TTL see the lock and skip. KV is eventually consistent so
  // an occasional duplicate fetch is possible — within rate-limit budget.
  const locked = await env.LASTFM_CACHE.get(lockKey);
  if (locked) return;
  try {
    await env.LASTFM_CACHE.put(lockKey, '1', { expirationTtl: LOCK_TTL_S });
  } catch { /* non-fatal */ }

  const fresh = await refresh(env, kind);
  if (fresh.ok) await writeCache(env, kvKey, fresh.data);
}

// ── upstream fetch ──────────────────────────────────────────────────────
async function refresh(env, kind) {
  try {
    const limit = kind === 'now' ? 1 : RECENT_LIMIT;
    const api = `https://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks`
              + `&user=${encodeURIComponent(env.LASTFM_USERNAME)}`
              + `&api_key=${encodeURIComponent(env.LASTFM_API_KEY)}`
              + `&format=json&limit=${limit}`;
    const res = await fetch(api, { headers: { 'User-Agent': USER_AGENT } });
    if (!res.ok) throw new Error(`lastfm ${res.status}`);
    const body = await res.json();
    const raw  = body?.recenttracks?.track || [];
    const attr = body?.recenttracks?.['@attr'] || {};
    const arr  = Array.isArray(raw) ? raw : [raw];

    if (kind === 'now') {
      const t = arr[0];
      const data = (t && t['@attr']?.nowplaying) ? trackToNow(t) : { nowPlaying: false };
      return { ok: true, data };
    }

    const tracks = arr.map(trackToRow).filter(t => t.artist && t.track).slice(0, RECENT_LIMIT);
    return { ok: true, data: { playcount: Number(attr.total) || 0, tracks } };
  } catch (err) {
    return { ok: false, error: short(err) };
  }
}

// ── KV helpers ──────────────────────────────────────────────────────────
async function readCache(env, key) {
  try {
    const entry = await env.LASTFM_CACHE.get(key, { type: 'json' });
    if (!entry || typeof entry.fetchedAt !== 'number' || !entry.data) return null;
    return entry;
  } catch {
    return null;
  }
}

async function writeCache(env, key, data) {
  try {
    await env.LASTFM_CACHE.put(key, JSON.stringify({ data, fetchedAt: Date.now() }));
  } catch { /* swallow — next tick will retry */ }
}

function emptyPayload(kind, reason) {
  return kind === 'now'
    ? { nowPlaying: false, reason }
    : { playcount: 0, tracks: [], reason };
}

// ── shape helpers (preserved from the previous Worker) ──────────────────
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
    // `@attr.nowplaying` rows carry no date.uts; stamp with now so the
    // client can still sort and render a year label.
    date: nowPlaying
      ? new Date().toISOString()
      : (t.date?.uts ? new Date(Number(t.date.uts) * 1000).toISOString() : ''),
    nowPlaying,
  };
}

// ── transport ───────────────────────────────────────────────────────────
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

// The Worker always reads from KV on the request path, so browser-side
// caching would just hide scrobble updates between polls without saving
// any upstream bandwidth. Keep `no-cache` on the response so plain reloads
// always see current KV state.
function toClient(response) {
  const h = new Headers(response.headers);
  h.set('cache-control', 'no-cache');
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

function short(err) { return String(err?.message || err).slice(0, 200); }
