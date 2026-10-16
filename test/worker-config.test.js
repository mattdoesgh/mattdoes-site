// Worker unit tests stub bindings, so deleting one from wrangler.toml
// still leaves the suite green. These checks read the config that deploys.
// A route without `*` does not match a query string. Geo's lookup reads
// lat and lng from the query, so that pattern has to end in a wildcard.

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
  const geo = toml('geo');
  assert.match(geo, /binding\s*=\s*"GEO_CACHE"/);
  assert.match(geo, /name\s*=\s*"GEO_RL"/);

  assert.match(toml('csp-report'), /name\s*=\s*"CSP_RL"/);

  const listening = toml('listening');
  assert.match(listening, /binding\s*=\s*"LASTFM_CACHE"/);
  assert.match(listening, /name\s*=\s*"LISTEN_RL"/);
  assert.match(listening, /name\s*=\s*"LISTENING_POLLER"/);
});

test('a worker that reads the query string uses a wildcard route', () => {
  for (const worker of ['geo', 'listening', 'csp-report']) {
    const routes = patterns(toml(worker));
    assert.ok(routes.length > 0, `${worker} has no route`);
    if (!source(worker).includes('searchParams')) continue;
    for (const route of routes) {
      assert.match(route, /\*$/, `${worker} reads the query string but ${route} has no wildcard`);
    }
  }
});

test('geo lookup keeps the wildcard on the real pattern', () => {
  assert.deepEqual(patterns(toml('geo')), ['mattdoes.online/api/geo/lookup*']);
});
