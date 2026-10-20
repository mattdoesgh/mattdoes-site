// The live refresh waits out prerender. style-src stays strict.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { REPO_ROOT } from './helpers/run-build.js';

test('station.js defers startup until prerender activation', () => {
  const src = fs.readFileSync(path.join(REPO_ROOT, 'static', 'station.js'), 'utf8');
  assert.match(src, /document\.prerendering/);
  assert.match(src, /prerenderingchange/);
});

test('style-src omits unsafe-inline in shipped headers', () => {
  const headers = fs.readFileSync(path.join(REPO_ROOT, 'static', '_headers'), 'utf8');
  assert.match(headers, /style-src 'self'/);
  assert.doesNotMatch(headers, /style-src[^;]*unsafe-inline/);
});
