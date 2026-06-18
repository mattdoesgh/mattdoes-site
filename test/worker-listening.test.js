// Audit backlog: "Worker robustness" + "Dynamic announcements" (live-update
// side). Covers audit finding #14 — the listening Worker's payload contract.
//
// Contract C7 (documented in workers/listening/src/index.js): every error /
// degraded / fallback payload carries a truthy `reason`; no genuine-success
// payload carries one. The static clients use the presence of `reason` to
// decide whether to keep stale UI or apply the update — so the Worker side of
// that contract is what we assert here.
//
// Each test installs a FRESH `caches` stub: the edge cache keys purely on the
// request URL, so reusing one stub across scenarios with the same route would
// leak a cached response between tests.

import test from 'node:test';
import assert from 'node:assert/strict';
import listeningWorker from '../workers/listening/src/index.js';
import {
  KVStub, makeCtx, installCaches, installFetch, workerRequest, jsonResponse,
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

/**
 * Drive the Worker once with a fresh runtime. `fetchHandler` stubs the
 * upstream Last.fm call.
 */
async function callWorker(url, env, fetchHandler) {
  const caches = installCaches();
  const fetchStub = installFetch(fetchHandler);
  try {
    const ctx = makeCtx();
    const fullEnv = {
      LISTEN_RL: { limit: async () => ({ success: true }) },
      ...env,
    };
    const res = await listeningWorker.fetch(workerRequest(url), fullEnv, ctx);
    await ctx.settle();
    const body = await res.clone().json();
    return { status: res.status, body, upstreamCalls: fetchStub.calls.length };
  } finally {
    caches.restore();
    fetchStub.restore();
  }
}

// ── success payloads carry NO reason ────────────────────────────────────
test('listening: a genuine-success recent payload carries no reason', async () => {
  const env = { LASTFM_API_KEY: 'k', LASTFM_USERNAME: 'u', LASTFM_CACHE: new KVStub() };
  const { status, body } = await callWorker(RECENT, env,
    () => jsonResponse(lastfmBody(3, 9001)));

  assert.equal(status, 200);
  assert.equal('reason' in body, false,
    'a successful recent payload must NOT carry a reason field');
  assert.equal(body.playcount, 9001);
  assert.equal(body.tracks.length, 3);
});

test('listening: a genuine-success now payload carries no reason', async () => {
  const env = { LASTFM_API_KEY: 'k', LASTFM_USERNAME: 'u', LASTFM_CACHE: new KVStub() };
  const nowBody = {
    recenttracks: {
      track: [{
        name: 'Live Song',
        artist: { '#text': 'Live Artist' },
        album:  { '#text': 'Live Album' },
        url:    'https://www.last.fm/x',
        '@attr': { nowplaying: 'true' },
      }],
      '@attr': {},
    },
  };
  const { status, body } = await callWorker(NOW, env, () => jsonResponse(nowBody));
  assert.equal(status, 200);
  assert.equal('reason' in body, false,
    'a successful now payload must NOT carry a reason field');
  assert.equal(body.nowPlaying, true);
});

test('listening: live now payload strips unsafe Last.fm links', async () => {
  const env = { LASTFM_API_KEY: 'k', LASTFM_USERNAME: 'u', LASTFM_CACHE: new KVStub() };
  const nowBody = {
    recenttracks: {
      track: [{
        name: 'Live Song',
        artist: { '#text': 'Live Artist' },
        album:  { '#text': 'Live Album' },
        url:    'javascript:alert(1)',
        '@attr': { nowplaying: 'true' },
      }],
      '@attr': {},
    },
  };
  const { status, body } = await callWorker(NOW, env, () => jsonResponse(nowBody));
  assert.equal(status, 200);
  assert.equal(body.nowPlaying, true);
  assert.equal(body.link, '');
});


// ── authoritative empty state ───────────────────────────────────────────
test('listening: a real empty result is authoritative (no reason, empty arrays)', async () => {
  const env = { LASTFM_API_KEY: 'k', LASTFM_USERNAME: 'u', LASTFM_CACHE: new KVStub() };
  const { body } = await callWorker(RECENT, env,
    () => jsonResponse(lastfmBody(0, 0)));

  // A genuine "you have not scrobbled" state: zero playcount, empty tracks,
  // and crucially NO reason — the client must be allowed to render it.
  assert.equal('reason' in body, false,
    'a real empty result must be authoritative (no reason)');
  assert.equal(body.playcount, 0);
  assert.deepEqual(body.tracks, []);
});

// ── error / fallback payloads ALWAYS carry a truthy reason ──────────────
test('listening: an upstream failure produces a payload with a truthy reason', async () => {
  const env = { LASTFM_API_KEY: 'k', LASTFM_USERNAME: 'u', LASTFM_CACHE: new KVStub() };
  const { body } = await callWorker(RECENT, env,
    () => new Response('upstream boom', { status: 500 }));

  assert.ok(body.reason,
    'an upstream-failure payload MUST carry a truthy reason');
  assert.equal(typeof body.reason, 'string');
});

test('listening: a Last.fm error JSON body is treated as upstream failure', async () => {
  const env = { LASTFM_API_KEY: 'k', LASTFM_USERNAME: 'u', LASTFM_CACHE: new KVStub() };
  const { body } = await callWorker(RECENT, env,
    () => jsonResponse({ error: 10, message: 'Invalid API key' }));

  assert.ok(body.reason,
    'Last.fm error JSON must not be cached/served as an authoritative empty state');
  assert.equal(body.playcount, 0);
  assert.deepEqual(body.tracks, []);
});

test('listening: a missing-credentials payload carries a truthy reason', async () => {
  // No LASTFM_API_KEY / LASTFM_USERNAME — public reason stays generic.
  const { body } = await callWorker(RECENT, {}, () => jsonResponse(lastfmBody(1, 1)));
  assert.equal(body.reason, 'unavailable');
  assert.equal(body.playcount, 0);
  assert.deepEqual(body.tracks, []);
});

test('listening: the now endpoint also tags fallbacks with a reason', async () => {
  const { body } = await callWorker(NOW, {}, () => jsonResponse({}));
  assert.ok(body.reason, 'now fallback MUST carry a truthy reason');
  assert.equal(body.nowPlaying, false);
});

// ── Required bindings fail closed ───────────────────────────────────────
test('listening: without KV, the Worker fails closed', async () => {
  const env = { LASTFM_API_KEY: 'k', LASTFM_USERNAME: 'u' }; // no LASTFM_CACHE
  const { status, body, upstreamCalls } = await callWorker(RECENT, env,
    () => jsonResponse(lastfmBody(2, 50)));
  assert.equal(status, 503);
  assert.deepEqual(body, { error: 'service_unavailable' });
  assert.equal(upstreamCalls, 0, 'missing KV must not trigger a direct upstream fetch');
});

test('listening: without the rate-limit binding, the Worker fails closed', async () => {
  const caches = installCaches();
  const fetchStub = installFetch(() => jsonResponse(lastfmBody(1, 1)));
  try {
    const env = { LASTFM_API_KEY: 'k', LASTFM_USERNAME: 'u', LASTFM_CACHE: new KVStub() };
    const res = await listeningWorker.fetch(workerRequest(RECENT), env, makeCtx());
    assert.equal(res.status, 503);
    assert.deepEqual(await res.json(), { error: 'service_unavailable' });
    assert.equal(fetchStub.calls.length, 0);
  } finally { caches.restore(); fetchStub.restore(); }
});

// ── rate limit (the one deliberate header fix from the transport refactor) ─
test('listening: an over-limit caller gets a 429 with the full CORS envelope', async () => {
  const caches = installCaches();
  const fetchStub = installFetch(() => jsonResponse(lastfmBody(1, 1)));
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

test('listening: a non-GET request is rejected', async () => {
  const caches = installCaches();
  const fetchStub = installFetch(() => jsonResponse({}));
  try {
    const res = await listeningWorker.fetch(
      workerRequest(RECENT, { method: 'POST' }), {}, makeCtx());
    assert.equal(res.status, 405);
  } finally { caches.restore(); fetchStub.restore(); }
});
