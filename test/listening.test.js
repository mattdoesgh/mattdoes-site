// Build-time listening snapshot — playcount must stay in sync with the
// recent-tracks cache. Without this, a build can render real scrobble rows
// but bake "0" into the stat when only lastfm.json is seeded.

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import {
  buildFixtureVault, readDist, seedLastfmCache, REPO_ROOT,
} from './helpers/run-build.js';

const fixtureCache = path.join(REPO_ROOT, 'test', 'fixtures', 'lastfm-cache', 'lastfm.json');

test('a tracks cache bakes names into /listening/', () => {
  const { distDir } = buildFixtureVault({ cacheDir: seedLastfmCache(fixtureCache) });
  const html = readDist(distDir, 'listening/index.html');
  assert.match(html, /Poisoned Track/);
  const main = new JSDOM(html).window.document.querySelector('main');
  assert.equal(main.querySelector('.source'), null);
  assert.equal(main.querySelector('h1')?.textContent, 'matt does last.fm');
  assert.equal(main.querySelector('h1')?.nextElementSibling?.className, 'total');
  assert.equal(main.querySelector('.total-num')?.textContent, '12,345');
  assert.equal(main.querySelector('.total-label')?.textContent, 'scrobbles');
  assert.equal(main.querySelector('.total')?.textContent, '12,345 scrobbles');
  assert.equal(main.querySelector('.periods'), null);
  assert.doesNotMatch(main.innerHTML, /https:\/\/www\.last\.fm\/user\/djverism/);
  assert.doesNotMatch(html, /scrobble-count/);
});

test('the homepage does not present a scrobble counter', () => {
  const { distDir } = buildFixtureVault({ cacheDir: seedLastfmCache(fixtureCache) });
  const html = readDist(distDir, 'index.html');
  assert.doesNotMatch(html, /scrobble-count/);
});
