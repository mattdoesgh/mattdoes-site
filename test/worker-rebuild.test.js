// The rebuild Worker is cron-only. fetch must not trigger a deploy, and
// the scheduled handler must POST a Cloudflare deploy-hook URL from the
// DEPLOY_HOOK secret without writing that URL into a log or an error.

import test from 'node:test';
import assert from 'node:assert/strict';
import rebuild, { allowedDeployHook } from '../workers/rebuild/src/index.js';

const HOOK = 'https://api.cloudflare.com/client/v4/pages/webhooks/deploy_hooks/0123456789abcdef0123456789abcdef';

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
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(res.headers.get('x-frame-options'), 'DENY');
    assert.equal(res.headers.get('cross-origin-resource-policy'), 'same-origin');
    assert.equal(await res.text(), '');
  } finally {
    globalThis.fetch = original;
  }
  assert.equal(called, false);
});

test('rebuild POST /rebuild from the service binding runs the hook', async () => {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), method: init?.method });
    return new Response(null, { status: 200 });
  };
  try {
    const res = await rebuild.fetch(new Request('https://rebuild.internal/rebuild', { method: 'POST' }), {
      DEPLOY_HOOK: HOOK,
    });
    assert.equal(res.status, 204);
    assert.equal(res.headers.get('cache-control'), 'no-store');
  } finally {
    globalThis.fetch = original;
  }
  assert.deepEqual(calls, [{ url: HOOK, method: 'POST' }]);
});

test('rebuild POST /rebuild with a client IP does not run the hook', async () => {
  let called = false;
  const original = globalThis.fetch;
  globalThis.fetch = async () => {
    called = true;
    return new Response(null, { status: 200 });
  };
  try {
    const res = await rebuild.fetch(new Request('https://rebuild.internal/rebuild', {
      method: 'POST',
      headers: { 'cf-connecting-ip': '203.0.113.9' },
    }), { DEPLOY_HOOK: HOOK });
    assert.equal(res.status, 404);
  } finally {
    globalThis.fetch = original;
  }
  assert.equal(called, false);
});

test('rebuild scheduled POSTs the DEPLOY_HOOK secret', async () => {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({
      url: String(url),
      method: init?.method,
      redirect: init?.redirect,
      referrerPolicy: init?.referrerPolicy,
    });
    return new Response('ok', { status: 200 });
  };
  try {
    await rebuild.scheduled({ cron: '0 */6 * * *' }, { DEPLOY_HOOK: HOOK });
  } finally {
    globalThis.fetch = original;
  }
  assert.deepEqual(calls, [{
    url: HOOK,
    method: 'POST',
    redirect: 'manual',
    referrerPolicy: 'no-referrer',
  }]);
});

test('rebuild scheduled refuses a hook that is not a Cloudflare deploy hook', async () => {
  const rejected = [
    'https://example.test/pages-deploy-hook',
    'http://api.cloudflare.com/client/v4/pages/webhooks/deploy_hooks/0123456789abcdef',
    'https://user:secret@api.cloudflare.com/client/v4/pages/webhooks/deploy_hooks/0123456789abcdef',
    'https://api.cloudflare.com/client/v4/accounts/abc/tokens/verify',
    `${HOOK}?token=extra`,
  ];
  for (const hook of rejected) assert.equal(allowedDeployHook(hook), '');

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
      () => rebuild.scheduled({ cron: '0 */6 * * *' }, { DEPLOY_HOOK: rejected[0] }),
      /DEPLOY_HOOK is not configured/,
    );
  } finally {
    globalThis.fetch = original;
    console.error = originalError;
  }
  assert.equal(called, false);
  const logged = errors.join('\n');
  assert.match(logged, /missing_deploy_hook/);
  assert.equal(logged.includes('example.test'), false);
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
        assert.equal(err.message.includes('deploy_hooks'), false);
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
  assert.equal(logged.includes('deploy_hooks'), false);
});

test('a thrown hook fetch does not log the secret URL', async () => {
  const original = globalThis.fetch;
  const errors = [];
  const originalError = console.error;
  globalThis.fetch = async () => { throw new Error(`connect failed ${HOOK}`); };
  console.error = (...args) => { errors.push(args.map(String).join(' ')); };
  try {
    await assert.rejects(
      () => rebuild.scheduled({ cron: '0 */6 * * *' }, { DEPLOY_HOOK: HOOK }),
      (err) => {
        assert.match(err.message, /deploy hook request failed/);
        assert.equal(err.message.includes(HOOK), false);
        assert.equal(err.message.includes('deploy_hooks'), false);
        return true;
      },
    );
  } finally {
    globalThis.fetch = original;
    console.error = originalError;
  }
  const logged = errors.join('\n');
  assert.match(logged, /request_failed/);
  assert.equal(logged.includes(HOOK), false);
  assert.equal(logged.includes('deploy_hooks'), false);
});
