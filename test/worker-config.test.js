// Worker unit tests stub bindings, so deleting one from wrangler.toml
// still leaves the suite green. These checks read the config that deploys.
// A route without `*` does not match a query string. A worker that reads
// searchParams needs a pattern that ends in a wildcard.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

function toml(worker) {
  return fs.readFileSync(path.join(ROOT, 'workers', worker, 'wrangler.toml'), 'utf8');
}

function patterns(text) {
  return [...text.matchAll(/pattern\s*=\s*"([^"]+)"/g)].map((m) => m[1]);
}

function source(worker) {
  const dir = path.join(ROOT, 'workers', worker, 'src');
  return fs.readdirSync(dir)
    .filter((name) => name.endsWith('.js'))
    .map((name) => fs.readFileSync(path.join(dir, name), 'utf8'))
    .join('\n');
}

test('deployed bindings stay declared', () => {
  assert.match(toml('csp-report'), /name\s*=\s*"CSP_RL"/);
});

test('a worker that reads the query string uses a wildcard route', () => {
  for (const worker of ['csp-report']) {
    const routes = patterns(toml(worker));
    assert.ok(routes.length > 0, `${worker} has no route`);
    if (!source(worker).includes('searchParams')) continue;
    for (const route of routes) {
      assert.match(route, /\*$/, `${worker} reads the query string but ${route} has no wildcard`);
    }
  }
});

test('rebuild is a six-hour cron that expects the DEPLOY_HOOK secret', () => {
  const cfg = toml('rebuild');
  assert.match(cfg, /crons\s*=\s*\[\s*"0 \*\/6 \* \* \*"\s*\]/);
  assert.match(cfg, /required\s*=\s*\[\s*"DEPLOY_HOOK"\s*\]/);
  assert.match(cfg, /workers_dev\s*=\s*false/);
  assert.equal(patterns(cfg).length, 0, 'rebuild publishes no route');
  assert.doesNotMatch(cfg, /https?:\/\//, 'the deploy hook URL must not be committed');

  const src = source('rebuild');
  assert.match(src, /env\.DEPLOY_HOOK/);
  assert.match(src, /allowedDeployHook/);
  assert.match(src, /method:\s*'POST'/);
  assert.match(src, /redirect:\s*'manual'/);
  assert.match(src, /status:\s*404/);
  assert.doesNotMatch(src, /https?:\/\/[a-z0-9.-]+\./i, 'the deploy hook URL must not be committed');
  assert.match(cfg, /\[observability\.traces\]\s+enabled\s*=\s*false/);
  assert.match(cfg, /redact_query_string\s*=\s*true/);
});
