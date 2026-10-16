// CSP report collector Worker — accepts violation POSTs, rejects oversize
// payloads, and optionally stores them in KV.

import test from 'node:test';
import assert from 'node:assert/strict';
import cspWorker from '../workers/csp-report/src/index.js';
import { KVStub, makeCtx, workerRequest } from './helpers/worker-env.js';

const REPORT_URL = 'https://mattdoes.online/api/csp-report';
const CLIENT_IP = '203.0.113.50';
const SAMPLE = JSON.stringify({
  'csp-report': {
    'document-uri': 'https://mattdoes.online/',
    'violated-directive': 'style-src-elem',
    'blocked-uri': 'inline',
  },
});

const allowRl = () => ({ limit: async () => ({ success: true }) });

function reportRequest(body = SAMPLE, headers = {}) {
  return workerRequest(REPORT_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/csp-report',
      'cf-connecting-ip': CLIENT_IP,
      ...headers,
    },
    body,
  });
}

async function sha256Hex(value) {
  const data = new TextEncoder().encode(String(value));
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

test('csp-report: accepts a valid CSP report with 204', async () => {
  const res = await cspWorker.fetch(reportRequest(), { CSP_RL: allowRl() }, makeCtx());
  assert.equal(res.status, 204);
  assert.equal(res.headers.get('cache-control'), 'no-store');
});

test('csp-report: stores reports in KV when bound', async () => {
  const kv = new KVStub();
  const ctx = makeCtx();
  const res = await cspWorker.fetch(
    reportRequest(SAMPLE, { 'content-type': 'application/json' }),
    { CSP_RL: allowRl(), CSP_REPORTS: kv },
    ctx,
  );
  assert.equal(res.status, 204);
  await ctx.settle();
  assert.equal(kv.store.size, 1, 'one report should be written to KV');
  const [key, entry] = [...kv.store.entries()][0];
  const ipHash = await sha256Hex(CLIENT_IP);
  assert.match(key, new RegExp(`^csp:\\d+:${ipHash}$`));
  assert.equal(key.includes(CLIENT_IP), false, 'raw client IP must not be part of the KV key');
  assert.equal(entry.value, SAMPLE);
});

// Rejections go through the shared transport envelope, so every 4xx wears
// the same security headers as the rest of the Workers' responses.
function assertSecurityHeaders(res) {
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(res.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
}

test('csp-report: rejects GET and oversize payloads', async () => {
  const getRes = await cspWorker.fetch(workerRequest(REPORT_URL), {}, makeCtx());
  assert.equal(getRes.status, 405);
  assertSecurityHeaders(getRes);

  const big = 'x'.repeat(33 * 1024);
  // Node's Request does not set content-length for a string body, so the
  // size check happens after the rate limit, once the body is read.
  const bigRes = await cspWorker.fetch(
    reportRequest(big),
    { CSP_RL: allowRl() },
    makeCtx(),
  );
  assert.equal(bigRes.status, 413);
  assertSecurityHeaders(bigRes);

  const declared = workerRequest(REPORT_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/csp-report',
      'content-length': String(33 * 1024),
    },
    body: 'small',
  });
  let declaredReads = 0;
  const declaredText = declared.text.bind(declared);
  declared.text = async () => { declaredReads += 1; return declaredText(); };
  const declaredRes = await cspWorker.fetch(declared, {}, makeCtx());
  assert.equal(declaredRes.status, 413);
  assert.equal(declaredReads, 0, 'a declared oversize body is rejected before it is read');

  const badCt = await cspWorker.fetch(
    workerRequest(REPORT_URL, {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: SAMPLE,
    }),
    {},
    makeCtx(),
  );
  assert.equal(badCt.status, 415);
  assertSecurityHeaders(badCt);

  const wrongPath = await cspWorker.fetch(
    workerRequest('https://mattdoes.online/api/other', { method: 'POST' }),
    {},
    makeCtx(),
  );
  assert.equal(wrongPath.status, 404);
  assertSecurityHeaders(wrongPath);
});

test('csp-report: fails closed without the rate-limit binding, before reading the body', async () => {
  const req = reportRequest();
  let reads = 0;
  const text = req.text.bind(req);
  req.text = async () => { reads += 1; return text(); };
  const res = await cspWorker.fetch(req, {}, makeCtx());
  assert.equal(res.status, 503);
  assert.deepEqual(await res.json(), { error: 'service_unavailable' });
  assert.equal(reads, 0);
  assertSecurityHeaders(res);
});

test('csp-report: rate limit rejects before the body is read and nothing is stored', async () => {
  const kv = new KVStub();
  const req = reportRequest();
  let reads = 0;
  const text = req.text.bind(req);
  req.text = async () => { reads += 1; return text(); };
  const res = await cspWorker.fetch(
    req,
    { CSP_RL: { limit: async () => ({ success: false }) }, CSP_REPORTS: kv },
    makeCtx(),
  );
  assert.equal(res.status, 429);
  assert.deepEqual(await res.json(), { error: 'rate_limited' });
  assert.equal(reads, 0);
  assert.equal(kv.store.size, 0);
  assertSecurityHeaders(res);
});

test('csp-report: a missing client IP fails closed before the body is read', async () => {
  const req = workerRequest(REPORT_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/csp-report' },
    body: SAMPLE,
  });
  let reads = 0;
  const text = req.text.bind(req);
  req.text = async () => { reads += 1; return text(); };
  const res = await cspWorker.fetch(req, { CSP_RL: allowRl() }, makeCtx());
  assert.equal(res.status, 503);
  assert.equal(reads, 0);
});
