// The rebuild Worker is cron-only. fetch must not trigger a deploy, and
// the scheduled handler must POST whatever URL is in the DEPLOY_HOOK secret
// without writing that URL into a log or an error.

import test from 'node:test';
import assert from 'node:assert/strict';
import rebuild from '../workers/rebuild/src/index.js';

const HOOK = 'https://example.test/pages-deploy-hook';

test('rebuild fetch returns 404 and does not call the hook', async () => {
  let called = false;
  const original = globalThis.fetch;
  globalThis.fetch = async () => {
    called = true;
    return new Response(null, { status: 200 });
  };
  try {
    const res = await rebuild.fetch(new Request('https://rebuild.internal/anything'));
    assert.equal(res.status, 404);
    assert.equal(res.headers.get('cache-control'), 'no-store');
    assert.equal(await res.text(), '');
  } finally {
    globalThis.fetch = original;
  }
  assert.equal(called, false);
});

test('rebuild scheduled POSTs the DEPLOY_HOOK secret', async () => {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), method: init?.method });
    return new Response('ok', { status: 200 });
  };
  try {
    await rebuild.scheduled({ cron: '0 */6 * * *' }, { DEPLOY_HOOK: HOOK });
  } finally {
    globalThis.fetch = original;
  }
  assert.deepEqual(calls, [{ url: HOOK, method: 'POST' }]);
});

test('rebuild scheduled fails closed when DEPLOY_HOOK is missing', async () => {
  let called = false;
  const original = globalThis.fetch;
  const errors = [];
  const originalError = console.error;
  globalThis.fetch = async () => {
    called = true;
    return new Response(null, { status: 200 });
  };
  console.error = (...args) => { errors.push(args.map(String).join(' ')); };
  try {
    await assert.rejects(
      () => rebuild.scheduled({ cron: '0 */6 * * *' }, {}),
      /DEPLOY_HOOK is not configured/,
    );
  } finally {
    globalThis.fetch = original;
    console.error = originalError;
  }
  assert.equal(called, false);
  assert.match(errors.join('\n'), /missing_deploy_hook/);
});

test('a failed hook POST does not echo the secret URL', async () => {
  const original = globalThis.fetch;
  const errors = [];
  const originalError = console.error;
  globalThis.fetch = async () => new Response('no', { status: 500 });
  console.error = (...args) => { errors.push(args.map(String).join(' ')); };
  try {
    await assert.rejects(
      () => rebuild.scheduled({ cron: '0 */6 * * *' }, { DEPLOY_HOOK: HOOK }),
      (err) => {
        assert.match(err.message, /deploy hook status 500/);
        assert.equal(err.message.includes(HOOK), false);
        assert.equal(err.message.includes('example.test'), false);
        return true;
      },
    );
  } finally {
    globalThis.fetch = original;
    console.error = originalError;
  }
  const logged = errors.join('\n');
  assert.match(logged, /"status":500/);
  assert.equal(logged.includes(HOOK), false);
  assert.equal(logged.includes('example.test'), false);
});
