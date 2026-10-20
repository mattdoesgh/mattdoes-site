// The shared thousands formatter. The pages do not render a scrobble counter.

import test from 'node:test';
import assert from 'node:assert/strict';
import { formatScrobbleCount } from '../lib/format.js';
import { buildFixtureVault, readDist } from './helpers/run-build.js';

test('formatScrobbleCount groups thousands', () => {
  assert.equal(formatScrobbleCount(12345), '12,345');
  assert.ok(formatScrobbleCount(12345).includes(','), 'fixture playcount should exercise comma grouping');
});

test('the pages do not render a scrobble counter', () => {
  const { distDir } = buildFixtureVault();
  assert.doesNotMatch(readDist(distDir, 'listening/index.html'), /scrobble-count/);
  assert.doesNotMatch(readDist(distDir, 'index.html'), /scrobble-count/);
});
