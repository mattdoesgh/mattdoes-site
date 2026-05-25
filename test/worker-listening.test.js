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
    const res = await listeningWorker.fetch(workerRequest(url), env, ctx);
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

test('listening: a missing-credentials payload carries a truthy reason', async () => {
  // No LASTFM_API_KEY / LASTFM_USERNAME — the not_configured branch.
  const { body } = await callWorker(RECENT, {}, () => jsonResponse(lastfmBody(1, 1)));
  assert.ok(body.reason, 'not_configured payload MUST carry a truthy reason');
  assert.equal(body.playcount, 0);
  assert.deepEqual(body.tracks, []);
});

test('listening: the now endpoint also tags fallbacks with a reason', async () => {
  const { body } = await callWorker(NOW, {}, () => jsonResponse({}));
  assert.ok(body.reason, 'now fallback MUST carry a truthy reason');
  assert.equal(body.nowPlaying, false);
});

// ── KV-missing direct-fetch branch still obeys the contract ─────────────
test('listening: without KV, success still carries no reason', async () => {
  const env = { LASTFM_API_KEY: 'k', LASTFM_USERNAME: 'u' }; // no LASTFM_CACHE
  const { body } = await callWorker(RECENT, env,
    () => jsonResponse(lastfmBody(2, 50)));
  assert.equal('reason' in body, false,
    'the KV-missing direct-fetch success path must carry no reason');
  assert.equal(body.tracks.length, 2);
});

test('listening: without KV, an upstream failure still carries a reason', async () => {
  const env = { LASTFM_API_KEY: 'k', LASTFM_USERNAME: 'u' }; // no LASTFM_CACHE
  const { body } = await callWorker(RECENT, env,
    () => new Response('err', { status: 503 }));
  assert.ok(body.reason,
    'the KV-missing direct-fetch failure path must carry a reason');
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
