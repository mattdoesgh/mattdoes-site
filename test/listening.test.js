// Build-time listening snapshot — playcount must stay in sync with the
// recent-tracks cache. Without this, a build can render real scrobble rows
// but bake "0" into the stat when only lastfm.json is seeded.

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {
  buildFixtureVault, readDist, seedLastfmCache, REPO_ROOT,
} from './helpers/run-build.js';

const fixtureCache = path.join(REPO_ROOT, 'test', 'fixtures', 'lastfm-cache', 'lastfm.json');

test('a tracks-only cache still bakes the playcount into /listen/', () => {
  const { distDir } = buildFixtureVault({ cacheDir: seedLastfmCache(fixtureCache) });
  const html = readDist(distDir, 'listen/index.html');
  assert.match(html, /id="scrobble-count">12,345<\/span>/,
    'playcount from lastfm.json must appear in the listening stat');
});

test('the editorial homepage does not present listening as an activity counter', () => {
  const { distDir } = buildFixtureVault({ cacheDir: seedLastfmCache(fixtureCache) });
  const html = readDist(distDir, 'index.html');
  assert.doesNotMatch(html, /id="scrobble-count"/,
    'scrobble counts belong to /listen/, not the front page');
});
