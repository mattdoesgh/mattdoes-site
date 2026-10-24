// /listening/ monthly cover grid. Baked from the Last.fm cache. A missing
// chart leaves the recent tracks alone. The poller alarm does not fetch charts.
// Albums with no real cover are omitted, and later rows fill the grid.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { ListeningPoller } from '../workers/listening/src/index.js';
import {
  buildFixtureVault, makeTempDir, readDist, seedLastfmCache, REPO_ROOT,
} from './helpers/run-build.js';

const fixture = path.join(REPO_ROOT, 'test', 'fixtures', 'lastfm-periods.json');

test('the monthly cover grid skips blank art and other periods', () => {
  const { distDir } = buildFixtureVault({ cacheDir: seedLastfmCache(fixture) });
  const html = readDist(distDir, 'listening/index.html');
  const doc = new JSDOM(html).window.document;
  const main = doc.querySelector('main');
  const charts = main.querySelector('.album-charts');

  assert.equal(main.querySelector('h1')?.textContent, 'matt does last.fm');
  assert.deepEqual(
    [...main.querySelectorAll('h1, h2, h3')].map((el) => el.textContent),
    ['matt does last.fm', 'recent'],
  );
  assert.equal(main.querySelector('h1')?.nextElementSibling?.className, 'total');
  assert.equal(main.querySelector('.source'), null);
  assert.equal(main.querySelector('.total-num')?.textContent, '120,022');
  assert.equal(main.querySelector('.total-spoken')?.textContent, 'scrobbles');
  assert.equal(main.querySelector('.wave')?.getAttribute('aria-hidden'), 'true');
  assert.equal([...main.querySelectorAll('.wave span')].map((el) => el.textContent).join(''), 'scrobbles');
  assert.equal(main.querySelector('.total-label')?.getAttribute('aria-hidden'), null);
  assert.equal(main.querySelector('.period-switch'), null);
  assert.equal(main.querySelector('.period-label'), null);
  assert.equal(main.querySelector('.period-input'), null);
  assert.equal(charts.querySelector('h3'), null);
  assert.equal(charts.querySelector('script'), null);
  assert.equal(main.querySelectorAll('.album-grid').length, 1);

  const tiles = [...charts.querySelectorAll('.album-tile')];
  assert.equal(tiles.length, 26);
  assert.equal(tiles.filter((tile) => !tile.hasAttribute('hidden')).length, 25);
  assert.equal(tiles[25].hasAttribute('hidden'), true);
  assert.equal(tiles[25].querySelector('.album-name')?.textContent, 'Cover 26');
  assert.equal(tiles.every((tile) => tile.querySelector('img')), true);
  assert.equal(charts.querySelector('.is-plain'), null);

  const cover = tiles[0];
  assert.equal(cover.getAttribute('href'), 'https://www.last.fm/music/Cover+Artist/Cover+01');
  assert.equal(cover.getAttribute('title'), 'Cover 01 — Cover Artist');
  const img = cover.querySelector('img');
  assert.equal(img.getAttribute('src'), 'https://lastfm.freetls.fastly.net/i/u/300x300/cover01.jpg');
  assert.equal(img.getAttribute('alt'), 'Cover 01 — Cover Artist');
  assert.equal(img.getAttribute('width'), '300');
  assert.equal(img.getAttribute('height'), '300');
  assert.equal(img.getAttribute('loading'), 'lazy');
  assert.equal(cover.querySelector('.album-name')?.textContent, 'Cover 01');
  assert.equal(cover.querySelector('.album-by')?.textContent, 'Cover Artist');

  assert.equal(
    tiles[1].querySelector('img')?.getAttribute('src'),
    'https://lastfm-img.freetls.fastly.net/i/u/300x300/cover02.jpg',
  );
  assert.equal(tiles[2].getAttribute('href'), null, 'a profile url is not a tile link');
  assert.equal(tiles[2].querySelector('.album-name')?.textContent, 'Cover 03');
  assert.equal(tiles[24].querySelector('.album-name')?.textContent, 'Cover 25');

  assert.doesNotMatch(main.textContent, /Plain Album|Star Album|Foreign Album|Http Album/);
  assert.doesNotMatch(main.textContent, /Overall Album|Year Album|Season Album/);
  const visible = tiles.filter((tile) => !tile.hasAttribute('hidden')).map((tile) => tile.textContent).join('\n');
  assert.doesNotMatch(visible, /Cover 26/);
  assert.match(main.textContent, /Fixture Track/);
  assert.equal(main.querySelector('.recent-label')?.textContent, 'recent');
  assert.equal(main.querySelector('ol#tracks')?.tagName, 'OL');

  assert.doesNotMatch(main.innerHTML, /djverism/);
  assert.doesNotMatch(main.innerHTML, /javascript:/);
  assert.doesNotMatch(html, /16:18/);
  assert.doesNotMatch(html, /T15:00/);
  assert.equal(
    [...main.querySelectorAll('a')].some((anchor) => (anchor.getAttribute('href') || '').includes('/user/')),
    false,
  );

  const home = new JSDOM(readDist(distDir, 'index.html')).window.document;
  assert.equal(home.querySelectorAll('a.verb').length, 2);
  assert.equal(home.querySelector('.album-charts'), null);
  assert.doesNotMatch(home.body.textContent, /Cover Artist/);
  assert.doesNotMatch(home.body.textContent, /1 month/);
});

test('a short monthly chart ends on the last real cover', () => {
  const cacheDir = makeTempDir('mattdoes-cache-');
  fs.writeFileSync(path.join(cacheDir, 'lastfm.json'), JSON.stringify({
    fetchedAt: '2026-10-20T13:20:00.000Z',
    playcount: 40,
    tracks: [{
      track: 'Only Track',
      artist: 'Only Artist',
      album: 'Only Album',
      link: 'https://www.last.fm/music/Only+Artist/_/Only+Track',
      date: '2026-10-18T12:00:00.000Z',
      nowPlaying: false,
    }],
    periods: {
      '1month': {
        albums: [
          { name: 'Blank Album', artist: 'A', playcount: 4, url: '', image: '' },
          {
            name: 'Only Cover',
            artist: 'Only Artist',
            playcount: 3,
            url: 'https://www.last.fm/music/Only+Artist/Only+Cover',
            image: 'https://lastfm.freetls.fastly.net/i/u/300x300/only.jpg',
          },
          {
            name: 'Star Album',
            artist: 'B',
            playcount: 1,
            url: '',
            image: 'https://lastfm.freetls.fastly.net/i/u/300x300/2a96cbd8b46e442fc41c2b86b821562f.png',
          },
        ],
      },
    },
  }));
  const { distDir } = buildFixtureVault({ cacheDir });
  const main = new JSDOM(readDist(distDir, 'listening/index.html')).window.document.querySelector('main');
  const tiles = [...main.querySelectorAll('.album-tile')];
  assert.equal(tiles.length, 1);
  assert.equal(tiles[0].querySelector('.album-name')?.textContent, 'Only Cover');
  assert.equal(tiles[0].querySelector('img')?.getAttribute('src'), 'https://lastfm.freetls.fastly.net/i/u/300x300/only.jpg');
  assert.equal(main.querySelector('.is-plain'), null);
  assert.doesNotMatch(main.textContent, /Blank Album|Star Album/);
});

test('listening type matches the watching titles', () => {
  const css = fs.readFileSync(path.join(REPO_ROOT, 'static', 'station.css'), 'utf8');
  const tokens = fs.readFileSync(path.join(REPO_ROOT, 'site', 'tokens.css'), 'utf8');
  const heading = css.slice(
    css.indexOf('.film .name,\n.recent-label,\n.tracks .what,\n.scene-title {'),
    css.indexOf('.film .name {\n  margin: var(--space-0);'),
  );
  assert.match(heading, /font-family:\s*var\(--display\)/);
  assert.match(heading, /font-weight:\s*var\(--weight-regular\)/);
  assert.match(heading, /text-transform:\s*uppercase/);
  assert.match(heading, /font-size:\s*var\(--type-title\)/);
  assert.match(heading, /line-height:\s*0\.88/);
  assert.match(heading, /letter-spacing:\s*var\(--track-none\)/);
  assert.match(tokens, /--weight-regular:\s*400;/);
  assert.match(tokens, /--track-none:\s*0;/);
  assert.match(tokens, /--type-title:\s*clamp\(2rem, 6vw, 3\.3rem\);/);
  assert.match(tokens, /--type-title-desk:\s*clamp\(1\.65rem, 1\.7vw, 2\.45rem\);/);
  assert.match(tokens, /--type-body:\s*1\.125rem;/);
  const desktop = css.slice(css.indexOf('@media (min-width: 1024px)'));
  assert.match(desktop, /\.film \.name,\s*\.recent-label,\s*\.tracks \.what,\s*\.scene-title \{[^}]*font-size:\s*var\(--type-title-desk\)/);
  assert.match(desktop, /\.album-cap \{[^}]*font-size:\s*var\(--type-title-desk\)/);
  const totalBlock = css.slice(css.indexOf('.total {'), css.indexOf('.total-num {'));
  assert.match(totalBlock, /display:\s*flex/);
  assert.match(totalBlock, /flex-wrap:\s*nowrap/);
  assert.match(totalBlock, /align-items:\s*baseline/);
  const total = css.slice(css.indexOf('.total-num {'), css.indexOf('body[data-polarity="flip"] .total-num'));
  assert.match(total, /font-family:\s*var\(--display\)/);
  assert.match(total, /font-weight:\s*var\(--weight-regular\)/);
  assert.match(total, /letter-spacing:\s*var\(--track-none\)/);
  assert.match(total, /white-space:\s*nowrap/);
  assert.doesNotMatch(total, /display:\s*block/);
  const totalLabel = css.slice(css.indexOf('.total-label {'), css.indexOf('body[data-polarity="flip"] .total-label'));
  assert.match(totalLabel, /font-family:\s*var\(--body\)/);
  assert.match(totalLabel, /font-weight:\s*var\(--weight-regular\)/);
  assert.match(totalLabel, /letter-spacing:\s*var\(--track-none\)/);
  assert.match(totalLabel, /white-space:\s*nowrap/);
  assert.match(totalLabel, /color:\s*var\(--pink\)/);
  assert.doesNotMatch(totalLabel, /display:\s*block/);
  assert.match(tokens, /--pink:\s*#f7c8d8;/);
  const wave = css.slice(css.indexOf('.wave {'), css.indexOf('.recent-label {'));
  assert.match(wave, /display:\s*inline-flex/);
  assert.match(wave, /align-items:\s*baseline/);
  assert.match(wave, /nth-child\(3\)\s*\{[^}]*translateY\(-0\.28em\)/);
  assert.match(wave, /nth-child\(7\)\s*\{[^}]*translateY\(0\.28em\)/);
  assert.doesNotMatch(wave, /animation|transition|@keyframes/);
  assert.match(css, /\.redaction-hint,\s*\.total-spoken,\s*\.scene\.is-still \.scene-title \{/);
  const cap = css.slice(css.indexOf('.album-cap {'), css.indexOf('.album-by {'));
  assert.match(cap, /font-family:\s*var\(--display\)/);
  assert.match(cap, /font-weight:\s*var\(--weight-regular\)/);
  assert.match(cap, /text-transform:\s*uppercase/);
  assert.match(cap, /letter-spacing:\s*var\(--track-none\)/);
  const byAt = css.indexOf('.album-by {');
  const by = css.slice(byAt, css.indexOf('@media (hover: hover)', byAt));
  assert.match(by, /font-family:\s*var\(--body\)/);
  assert.match(by, /text-transform:\s*none/);
  assert.match(by, /letter-spacing:\s*var\(--track-none\)/);
  const meta = css.slice(css.indexOf('.tracks .by,\n.tracks .album {'), css.indexOf('.tracks .album::before'));
  assert.match(meta, /font-family:\s*var\(--body\)/);
  assert.match(meta, /font-size:\s*var\(--type-body\)/);
  assert.match(meta, /font-weight:\s*var\(--weight-regular\)/);
  assert.match(meta, /letter-spacing:\s*var\(--track-none\)/);
  assert.match(meta, /text-transform:\s*none/);
  assert.doesNotMatch(css, /\.period-switch|\.period-label|\.is-plain|\.source \{/);
  assert.doesNotMatch(css, /\.album-tile[^{]*\{[^}]*transition/);
  assert.doesNotMatch(css, /\.album-cap[^{]*\{[^}]*transition/);
  const grid = css.slice(css.indexOf('.album-grid {'), css.indexOf('.album-tile {'));
  assert.doesNotMatch(grid, /gap|border/);
  assert.match(grid, /grid-template-columns:\s*repeat\(5, minmax\(0, 1fr\)\)/);
});

test('the listening poller alarm still refreshes recent tracks only', () => {
  const alarm = ListeningPoller.prototype.alarm.toString();
  assert.match(alarm, /refreshBoth/);
  assert.doesNotMatch(alarm, /topArtists|topAlbums|gettop|fetchChart|charts/);
});
