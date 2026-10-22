// /listening/ period charts. Baked from the Last.fm cache. A missing chart
// leaves the recent tracks alone. The poller alarm does not fetch charts.

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { ListeningPoller } from '../workers/listening/src/index.js';
import {
  buildFixtureVault, readDist, seedLastfmCache, REPO_ROOT,
} from './helpers/run-build.js';

const fixture = path.join(REPO_ROOT, 'test', 'fixtures', 'lastfm-periods.json');

test('period charts render on /listening/ without ranks, hours, or the username', () => {
  const { distDir } = buildFixtureVault({ cacheDir: seedLastfmCache(fixture) });
  const html = readDist(distDir, 'listening/index.html');
  const doc = new JSDOM(html).window.document;
  const main = doc.querySelector('main');

  assert.equal(main.querySelector('.source')?.textContent, 'Last.fm');
  assert.equal(main.querySelectorAll('.source').length, 1);
  assert.equal(main.querySelector('.total-num')?.textContent, '120,022');
  assert.equal(main.querySelector('.total-label')?.textContent, 'scrobbles');
  assert.deepEqual(
    [...main.querySelectorAll('.period h2')].map((el) => el.textContent),
    ['overall', '12 months', '3 months', '1 month'],
  );
  assert.match(main.textContent, /Fixture Track/);
  assert.match(main.textContent, /Fixture Artist/);
  assert.match(main.textContent, /Year Album/);
  assert.match(main.textContent, /Season Artist/);
  assert.match(main.textContent, /Month Album/);
  assert.equal(main.querySelector('.recent-label')?.textContent, 'recent');
  assert.equal(main.querySelector('ol#tracks')?.tagName, 'OL');
  assert.equal(main.querySelector('ol.names'), null);

  const season = [...main.querySelectorAll('.period')].find((el) => el.querySelector('h2')?.textContent === '3 months');
  assert.equal(season?.querySelector('h3')?.textContent, 'artists');
  assert.equal(season?.querySelectorAll('h3').length, 1);

  for (const li of main.querySelectorAll('.names li')) {
    assert.doesNotMatch(li.textContent, /^\s*\d+[.)]/);
  }
  assert.doesNotMatch(main.innerHTML, /djverism/);
  assert.doesNotMatch(main.innerHTML, /javascript:/);
  assert.doesNotMatch(html, /16:18/);
  assert.doesNotMatch(html, /T15:00/);
  assert.equal(main.querySelector('a[href="https://www.last.fm/music/Fixture+Artist"]')?.textContent, 'Fixture Artist');
  assert.equal(
    [...main.querySelectorAll('.names a')].some((anchor) => (anchor.getAttribute('href') || '').includes('/user/')),
    false,
  );

  const home = new JSDOM(readDist(distDir, 'index.html')).window.document;
  assert.equal(home.querySelectorAll('a.verb').length, 2);
  assert.equal(home.querySelector('.periods'), null);
  assert.doesNotMatch(home.body.textContent, /Fixture Artist/);
  assert.doesNotMatch(home.body.textContent, /12 months/);
});

test('the listening poller alarm still refreshes recent tracks only', () => {
  const alarm = ListeningPoller.prototype.alarm.toString();
  assert.match(alarm, /refreshBoth/);
  assert.doesNotMatch(alarm, /topArtists|topAlbums|gettop|fetchChart|charts/);
});
