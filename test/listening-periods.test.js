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

test('album covers render on /listening/ without ranks, hours, or the username', () => {
  const { distDir } = buildFixtureVault({ cacheDir: seedLastfmCache(fixture) });
  const html = readDist(distDir, 'listening/index.html');
  const doc = new JSDOM(html).window.document;
  const main = doc.querySelector('main');
  const charts = main.querySelector('.album-charts');

  assert.equal(main.querySelector('.source')?.textContent, 'Last.fm');
  assert.equal(main.querySelectorAll('.source').length, 1);
  assert.equal(main.querySelector('.total-num')?.textContent, '120,022');
  assert.equal(main.querySelector('.total-label')?.textContent, 'scrobbles');
  assert.deepEqual(
    [...charts.querySelectorAll('.period-label')].map((el) => el.textContent),
    ['overall', '12 months', '3 months', '1 month'],
  );
  assert.equal(charts.querySelector('#period-overall')?.checked, true);
  assert.equal(charts.querySelector('#period-12month')?.checked, false);
  assert.equal(charts.querySelector('h3'), null);
  assert.equal(charts.querySelector('.names'), null);
  assert.equal(charts.querySelector('script'), null);

  const overall = charts.querySelector('.album-grid[data-period="overall"]');
  const tiles = [...overall.querySelectorAll('.album-tile')];
  assert.equal(tiles.length, 4);
  const cover = tiles[0];
  assert.equal(cover.getAttribute('href'), 'https://www.last.fm/music/Fixture+Artist/Fixture+Album');
  assert.equal(cover.getAttribute('title'), 'Fixture Album — Fixture Artist');
  const img = cover.querySelector('img');
  assert.equal(img.getAttribute('src'), 'https://lastfm.freetls.fastly.net/i/u/300x300/fixturecover.jpg');
  assert.equal(img.getAttribute('alt'), 'Fixture Album — Fixture Artist');
  assert.equal(img.getAttribute('width'), '300');
  assert.equal(img.getAttribute('height'), '300');
  assert.equal(img.getAttribute('loading'), 'lazy');

  assert.equal(tiles[1].classList.contains('is-plain'), true);
  assert.equal(tiles[1].querySelector('img'), null);
  assert.equal(tiles[1].getAttribute('title'), 'Plain Album — Plain Artist');
  assert.equal(tiles[2].querySelector('img'), null, 'the Last.fm star placeholder is not a cover');
  assert.equal(tiles[3].querySelector('img'), null, 'a foreign image host is dropped');
  assert.equal(tiles[3].getAttribute('href'), null);
  assert.doesNotMatch(overall.textContent, /800|10|9|8/);

  const year = charts.querySelector('.album-grid[data-period="12month"] img');
  assert.equal(year?.getAttribute('alt'), 'Year Album — Year Artist');
  assert.equal(year?.getAttribute('src'), 'https://lastfm-img.freetls.fastly.net/i/u/300x300/yearcover.jpg');
  const month = charts.querySelector('.album-grid[data-period="1month"] .album-tile');
  assert.equal(month.classList.contains('is-plain'), true, 'http artwork is dropped');
  assert.match(charts.textContent, /Season Album/);
  assert.match(main.textContent, /Fixture Track/);
  assert.equal(main.querySelector('.recent-label')?.textContent, 'recent');
  assert.equal(main.querySelector('ol#tracks')?.tagName, 'OL');

  assert.doesNotMatch(main.innerHTML, /djverism/);
  assert.doesNotMatch(main.innerHTML, /javascript:/);
  assert.doesNotMatch(html, /16:18/);
  assert.doesNotMatch(html, /T15:00/);
  assert.equal(main.querySelector('a[href="https://www.last.fm/music/Fixture+Artist"]'), null);
  assert.equal(
    [...main.querySelectorAll('a')].some((anchor) => (anchor.getAttribute('href') || '').includes('/user/')),
    false,
  );

  const home = new JSDOM(readDist(distDir, 'index.html')).window.document;
  assert.equal(home.querySelectorAll('a.verb').length, 2);
  assert.equal(home.querySelector('.album-charts'), null);
  assert.doesNotMatch(home.body.textContent, /Fixture Artist/);
  assert.doesNotMatch(home.body.textContent, /12 months/);
});

test('the listening poller alarm still refreshes recent tracks only', () => {
  const alarm = ListeningPoller.prototype.alarm.toString();
  assert.match(alarm, /refreshBoth/);
  assert.doesNotMatch(alarm, /topArtists|topAlbums|gettop|fetchChart|charts/);
});
