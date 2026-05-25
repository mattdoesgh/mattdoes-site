// Audit backlog: "Worker robustness — Geo coordinate range, rate-limit,
// cache-miss, and negative-cache tests". Covers audit finding #4.
//
// Imports the geo Worker's default.fetch and exercises it with a stubbed
// runtime: an in-memory KV namespace, a global `caches` stub, and an
// intercepted global `fetch` (so no real Nominatim traffic happens and
// upstream call volume can be counted).

import test from 'node:test';
import assert from 'node:assert/strict';
import geoWorker from '../workers/geo/src/index.js';
import {
  KVStub, makeCtx, installCaches, installFetch, workerRequest,
} from './helpers/worker-env.js';

const LOOKUP = 'https://geo.mattdoes.online/api/geo/lookup';

// A Nominatim response that yields a valid polygon on the FIRST admin level,
// so lookup() returns immediately without hitting its inter-level sleeps.
const VALID_POLYGON = {
  display_name: 'Testville, Test State, Testland',
  osm_id: 12345,
  geojson: {
    type: 'Polygon',
    coordinates: [[[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]]],
  },
};
const nominatimOk = () =>
  new Response(JSON.stringify(VALID_POLYGON), {
    status: 200, headers: { 'content-type': 'application/json' },
  });
// A Nominatim response with no usable geometry — drives the negative path.
const nominatimEmpty = () =>
  new Response(JSON.stringify({ display_name: 'nowhere' }), {
    status: 200, headers: { 'content-type': 'application/json' },
  });

// ── coordinate range validation ─────────────────────────────────────────
test('geo: latitude outside [-90, 90] is rejected with 400', async () => {
  const c = installCaches();
  const f = installFetch(nominatimOk);
  try {
    for (const lat of [91, -91, 999, -1000]) {
      const res = await geoWorker.fetch(
        workerRequest(`${LOOKUP}?lat=${lat}&lng=0`), {}, makeCtx());
      assert.equal(res.status, 400, `lat=${lat} must be a 400`);
    }
    assert.equal(f.calls.length, 0,
      'out-of-range latitude must never reach Nominatim');
  } finally { c.restore(); f.restore(); }
});

test('geo: longitude outside [-180, 180] is rejected with 400', async () => {
  const c = installCaches();
  const f = installFetch(nominatimOk);
  try {
    for (const lng of [181, -181, 999, -1000]) {
      const res = await geoWorker.fetch(
        workerRequest(`${LOOKUP}?lat=0&lng=${lng}`), {}, makeCtx());
      assert.equal(res.status, 400, `lng=${lng} must be a 400`);
    }
    assert.equal(f.calls.length, 0,
      'out-of-range longitude must never reach Nominatim');
  } finally { c.restore(); f.restore(); }
});

test('geo: missing/non-numeric coordinates are rejected with 400', async () => {
  const c = installCaches();
  const f = installFetch(nominatimOk);
  try {
    const res = await geoWorker.fetch(
      workerRequest(`${LOOKUP}?lat=abc`), {}, makeCtx());
    assert.equal(res.status, 400);
  } finally { c.restore(); f.restore(); }
});

// ── per-IP upstream budget (rate limit) ─────────────────────────────────
test('geo: a burst of distinct coordinates from one IP is rate-limited', async () => {
  const c = installCaches();
  const f = installFetch(nominatimOk);
  try {
    const env = { GEO_CACHE: new KVStub() };
    const headers = { 'cf-connecting-ip': '203.0.113.7' };
    const statuses = [];

    // 17 requests, each with DISTINCT coordinates → all cache misses, so the
    // per-key lock never collapses them. Only the per-IP budget can bound it.
    for (let i = 0; i < 17; i++) {
      const ctx = makeCtx();
      const lat = (10 + i * 0.5).toFixed(2); // distinct rounded key each time
      const res = await geoWorker.fetch(
        workerRequest(`${LOOKUP}?lat=${lat}&lng=20`, { headers }), env, ctx);
      await ctx.settle();
      statuses.push(res.status);
    }

    // The budget is 15 distinct upstream lookups / window; the 16th onward
    // must be 429, and Nominatim must see at most 15 calls.
    const rejected = statuses.filter(s => s === 429).length;
    assert.ok(rejected >= 1,
      `expected at least one 429 after the budget; statuses=${statuses}`);
    assert.equal(statuses[15], 429, 'the 16th distinct lookup must be 429');
    assert.ok(f.calls.length <= 15,
      `upstream calls must stay bounded (<=15), saw ${f.calls.length}`);
  } finally { c.restore(); f.restore(); }
});

// ── fail-open without the KV binding ────────────────────────────────────
test('geo: works without the GEO_CACHE binding (fails open)', async () => {
  const c = installCaches();
  const f = installFetch(nominatimOk);
  try {
    // No env.GEO_CACHE — the Worker must still serve, not crash.
    const ctx = makeCtx();
    const res = await geoWorker.fetch(
      workerRequest(`${LOOKUP}?lat=29.76&lng=-95.37`), {}, ctx);
    await ctx.settle();
    assert.equal(res.status, 200,
      'without KV the Worker should still answer a valid lookup');
    const body = await res.json();
    assert.ok(body.feature, 'response should carry a GeoJSON feature');
  } finally { c.restore(); f.restore(); }
});

// The Worker must fail OPEN not only when env.GEO_CACHE is *absent* (covered
// above) but also when a present binding *throws*. The cache lookup, in-flight
// lock, and per-IP budget KV calls are all wrapped in try/catch, so a KV that
// rejects on every method still degrades to a direct Nominatim lookup rather
// than crashing the fetch handler.
test('geo: fails open even when KV throws on every call',
  async () => {
    const c = installCaches();
    const f = installFetch(nominatimOk);
    try {
      // A KV binding whose every method rejects — the Worker must still answer.
      const throwingKv = {
        get: async () => { throw new Error('kv down'); },
        put: async () => { throw new Error('kv down'); },
      };
      const ctx = makeCtx();
      const res = await geoWorker.fetch(
        workerRequest(`${LOOKUP}?lat=29.76&lng=-95.37`,
          { headers: { 'cf-connecting-ip': '198.51.100.1' } }),
        { GEO_CACHE: throwingKv }, ctx);
      await ctx.settle();
      assert.equal(res.status, 200,
        'a failing KV must not break the Worker (fail open)');
    } finally { c.restore(); f.restore(); }
  });

// ── negative-result caching ─────────────────────────────────────────────
test('geo: a no-polygon result is cached so it is not re-fetched', async () => {
  const c = installCaches();
  const f = installFetch(nominatimEmpty);
  try {
    const env = { GEO_CACHE: new KVStub() };
    const headers = { 'cf-connecting-ip': '192.0.2.5' };

    // First request for this cell — Nominatim is consulted, returns nothing.
    const ctx1 = makeCtx();
    const res1 = await geoWorker.fetch(
      workerRequest(`${LOOKUP}?lat=12.3&lng=45.6`, { headers }), env, ctx1);
    await ctx1.settle();
    assert.equal(res1.status, 404, 'an empty cell returns 404 (no_polygon)');
    const callsAfterFirst = f.calls.length;
    assert.ok(callsAfterFirst > 0, 'first miss should consult Nominatim');

    // Second request for the SAME cell — the negative marker should serve a
    // cached 404 without any further upstream call.
    const ctx2 = makeCtx();
    const res2 = await geoWorker.fetch(
      workerRequest(`${LOOKUP}?lat=12.3&lng=45.6`, { headers }), env, ctx2);
    await ctx2.settle();
    assert.equal(res2.status, 404, 'the repeated empty cell still returns 404');
    assert.equal(f.calls.length, callsAfterFirst,
      'a negative result must be cached — no second Nominatim call');
  } finally { c.restore(); f.restore(); }
});

test('geo: a non-GET request is rejected', async () => {
  const c = installCaches();
  const f = installFetch(nominatimOk);
  try {
    const res = await geoWorker.fetch(
      workerRequest(`${LOOKUP}?lat=0&lng=0`, { method: 'POST' }), {}, makeCtx());
    assert.equal(res.status, 405);
  } finally { c.restore(); f.restore(); }
});
