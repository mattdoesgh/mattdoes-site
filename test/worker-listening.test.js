// Listening Worker — producer/reader split.
//
// Two surfaces are exercised here:
//   • PRODUCER — the ListeningPoller DO alarm: the ONLY Last.fm caller. One
//     upstream call must write BOTH KV payloads from one decode; failures must
//     leave KV intact and keep the alarm chain alive.
//   • READER — /now and /recent: a KV reader that must NEVER call Last.fm
//     (assert upstreamCalls === 0 on those routes).
//   • CHARTS — GET /api/listening/charts may call Last.fm on a cache miss.
//     The poller alarm must still make exactly one getrecenttracks call.
//
// Contract C7 (documented in workers/listening/src/index.js): every error /
// degraded / fallback payload carries a truthy `reason`; no genuine-success
// payload carries one. The static clients use the presence of `reason` to
// decide whether to keep stale UI or apply the update.
//
// Each reader test installs a FRESH `caches` stub. The reader must not wait on
// it: a missing or expired Cache API entry is logged as a 504, and the last
// good snapshot lives in KV. Reusing one stub across scenarios with the same
// route would also leak a cached response if a test started consulting it.

import test from 'node:test';
import assert from 'node:assert/strict';
import listeningWorker, { ListeningPoller, deriveBoth } from '../workers/listening/src/index.js';
import {
  KVStub, DurableStateStub, makeCtx, installCaches, installFetch,
  workerRequest, jsonResponse,
} from './helpers/worker-env.js';

const RECENT = 'https://listening.mattdoes.online/api/listening/recent';
const NOW    = 'https://listening.mattdoes.online/api/listening/now';

/** A Last.fm getrecenttracks body with `n` real tracks and a total count. */
function lastfmBody(n, total) {
  const track = [];
  for (let i = 0; i < n; i++) {
    track.push({
      name: `Song ${i}`,
      artist: { '#text': `Artist ${i}` },
      album:  { '#text': `Album ${i}` },
      url:    `https://www.last.fm/music/x/_/song-${i}`,
      date:   { uts: String(1_700_000_000 + i) },
    });
  }
  return { recenttracks: { track, '@attr': { total: String(total) } } };
}

/** A getrecenttracks body whose first track is currently playing. */
function nowPlayingBody(url = 'https://www.last.fm/x') {
  return {
    recenttracks: {
      track: [{
        name: 'Live Song',
        artist: { '#text': 'Live Artist' },
        album:  { '#text': 'Live Album' },
        url,
        '@attr': { nowplaying: 'true' },
      }],
      '@attr': { total: '5' },
    },
  };
}

/** Mirror the poller's KV envelope so reader tests can seed a snapshot. */
async function seed(kv, key, data) {
  await kv.put(key, JSON.stringify({ data, fetchedAt: 1_700_000_000_000 }));
}

/** Run one poll (the DO alarm) with a stubbed upstream. */
async function runPoll(env, fetchHandler) {
  const fetchStub = installFetch(fetchHandler);
  const state = new DurableStateStub();
  try {
    await new ListeningPoller(state, env).alarm();
    return { upstreamCalls: fetchStub.calls.length, state };
  } finally {
    fetchStub.restore();
  }
}

/**
 * Drive the read path once with a fresh runtime. The reader must never call
 * Last.fm, so the fetch stub only exists to *count* (and would surface any
 * stray upstream call). LISTEN_RL defaults to "allowed".
 */
async function read(url, env) {
  const caches = installCaches();
  const fetchStub = installFetch(() => jsonResponse({}));
  try {
    const ctx = makeCtx();
    const fullEnv = { LISTEN_RL: { limit: async () => ({ success: true }) }, ...env };
    const res = await listeningWorker.fetch(
      workerRequest(url, { headers: { 'cf-connecting-ip': '203.0.113.9' } }),
      fullEnv,
      ctx,
    );
    await ctx.settle();
    const body = await res.clone().json();
    return { status: res.status, body, upstreamCalls: fetchStub.calls.length };
  } finally {
    caches.restore();
    fetchStub.restore();
  }
}

// ── deriveBoth: pure two-source derivation ────────────────────────────────
// /recent comes from the decoded track list; /now from the raw track[0]
// @attr.nowplaying flag. Divergence between the two sources is the bug class
// these cases pin down — no fetch mocks required.
for (const { name, body, now, recent } of [
  {
    name: 'empty track array → nowPlaying:false, empty recent',
    body: { recenttracks: { track: [], '@attr': { total: '0' } } },
    now: { nowPlaying: false },
    recent: { playcount: 0, tracks: [] },
  },
  {
    name: 'missing @attr on track[0] → not now-playing',
    body: lastfmBody(1, 3),
    now: { nowPlaying: false },
    recent: { playcount: 3 },
  },
  {
    name: 'nowplaying "true" → full now payload, no date/image',
    body: nowPlayingBody(),
    now: {
      nowPlaying: true, artist: 'Live Artist', track: 'Live Song',
      album: 'Live Album', link: 'https://www.last.fm/x',
    },
    recent: { playcount: 5 },
  },
  {
    name: 'nowplaying "false" is truthy for Last.fm → treated as playing',
    body: {
      recenttracks: {
        track: [{ name: 'S', artist: { '#text': 'A' }, '@attr': { nowplaying: 'false' } }],
        '@attr': { total: '1' },
      },
    },
    now: { nowPlaying: true, artist: 'A', track: 'S', album: '', link: '' },
    recent: { playcount: 1 },
  },
  {
    name: 'single track as bare object (Last.fm quirk) → still decoded',
    body: {
      recenttracks: {
        track: { name: 'Solo', artist: { '#text': 'One' }, '@attr': { nowplaying: 'true' } },
        '@attr': { total: '1' },
      },
    },
    now: { nowPlaying: true, artist: 'One', track: 'Solo', album: '', link: '' },
    recent: { playcount: 1 },
  },
  {
    name: 'malformed entries (no artist/title) → dropped from recent, not now-playing',
    body: {
      recenttracks: {
        track: [{ url: 'https://www.last.fm/x' }, { name: 'no artist' }],
        '@attr': { total: '2' },
      },
    },
    now: { nowPlaying: false },
    recent: { playcount: 2, tracks: [] },
  },
  {
    name: 'missing recenttracks entirely → empty authoritative payloads',
    body: {},
    now: { nowPlaying: false },
    recent: { playcount: 0, tracks: [] },
  },
]) {
  test(`deriveBoth: ${name}`, () => {
    const derived = deriveBoth(body);
    assert.deepEqual(derived.now, now);
    for (const [k, v] of Object.entries(recent)) {
      assert.deepEqual(derived.recent[k], v);
    }
    assert.equal('reason' in derived.now, false, 'derived payloads are authoritative');
    assert.equal('reason' in derived.recent, false);
  });
}

test('deriveBoth: recent is capped at the poll limit', () => {
  const { recent } = deriveBoth(lastfmBody(30, 100));
  assert.equal(recent.tracks.length, 25);
  assert.equal(recent.playcount, 100);
});

// ── producer: one call, both payloads ────────────────────────────────────
test('poller: one upstream call writes both now and recent from one response', async () => {
  const env = { LASTFM_API_KEY: 'k', LASTFM_USERNAME: 'u', LASTFM_CACHE: new KVStub() };
  const { upstreamCalls } = await runPoll(env, () => jsonResponse(lastfmBody(3, 9001)));

  assert.equal(upstreamCalls, 1, 'one call must cover both endpoints');

  const recent = await env.LASTFM_CACHE.get('recent:u', { type: 'json' });
  const now    = await env.LASTFM_CACHE.get('now:u',    { type: 'json' });
  assert.equal(recent.data.playcount, 9001);
  assert.equal(recent.data.tracks.length, 3);
  assert.equal('reason' in recent.data, false, 'recent snapshot is authoritative');
  assert.equal(now.data.nowPlaying, false, 'no nowplaying track → nowPlaying:false');
  assert.equal('reason' in now.data, false, 'now snapshot is authoritative');
});

test('poller: a nowplaying track yields nowPlaying:true', async () => {
  const env = { LASTFM_API_KEY: 'k', LASTFM_USERNAME: 'u', LASTFM_CACHE: new KVStub() };
  await runPoll(env, () => jsonResponse(nowPlayingBody()));

  const now = await env.LASTFM_CACHE.get('now:u', { type: 'json' });
  assert.equal(now.data.nowPlaying, true);
  assert.equal(now.data.track, 'Live Song');
  assert.equal('reason' in now.data, false);
});

test('poller: a nowplaying payload strips unsafe Last.fm links', async () => {
  const env = { LASTFM_API_KEY: 'k', LASTFM_USERNAME: 'u', LASTFM_CACHE: new KVStub() };
  await runPoll(env, () => jsonResponse(nowPlayingBody('javascript:alert(1)')));

  const now = await env.LASTFM_CACHE.get('now:u', { type: 'json' });
  assert.equal(now.data.nowPlaying, true);
  assert.equal(now.data.link, '', 'unsafe scheme must be dropped');
});

test('poller: a real empty result is authoritative (no reason)', async () => {
  const env = { LASTFM_API_KEY: 'k', LASTFM_USERNAME: 'u', LASTFM_CACHE: new KVStub() };
  await runPoll(env, () => jsonResponse(lastfmBody(0, 0)));

  const recent = await env.LASTFM_CACHE.get('recent:u', { type: 'json' });
  assert.equal('reason' in recent.data, false, 'a real empty result must be authoritative');
  assert.equal(recent.data.playcount, 0);
  assert.deepEqual(recent.data.tracks, []);
});

// ── producer: failures leave KV intact, chain survives ───────────────────
test('poller: upstream failure leaves KV intact and re-arms the alarm', async () => {
  const kv = new KVStub();
  await seed(kv, 'recent:u', { playcount: 7, tracks: [] });
  await seed(kv, 'now:u',    { nowPlaying: false });
  const env = { LASTFM_API_KEY: 'k', LASTFM_USERNAME: 'u', LASTFM_CACHE: kv };

  const { upstreamCalls, state } = await runPoll(env,
    () => new Response('upstream boom', { status: 500 }));

  assert.equal(upstreamCalls, 1);
  const recent = await kv.get('recent:u', { type: 'json' });
  assert.equal(recent.fetchedAt, 1_700_000_000_000, 'snapshot untouched on failure');
  assert.equal(recent.data.playcount, 7);
  assert.notEqual(await state.storage.getAlarm(), null, 'alarm re-armed before the fetch');
});

test('poller: a Last.fm error JSON body leaves KV intact', async () => {
  const kv = new KVStub();
  await seed(kv, 'recent:u', { playcount: 7, tracks: [] });
  const env = { LASTFM_API_KEY: 'k', LASTFM_USERNAME: 'u', LASTFM_CACHE: kv };

  await runPoll(env, () => jsonResponse({ error: 10, message: 'Invalid API key' }));

  const recent = await kv.get('recent:u', { type: 'json' });
  assert.equal(recent.fetchedAt, 1_700_000_000_000,
    'a Last.fm error must not overwrite the good snapshot');
});

test('poller: no credentials → no upstream call, alarm still armed', async () => {
  const { upstreamCalls, state } = await runPoll(
    { LASTFM_CACHE: new KVStub() }, () => jsonResponse(lastfmBody(1, 1)));
  assert.equal(upstreamCalls, 0, 'missing creds must not hit Last.fm');
  assert.notEqual(await state.storage.getAlarm(), null, 'alarm armed so it recovers when creds arrive');
});

// ── producer: bootstrap is idempotent ────────────────────────────────────
test('poller: ensure() arms the alarm only when none is pending', async () => {
  const state = new DurableStateStub();
  const poller = new ListeningPoller(state, {});
  assert.equal(await state.storage.getAlarm(), null);

  await poller.fetch();
  const armed = await state.storage.getAlarm();
  assert.notEqual(armed, null, 'first poke arms the alarm');

  await poller.fetch();
  assert.equal(await state.storage.getAlarm(), armed, 'second poke is a no-op');
});

// ── reader: serves KV verbatim, never calls Last.fm ──────────────────────
test('reader: serves the recent snapshot verbatim, no reason, no upstream call', async () => {
  const kv = new KVStub();
  await seed(kv, 'recent:u', { playcount: 42, tracks: [{ track: 'x' }] });
  const { status, body, upstreamCalls } = await read(RECENT,
    { LASTFM_API_KEY: 'k', LASTFM_USERNAME: 'u', LASTFM_CACHE: kv });

  assert.equal(status, 200);
  assert.equal(upstreamCalls, 0, 'the read path must never call Last.fm');
  assert.equal('reason' in body, false);
  assert.equal(body.playcount, 42);
  assert.deepEqual(body.tracks, [{ track: 'x' }]);
});

test('reader: serves the now snapshot verbatim', async () => {
  const kv = new KVStub();
  await seed(kv, 'now:u', { nowPlaying: true, artist: 'A', track: 'T', album: '', link: '' });
  const { status, body, upstreamCalls } = await read(NOW,
    { LASTFM_API_KEY: 'k', LASTFM_USERNAME: 'u', LASTFM_CACHE: kv });

  assert.equal(status, 200);
  assert.equal(upstreamCalls, 0);
  assert.equal('reason' in body, false);
  assert.equal(body.nowPlaying, true);
  assert.equal(body.track, 'T');
});

// ── reader: empty KV warm-up window ──────────────────────────────────────
test('reader: empty KV returns a warming fallback (truthy reason)', async () => {
  const { status, body, upstreamCalls } = await read(RECENT,
    { LASTFM_API_KEY: 'k', LASTFM_USERNAME: 'u', LASTFM_CACHE: new KVStub() });

  assert.equal(status, 200);
  assert.equal(upstreamCalls, 0);
  assert.equal(body.reason, 'warming', 'pre-first-poll state keeps clients on last-known-good');
  assert.equal(body.playcount, 0);
  assert.deepEqual(body.tracks, []);
});

test('reader: the now endpoint warming fallback carries a reason', async () => {
  const { body } = await read(NOW,
    { LASTFM_API_KEY: 'k', LASTFM_USERNAME: 'u', LASTFM_CACHE: new KVStub() });
  assert.equal(body.reason, 'warming');
  assert.equal(body.nowPlaying, false);
});

// ── reader: missing creds / bindings ─────────────────────────────────────
test('reader: a missing-credentials payload carries reason "unavailable"', async () => {
  const { body } = await read(RECENT, {}); // no creds, no KV
  assert.equal(body.reason, 'unavailable');
  assert.equal(body.playcount, 0);
  assert.deepEqual(body.tracks, []);
});

test('reader: without KV, the Worker fails closed', async () => {
  const { status, body, upstreamCalls } = await read(RECENT,
    { LASTFM_API_KEY: 'k', LASTFM_USERNAME: 'u' }); // no LASTFM_CACHE
  assert.equal(status, 503);
  assert.deepEqual(body, { error: 'service_unavailable' });
  assert.equal(upstreamCalls, 0);
});

test('reader: without the rate-limit binding, the Worker fails closed', async () => {
  const caches = installCaches();
  const fetchStub = installFetch(() => jsonResponse({}));
  try {
    const env = { LASTFM_API_KEY: 'k', LASTFM_USERNAME: 'u', LASTFM_CACHE: new KVStub() };
    const res = await listeningWorker.fetch(workerRequest(RECENT), env, makeCtx());
    assert.equal(res.status, 503);
    assert.deepEqual(await res.json(), { error: 'service_unavailable' });
    assert.equal(fetchStub.calls.length, 0);
  } finally { caches.restore(); fetchStub.restore(); }
});

// ── reader: rate limit envelope ──────────────────────────────────────────
test('reader: an over-limit caller gets a 429 with the full CORS envelope', async () => {
  const caches = installCaches();
  const fetchStub = installFetch(() => jsonResponse({}));
  try {
    const env = {
      LASTFM_API_KEY: 'k', LASTFM_USERNAME: 'u', LASTFM_CACHE: new KVStub(),
      LISTEN_RL: { limit: async () => ({ success: false }) },
    };
    const res = await listeningWorker.fetch(
      workerRequest(RECENT, { headers: { 'cf-connecting-ip': '203.0.113.1' } }), env, makeCtx());
    assert.equal(res.status, 429);
    assert.deepEqual(await res.json(), { error: 'rate_limited' });
    assert.equal(res.headers.get('retry-after'),   '60');
    assert.equal(res.headers.get('cache-control'), 'no-store');
    // The shared errorJson envelope supplies CORS without a misleading Vary.
    assert.equal(res.headers.get('access-control-allow-origin'),  'https://mattdoes.online');
    assert.equal(res.headers.get('access-control-allow-methods'), 'GET, OPTIONS');
    assert.equal(res.headers.get('access-control-allow-headers'), 'content-type');
    assert.equal(res.headers.get('vary'),                         null);
  } finally { caches.restore(); fetchStub.restore(); }
});

test('reader: a missing client IP fails closed before Last.fm or KV is treated as a hit', async () => {
  const kv = new KVStub();
  await seed(kv, 'recent:u', { playcount: 42, tracks: [{ track: 'x' }] });
  const caches = installCaches();
  const fetchStub = installFetch(() => jsonResponse({}));
  try {
    const env = {
      LASTFM_API_KEY: 'k', LASTFM_USERNAME: 'u', LASTFM_CACHE: kv,
      LISTEN_RL: { limit: async () => ({ success: true }) },
    };
    const res = await listeningWorker.fetch(workerRequest(RECENT), env, makeCtx());
    assert.equal(res.status, 503);
    assert.deepEqual(await res.json(), { error: 'service_unavailable' });
    assert.equal(fetchStub.calls.length, 0);
  } finally { caches.restore(); fetchStub.restore(); }
});

test('reader: only the exact /now and /recent paths are served', async () => {
  const env = { LASTFM_API_KEY: 'k', LASTFM_USERNAME: 'u', LASTFM_CACHE: new KVStub() };
  const extra = await read('https://listening.mattdoes.online/api/listening/now/extra', env);
  assert.equal(extra.status, 404);
  assert.deepEqual(extra.body, { error: 'not_found' });
  assert.equal(extra.upstreamCalls, 0);
  const suffix = await read('https://listening.mattdoes.online/api/not-listening/now', env);
  assert.equal(suffix.status, 404);
});

test('reader: a foreign Origin is not reflected', async () => {
  const kv = new KVStub();
  await seed(kv, 'recent:u', { playcount: 1, tracks: [] });
  const caches = installCaches();
  const fetchStub = installFetch(() => jsonResponse({}));
  try {
    const env = {
      LASTFM_API_KEY: 'k', LASTFM_USERNAME: 'u', LASTFM_CACHE: kv,
      LISTEN_RL: { limit: async () => ({ success: true }) },
    };
    const res = await listeningWorker.fetch(workerRequest(RECENT, {
      headers: { 'cf-connecting-ip': '203.0.113.9', origin: 'https://evil.example' },
    }), env, makeCtx());
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('access-control-allow-origin'), 'https://mattdoes.online');
    assert.equal(fetchStub.calls.length, 0);
  } finally { caches.restore(); fetchStub.restore(); }
});

test('poller: an upstream failure does not log the API key', async () => {
  const errors = [];
  const logs = [];
  const originalError = console.error;
  const originalLog = console.log;
  console.error = (...args) => { errors.push(args.map(String).join(' ')); };
  console.log = (...args) => { logs.push(args.map(String).join(' ')); };
  const key = 'supersecretlastfmkey123456';
  try {
    const env = { LASTFM_API_KEY: key, LASTFM_USERNAME: 'u', LASTFM_CACHE: new KVStub() };
    await runPoll(env, () => { throw new Error(`boom ${key}`); });
  } finally {
    console.error = originalError;
    console.log = originalLog;
  }
  const logged = `${errors.join('\n')}\n${logs.join('\n')}`;
  assert.equal(logged.includes(key), false);
});

test('reader: a non-GET request is rejected', async () => {
  const caches = installCaches();
  const fetchStub = installFetch(() => jsonResponse({}));
  try {
    const res = await listeningWorker.fetch(
      workerRequest(RECENT, { method: 'POST' }), {}, makeCtx());
    assert.equal(res.status, 405);
  } finally { caches.restore(); fetchStub.restore(); }
});

// ── watchdog: scheduled() pokes the singleton poller, no upstream call ────
test('scheduled: the watchdog pokes the poller and makes no Last.fm call', async () => {
  const fetchStub = installFetch(() => jsonResponse({}));
  try {
    let poked = 0;
    const env = {
      LISTENING_POLLER: {
        idFromName: (name) => ({ name }),
        get: () => ({ fetch: async () => { poked++; return new Response(null, { status: 204 }); } }),
      },
    };
    const ctx = makeCtx();
    await listeningWorker.scheduled({ cron: '* * * * *' }, env, ctx);
    await ctx.settle();
    assert.equal(poked, 1, 'watchdog must poke the poller exactly once');
    assert.equal(fetchStub.calls.length, 0, 'the watchdog must not call Last.fm');
  } finally { fetchStub.restore(); }
});

test('scheduled: no-ops when the poller binding is absent', async () => {
  const ctx = makeCtx();
  await listeningWorker.scheduled({ cron: '* * * * *' }, {}, ctx);
  await ctx.settle(); // must not throw
});

// ── charts: cached for hours, fixed periods, no request input ───────────
const CHARTS = 'https://listening.mattdoes.online/api/listening/charts';
const CHART_USER = 'djverism-secret';
const PERIODS = ['overall', '12month', '3month', '1month'];

function chartEnv(kv = new KVStub()) {
  return {
    LASTFM_API_KEY: 'secret-key',
    LASTFM_USERNAME: CHART_USER,
    LASTFM_CACHE: kv,
    LISTEN_RL: { limit: async () => ({ success: true }) },
  };
}

function lastfmChart(url) {
  const parsed = new URL(url);
  const period = parsed.searchParams.get('period');
  assert.equal(parsed.searchParams.get('limit'), '25');
  assert.doesNotMatch(url, /gettopartists/);
  if (url.includes('method=user.gettopalbums')) {
    return jsonResponse({
      topalbums: {
        album: [{
          name: `Album ${period}`,
          playcount: '2',
          artist: { name: 'Album Artist' },
          url: 'https://www.last.fm/music/Album+Artist/Album',
          image: [
            { size: 'small', '#text': 'https://lastfm.freetls.fastly.net/i/u/34s/abc.jpg' },
            { size: 'extralarge', '#text': 'https://lastfm.freetls.fastly.net/i/u/300x300/abc.jpg' },
            { size: 'mega', '#text': 'https://lastfm.freetls.fastly.net/i/u/300x300/2a96cbd8b46e442fc41c2b86b821562f.png' },
          ],
        }],
        '@attr': { user: CHART_USER },
      },
    });
  }
  return jsonResponse({ error: 3, message: `unknown method for ${CHART_USER}` }, 200);
}

const API_CSP = "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

function assertApiEnvelope(headers) {
  assert.equal(headers.get('access-control-allow-origin'), 'https://mattdoes.online');
  assert.equal(headers.get('access-control-allow-methods'), 'GET, OPTIONS');
  assert.equal(headers.get('strict-transport-security'), 'max-age=31536000');
  assert.equal(headers.get('content-security-policy'), API_CSP);
  assert.equal(headers.get('x-content-type-options'), 'nosniff');
}

async function fetchCharts(url, env, fetchHandler, headers = {}) {
  const caches = installCaches();
  const fetchStub = installFetch(fetchHandler);
  try {
    const ctx = makeCtx();
    const res = await listeningWorker.fetch(workerRequest(url, {
      headers: { 'cf-connecting-ip': '203.0.113.9', origin: 'https://evil.example', ...headers },
    }), env, ctx);
    await ctx.settle();
    const body = await res.clone().json();
    return { status: res.status, body, headers: res.headers, calls: fetchStub.calls };
  } finally {
    caches.restore();
    fetchStub.restore();
  }
}

function seedCharts(kv, fetchedAt, periods) {
  return kv.put('charts:img', JSON.stringify({ data: { periods }, fetchedAt }));
}

test('charts: a cold miss fetches the four periods and hides the username', async () => {
  const kv = new KVStub();
  const { status, body, headers, calls } = await fetchCharts(CHARTS, chartEnv(kv), lastfmChart);

  assert.equal(status, 200);
  assert.equal(calls.length, 4, 'four period album charts');
  assert.ok(calls.every((url) => url.includes(`user=${encodeURIComponent(CHART_USER)}`)));
  assert.ok(calls.every((url) => url.includes('api_key=secret-key')));
  assert.equal(calls.filter((url) => url.includes('gettopartists')).length, 0);
  assert.equal(calls.filter((url) => url.includes('gettopalbums')).length, 4);
  assert.equal('reason' in body, false);
  assert.equal(body.periods.overall.albums[0].name, 'Album overall');
  assert.equal(body.periods.overall.albums[0].url, 'https://www.last.fm/music/Album+Artist/Album');
  assert.equal(body.periods.overall.albums[0].image, 'https://lastfm.freetls.fastly.net/i/u/300x300/abc.jpg');
  assert.equal(body.periods.overall.artists, undefined);
  assert.equal(body.periods['1month'].albums[0].name, 'Album 1month');
  for (const id of PERIODS) assert.ok(body.periods[id]);
  assert.equal(JSON.stringify(body).includes(CHART_USER), false);
  assert.equal(JSON.stringify(body).includes('secret-key'), false);
  assertApiEnvelope(headers);
  assert.equal(headers.get('cache-control'), 'public, max-age=21600, s-maxage=21600, must-revalidate');
  assert.equal(
    headers.get('cloudflare-cdn-cache-control'),
    'public, max-age=21600, stale-while-revalidate=86400, stale-if-error=86400',
  );

  const stored = await kv.get('charts:img', { type: 'json' });
  assert.equal(stored.data.periods.overall.albums[0].name, 'Album overall');
  assert.equal(stored.data.periods.overall.albums[0].image, 'https://lastfm.freetls.fastly.net/i/u/300x300/abc.jpg');
  assert.equal(JSON.stringify(stored).includes(CHART_USER), false);

  const again = await fetchCharts(CHARTS, chartEnv(kv), () => {
    throw new Error('fresh charts must not call Last.fm');
  });
  assert.equal(again.calls.length, 0);
  assert.equal(again.body.periods.overall.albums[0].name, 'Album overall');
});

test('cache: browser max-age matches the freshness of now, recent, and charts', async () => {
  const kv = new KVStub();
  await seed(kv, 'now:u', { nowPlaying: false });
  await seed(kv, 'recent:u', { playcount: 3, tracks: [] });
  await kv.put('charts:img', JSON.stringify({
    data: {
      periods: {
        overall: { artists: [], albums: [] },
        '12month': { artists: [], albums: [] },
        '3month': { artists: [], albums: [] },
        '1month': { artists: [], albums: [] },
      },
    },
    fetchedAt: Date.now(),
  }));
  const env = {
    LASTFM_API_KEY: 'k',
    LASTFM_USERNAME: 'u',
    LASTFM_CACHE: kv,
    LISTEN_RL: { limit: async () => ({ success: true }) },
  };
  const caches = installCaches();
  const fetchStub = installFetch(() => { throw new Error('cache policy must not call Last.fm'); });
  try {
    const EDGE_RECENT = 'public, max-age=15, stale-while-revalidate=86400, stale-if-error=86400';
    const hit = async (url) => {
      const res = await listeningWorker.fetch(
        workerRequest(url, { headers: { 'cf-connecting-ip': '203.0.113.9' } }),
        env,
        makeCtx(),
      );
      assert.equal(res.status, 200);
      return {
        browser: res.headers.get('cache-control'),
        edge: res.headers.get('cloudflare-cdn-cache-control'),
      };
    };
    const now = await hit(NOW);
    const recent = await hit(RECENT);
    const charts = await hit(CHARTS);
    assert.equal(now.browser, 'public, max-age=15, s-maxage=15, must-revalidate');
    assert.equal(recent.browser, 'public, max-age=60, s-maxage=15, must-revalidate');
    assert.equal(charts.browser, 'public, max-age=21600, s-maxage=21600, must-revalidate');
    assert.equal(now.edge, EDGE_RECENT);
    assert.equal(recent.edge, EDGE_RECENT);
    assert.equal(charts.edge, 'public, max-age=21600, stale-while-revalidate=86400, stale-if-error=86400');
    assert.equal(fetchStub.calls.length, 0);
  } finally {
    caches.restore();
    fetchStub.restore();
  }
});

test('reader: a hung edge cache still serves the last KV snapshot', { timeout: 1500 }, async () => {
  const kv = new KVStub();
  await seed(kv, 'recent:u', { playcount: 42, tracks: [] });
  const env = {
    LASTFM_API_KEY: 'k',
    LASTFM_USERNAME: 'u',
    LASTFM_CACHE: kv,
    LISTEN_RL: { limit: async () => ({ success: true }) },
  };
  const prior = globalThis.caches;
  let matchCalls = 0;
  globalThis.caches = {
    default: {
      match() {
        matchCalls += 1;
        return new Promise(() => {});
      },
      async put() {},
    },
  };
  const fetchStub = installFetch(() => { throw new Error('reader must not call Last.fm'); });
  try {
    const started = Date.now();
    const res = await listeningWorker.fetch(
      workerRequest(RECENT, { headers: { 'cf-connecting-ip': '203.0.113.9' } }),
      env,
      makeCtx(),
    );
    const elapsed = Date.now() - started;
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.playcount, 42);
    assert.equal('reason' in body, false);
    assert.ok(elapsed < 500, `last snapshot served in ${elapsed}ms`);
    assert.equal(fetchStub.calls.length, 0);
    assert.equal(matchCalls, 0, 'the reader must not wait on caches.default');
    assert.equal(
      res.headers.get('cloudflare-cdn-cache-control'),
      'public, max-age=15, stale-while-revalidate=86400, stale-if-error=86400',
    );
  } finally {
    fetchStub.restore();
    if (prior === undefined) delete globalThis.caches;
    else globalThis.caches = prior;
  }
});

test('reader: an empty snapshot is not pinned as stale at the edge', async () => {
  const caches = installCaches();
  const fetchStub = installFetch(() => jsonResponse({}));
  try {
    const res = await listeningWorker.fetch(
      workerRequest(RECENT, { headers: { 'cf-connecting-ip': '203.0.113.9' } }),
      {
        LASTFM_API_KEY: 'k',
        LASTFM_USERNAME: 'u',
        LASTFM_CACHE: new KVStub(),
        LISTEN_RL: { limit: async () => ({ success: true }) },
      },
      makeCtx(),
    );
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.reason, 'warming');
    assert.equal(res.headers.get('cloudflare-cdn-cache-control'), null);
    assert.equal(fetchStub.calls.length, 0);
  } finally {
    caches.restore();
    fetchStub.restore();
  }
});

test('poller: a hung Last.fm call times out and leaves KV intact', { timeout: 1500 }, async () => {
  const kv = new KVStub();
  await seed(kv, 'recent:u', { playcount: 7, tracks: [] });
  await seed(kv, 'now:u', { nowPlaying: false });
  const env = { LASTFM_API_KEY: 'k', LASTFM_USERNAME: 'u', LASTFM_CACHE: kv };
  const timeouts = new WeakMap();
  const originalTimeout = AbortSignal.timeout;
  // AbortSignal.timeout's own timer does not keep the test runner's event
  // loop alive. Record the deadline the worker asked for, and abort on a
  // ref'd timer so a hung fetch still fails the poll.
  AbortSignal.timeout = (ms) => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(new DOMException('timeout', 'TimeoutError')), 20);
    timeouts.set(controller.signal, ms);
    return controller.signal;
  };
  const fetchStub = installFetch((_url, init) => new Promise((_resolve, reject) => {
    const signal = init?.signal;
    if (!signal) {
      reject(new Error('missing abort signal'));
      return;
    }
    assert.equal(timeouts.get(signal), 8000);
    const fail = () => reject(signal.reason ?? new Error('aborted'));
    if (signal.aborted) fail();
    else signal.addEventListener('abort', fail, { once: true });
  }));
  const state = new DurableStateStub();
  try {
    await new ListeningPoller(state, env).alarm();
    assert.equal(fetchStub.calls.length, 1);
    const recent = await kv.get('recent:u', { type: 'json' });
    const now = await kv.get('now:u', { type: 'json' });
    assert.equal(recent.fetchedAt, 1_700_000_000_000, 'hung upstream must not overwrite KV');
    assert.equal(recent.data.playcount, 7);
    assert.equal(now.data.nowPlaying, false);
    assert.notEqual(await state.storage.getAlarm(), null, 'alarm stays armed');
  } finally {
    AbortSignal.timeout = originalTimeout;
    fetchStub.restore();
  }
});

test('charts: a query string is a 404 and is not echoed', async () => {
  const probe = 'user=djverism-secret&period=overall';
  const { status, body, headers, calls } = await fetchCharts(
    `${CHARTS}?${probe}`, chartEnv(), () => { throw new Error('query must not reach Last.fm'); });
  assert.equal(status, 404);
  assert.deepEqual(body, { error: 'not_found' });
  assert.equal(JSON.stringify(body).includes(probe), false);
  assert.equal(JSON.stringify(body).includes(CHART_USER), false);
  assertApiEnvelope(headers);
  assert.equal(headers.get('cache-control'), 'no-store');
  assert.equal(calls.length, 0);
});

test('charts: missing credentials hide the charts and do not call Last.fm', async () => {
  const { status, body, headers, calls } = await fetchCharts(
    CHARTS, { LISTEN_RL: { limit: async () => ({ success: true }) }, LASTFM_CACHE: new KVStub() },
    () => { throw new Error('missing creds must not call Last.fm'); });
  assert.equal(status, 200);
  assert.equal(body.reason, 'unavailable');
  assert.deepEqual(body.periods, {});
  assertApiEnvelope(headers);
  assert.equal(headers.get('cache-control'), 'no-store');
  assert.equal(calls.length, 0);
});

test('charts: without KV the worker fails closed', async () => {
  const { status, body, calls } = await fetchCharts(
    CHARTS,
    { LASTFM_API_KEY: 'k', LASTFM_USERNAME: CHART_USER, LISTEN_RL: { limit: async () => ({ success: true }) } },
    () => jsonResponse({}));
  assert.equal(status, 503);
  assert.deepEqual(body, { error: 'service_unavailable' });
  assert.equal(calls.length, 0);
});

test('charts: a total Last.fm failure is not cached and carries a reason', async () => {
  const kv = new KVStub();
  const { status, body, calls } = await fetchCharts(
    CHARTS, chartEnv(kv), () => new Response('no', { status: 500 }));
  assert.equal(status, 200);
  assert.equal(body.reason, 'unavailable');
  assert.deepEqual(body.periods, {});
  assert.equal(calls.length, 4);
  assert.equal(await kv.get('charts:img'), null);
  assert.equal(JSON.stringify(body).includes(CHART_USER), false);
});

test('charts: a failed refresh keeps the previous payload', async () => {
  const kv = new KVStub();
  const staleAt = Date.now() - (7 * 60 * 60 * 1000);
  const periods = {
    overall: { albums: [{ name: 'Kept', artist: 'Kept Artist', playcount: 3, url: '', image: '' }] },
    '12month': { albums: [] },
    '3month': { albums: [] },
    '1month': { albums: [] },
  };
  await seedCharts(kv, staleAt, periods);
  const { status, body, calls } = await fetchCharts(
    CHARTS, chartEnv(kv), () => new Response('no', { status: 500 }));
  assert.equal(status, 200);
  assert.equal('reason' in body, false);
  assert.equal(body.periods.overall.albums[0].name, 'Kept');
  assert.equal(calls.length, 4);
  const stored = await kv.get('charts:img', { type: 'json' });
  assert.equal(stored.fetchedAt, staleAt, 'a failed refresh must not overwrite the snapshot');
});

test('charts: a held lock does not start another Last.fm round', async () => {
  const kv = new KVStub();
  await kv.put('charts:lock', '1', { expirationTtl: 60 });
  const { body, calls } = await fetchCharts(
    CHARTS, chartEnv(kv), () => { throw new Error('lock must hold the round'); });
  assert.equal(body.reason, 'warming');
  assert.deepEqual(body.periods, {});
  assert.equal(calls.length, 0);
});

test('charts: an over-limit caller gets a 429 before Last.fm', async () => {
  const env = chartEnv();
  env.LISTEN_RL = { limit: async () => ({ success: false }) };
  const { status, body, headers, calls } = await fetchCharts(
    CHARTS, env, () => { throw new Error('rate limit must win'); });
  assert.equal(status, 429);
  assert.deepEqual(body, { error: 'rate_limited' });
  assertApiEnvelope(headers);
  assert.equal(headers.get('cache-control'), 'no-store');
  assert.equal(calls.length, 0);
});

test('charts: a missing client IP fails closed', async () => {
  const caches = installCaches();
  const fetchStub = installFetch(() => jsonResponse({}));
  try {
    const res = await listeningWorker.fetch(workerRequest(CHARTS), chartEnv(), makeCtx());
    assert.equal(res.status, 503);
    assert.deepEqual(await res.json(), { error: 'service_unavailable' });
    assert.equal(fetchStub.calls.length, 0);
  } finally { caches.restore(); fetchStub.restore(); }
});

test('charts: a trailing slash is not a chart route', async () => {
  const { status, body, calls } = await fetchCharts(`${CHARTS}/`, chartEnv(), () => jsonResponse({}));
  assert.equal(status, 404);
  assert.deepEqual(body, { error: 'not_found' });
  assert.equal(calls.length, 0);
});

test('charts: a non-GET request is rejected', async () => {
  const caches = installCaches();
  const fetchStub = installFetch(() => jsonResponse({}));
  try {
    const res = await listeningWorker.fetch(
      workerRequest(CHARTS, { method: 'POST', headers: { origin: 'https://evil.example' } }), chartEnv(), makeCtx());
    assert.equal(res.status, 405);
    assertApiEnvelope(res.headers);
    assert.equal(fetchStub.calls.length, 0);
  } finally { caches.restore(); fetchStub.restore(); }
});

test('poller: the alarm calls getrecenttracks and not the chart methods', async () => {
  const env = { LASTFM_API_KEY: 'k', LASTFM_USERNAME: CHART_USER, LASTFM_CACHE: new KVStub() };
  const fetchStub = installFetch((url) => {
    assert.match(url, /method=user\.getrecenttracks/);
    assert.doesNotMatch(url, /gettop/);
    assert.match(url, new RegExp(`user=${encodeURIComponent(CHART_USER)}`));
    return jsonResponse(lastfmBody(1, 1));
  });
  try {
    await new ListeningPoller(new DurableStateStub(), env).alarm();
    assert.equal(fetchStub.calls.length, 1);
  } finally {
    fetchStub.restore();
  }
});
