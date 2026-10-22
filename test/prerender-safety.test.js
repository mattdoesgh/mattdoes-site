// The live refresh waits out prerender. style-src stays strict.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { REPO_ROOT } from './helpers/run-build.js';
import { contentSecurityPolicy } from '../lib/csp-policy.js';

test('station.js defers startup until prerender activation', () => {
  const src = fs.readFileSync(path.join(REPO_ROOT, 'static', 'station.js'), 'utf8');
  assert.match(src, /document\.prerendering/);
  assert.match(src, /prerenderingchange/);
});

test('style-src omits unsafe-inline in shipped headers', () => {
  const policy = contentSecurityPolicy();
  assert.match(policy, /style-src 'self'/);
  assert.doesNotMatch(policy, /style-src[^;]*unsafe-inline/);
  const headers = fs.readFileSync(path.join(REPO_ROOT, 'static', '_headers'), 'utf8');
  const hsts = headers.match(/^ {2}Strict-Transport-Security:.*$/m);
  assert.ok(hsts, 'static/_headers must set Strict-Transport-Security');
  assert.equal(hsts[0], '  Strict-Transport-Security: max-age=31536000');
});
