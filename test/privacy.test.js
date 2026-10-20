// The page does not store a visitor location. The geo worker remains deployed
// and unused by this shell.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { REPO_ROOT } from './helpers/run-build.js';

test('the station client does not touch localStorage or geolocation', () => {
  const src = fs.readFileSync(path.join(REPO_ROOT, 'static', 'station.js'), 'utf8');
  assert.doesNotMatch(src, /localStorage|sessionStorage|geolocation|indexedDB/);
});

test('the geo worker is still in the repo', () => {
  assert.equal(fs.existsSync(path.join(REPO_ROOT, 'workers', 'geo', 'src', 'index.js')), true);
});
