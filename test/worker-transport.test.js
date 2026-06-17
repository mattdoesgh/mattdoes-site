// Pins the header shapes of workers/lib/transport.js — the shared edge-
// transport module both Workers build their responses from. The worker
// integration tests assert payloads and status codes; these pins are what
// hold the HEADER contract (CORS envelope, cache-control policy, fail-open
// KV) steady, since a regression there is invisible to payload assertions.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ALLOWED_ORIGIN, json, errorJson, withCache, corsPreflight,
  kvGet, kvPut, getClientIp, shortError,
} from '../workers/lib/transport.js';
import { workerRequest } from './helpers/worker-env.js';

// ── json: the CORS envelope every payload wears ─────────────────────────
test('transport: json() emits the full CORS envelope', async () => {
  const res = json({ a: 1 });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'),                 'application/json; charset=utf-8');
  assert.equal(res.headers.get('access-control-allow-origin'),  ALLOWED_ORIGIN);
  assert.equal(res.headers.get('access-control-allow-methods'), 'GET, OPTIONS');
  assert.equal(res.headers.get('access-control-allow-headers'), 'content-type');
  assert.equal(res.headers.get('vary'),                         null);
  assert.equal(res.headers.get('x-content-type-options'),       'nosniff');
  assert.equal(res.headers.get('referrer-policy'),              'strict-origin-when-cross-origin');
  assert.deepEqual(await res.json(), { a: 1 });
});

test('transport: json() honours status and origin overrides', () => {
  const res = json({ error: 'not_found' }, 404, 'https://example.test');
  assert.equal(res.status, 404);
  assert.equal(res.headers.get('access-control-allow-origin'), 'https://example.test');
});

// ── errorJson: error cache policy ───────────────────────────────────────
test('transport: errorJson() defaults to no-store with no retry-after', () => {
  const res = errorJson({ error: 'rate_limited' }, 429);
  assert.equal(res.status, 429);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  assert.equal(res.headers.get('retry-after'),   null);
  // The error envelope keeps the full CORS set — this is the deliberate fix
  // that normalised the listening Worker's hand-built 429.
  assert.equal(res.headers.get('access-control-allow-origin'),  ALLOWED_ORIGIN);
  assert.equal(res.headers.get('access-control-allow-methods'), 'GET, OPTIONS');
  assert.equal(res.headers.get('access-control-allow-headers'), 'content-type');
  assert.equal(res.headers.get('vary'),                         null);
  assert.equal(res.headers.get('x-content-type-options'),       'nosniff');
});

test('transport: errorJson() with edgeTtlS caches at the edge only', () => {
  const res = errorJson({ error: 'no_polygon' }, 404, { edgeTtlS: 600 });
  assert.equal(res.headers.get('cache-control'), 'public, max-age=0, s-maxage=600');
});

test('transport: errorJson() with retryAfterS sets retry-after', () => {
  const res = errorJson({ error: 'rate_limited' }, 429, { retryAfterS: 60 });
  assert.equal(res.headers.get('retry-after'), '60');
  assert.equal(res.headers.get('cache-control'), 'no-store');
});

// ── withCache: caller-owned success cache policy ────────────────────────
test('transport: withCache() stamps the given cache-control verbatim', async () => {
  const policy = 'public, max-age=0, s-maxage=30, must-revalidate';
  const res = withCache(json({ ok: true }), policy);
  assert.equal(res.headers.get('cache-control'), policy);
  assert.equal(res.headers.get('access-control-allow-origin'), ALLOWED_ORIGIN);
  // Status, body, and the rest of the envelope pass through untouched.
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('vary'), null);
  assert.deepEqual(await res.json(), { ok: true });
});

// ── corsPreflight ───────────────────────────────────────────────────────
test('transport: corsPreflight() is a cacheable 204', () => {
  const res = corsPreflight();
  assert.equal(res.status, 204);
  assert.equal(res.body, null);
  assert.equal(res.headers.get('access-control-allow-origin'),  ALLOWED_ORIGIN);
  assert.equal(res.headers.get('access-control-allow-methods'), 'GET, OPTIONS');
  assert.equal(res.headers.get('access-control-allow-headers'), 'content-type');
  assert.equal(res.headers.get('access-control-max-age'),       '86400');
  assert.equal(res.headers.get('x-content-type-options'),       'nosniff');
});

// ── fail-open KV ────────────────────────────────────────────────────────
test('transport: kvGet() fails open on a missing binding and a throwing namespace', async () => {
  assert.equal(await kvGet(undefined, 'k'), null);
  const broken = { get() { throw new Error('kv down'); } };
  assert.equal(await kvGet(broken, 'k', { type: 'json' }), null);
});

test('transport: kvGet() passes opts through to the namespace', async () => {
  const seen = [];
  const ns = { async get(key, opts) { seen.push([key, opts]); return '42'; } };
  assert.equal(await kvGet(ns, 'k', { type: 'json' }), '42');
  assert.deepEqual(seen, [['k', { type: 'json' }]]);
});

test('transport: kvPut() fails open and passes opts through', async () => {
  await kvPut(undefined, 'k', 'v');                         // no binding — no throw
  const broken = { put() { throw new Error('kv down'); } };
  await kvPut(broken, 'k', 'v');                            // throwing — swallowed
  const seen = [];
  const ns = { async put(key, value, opts) { seen.push([key, value, opts]); } };
  await kvPut(ns, 'k', 'v', { expirationTtl: 60 });
  assert.deepEqual(seen, [['k', 'v', { expirationTtl: 60 }]]);
});

// ── request / error helpers ─────────────────────────────────────────────
test('transport: getClientIp() reads cf-connecting-ip, null when absent', () => {
  const withIp = workerRequest('https://x.test/', { headers: { 'cf-connecting-ip': '203.0.113.9' } });
  assert.equal(getClientIp(withIp), '203.0.113.9');
  assert.equal(getClientIp(workerRequest('https://x.test/')), null);
});

test('transport: shortError() caps at 200 chars and survives non-Errors', () => {
  assert.equal(shortError(new Error('boom')), 'boom');
  assert.equal(shortError('plain string'), 'plain string');
  assert.equal(shortError(new Error('x'.repeat(500))).length, 200);
});
