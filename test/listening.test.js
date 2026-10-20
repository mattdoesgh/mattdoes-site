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

test('a tracks cache bakes names into /listening/', () => {
  const { distDir } = buildFixtureVault({ cacheDir: seedLastfmCache(fixtureCache) });
  const html = readDist(distDir, 'listening/index.html');
  assert.match(html, /Poisoned Track/);
  assert.doesNotMatch(html, /Last\.fm/);
  assert.doesNotMatch(html, /https:\/\/www\.last\.fm\/user\/djverism/);
  assert.doesNotMatch(html, /scrobble-count/);
});

test('the homepage does not present a scrobble counter', () => {
  const { distDir } = buildFixtureVault({ cacheDir: seedLastfmCache(fixtureCache) });
  const html = readDist(distDir, 'index.html');
  assert.doesNotMatch(html, /scrobble-count/);
});
