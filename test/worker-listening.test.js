// Listening Worker — producer/reader split (ADR 0008).
//
// Two surfaces are exercised here:
//   • PRODUCER — the ListeningPoller DO alarm: the ONLY Last.fm caller. One
//     upstream call must write BOTH KV payloads from one decode; failures must
//     leave KV intact and keep the alarm chain alive.
//   • READER — the fetch() handler: a pure KV reader that must NEVER call
//     Last.fm (assert upstreamCalls === 0 everywhere on this path).
//
// Contract C7 (documented in workers/listening/src/index.js): every error /
// degraded / fallback payload carries a truthy `reason`; no genuine-success
// payload carries one. The static clients use the presence of `reason` to
// decide whether to keep stale UI or apply the update.
//
// Each reader test installs a FRESH `caches` stub: the edge cache keys purely
// on the request URL, so reusing one stub across scenarios with the same route
// would leak a cached response between tests.

import test from 'node:test';
import assert from 'node:assert/strict';
import listeningWorker, { ListeningPoller } from '../workers/listening/src/index.js';
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
    const res = await listeningWorker.fetch(workerRequest(url), fullEnv, ctx);
    await ctx.settle();
    const body = await res.clone().json();
    return { status: res.status, body, upstreamCalls: fetchStub.calls.length };
  } finally {
    caches.restore();
    fetchStub.restore();
  }
}

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
