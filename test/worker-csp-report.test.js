// CSP report collector Worker — accepts violation POSTs, rejects oversize
// payloads, and optionally stores them in KV.

import test from 'node:test';
import assert from 'node:assert/strict';
import cspWorker from '../workers/csp-report/src/index.js';
import { KVStub, makeCtx, workerRequest } from './helpers/worker-env.js';

const REPORT_URL = 'https://mattdoes.online/api/csp-report';
const SAMPLE = JSON.stringify({
  'csp-report': {
    'document-uri': 'https://mattdoes.online/',
    'violated-directive': 'style-src-elem',
    'blocked-uri': 'inline',
  },
});

test('csp-report: accepts a valid CSP report with 204', async () => {
  const res = await cspWorker.fetch(
    workerRequest(REPORT_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/csp-report' },
      body: SAMPLE,
    }),
    {},
    makeCtx(),
  );
  assert.equal(res.status, 204);
  assert.equal(res.headers.get('cache-control'), 'no-store');
});

test('csp-report: stores reports in KV when bound', async () => {
  const kv = new KVStub();
  const ctx = makeCtx();
  const res = await cspWorker.fetch(
    workerRequest(REPORT_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: SAMPLE,
    }),
    { CSP_REPORTS: kv },
    ctx,
  );
  assert.equal(res.status, 204);
  await ctx.settle();
  assert.equal(kv.store.size, 1, 'one report should be written to KV');
});

test('csp-report: rejects GET and oversize payloads', async () => {
  const getRes = await cspWorker.fetch(workerRequest(REPORT_URL), {}, makeCtx());
  assert.equal(getRes.status, 405);

  const big = 'x'.repeat(33 * 1024);
  const bigRes = await cspWorker.fetch(
    workerRequest(REPORT_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/csp-report' },
      body: big,
    }),
    {},
    makeCtx(),
  );
  assert.equal(bigRes.status, 413);

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
});
