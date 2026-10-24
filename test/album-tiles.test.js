// A cover that fails in the browser is removed. A hidden spare takes the slot.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { REPO_ROOT } from './helpers/run-build.js';

function page(html) {
  const dom = new JSDOM(`<!doctype html><body>${html}</body>`, {
    url: 'https://mattdoes.online/listening/',
    runScripts: 'dangerously',
  });
  const { window } = dom;
  window.fetch = () => Promise.reject(new Error('offline'));
  for (const img of window.document.querySelectorAll('img')) {
    Object.defineProperty(img, 'complete', { configurable: true, get: () => true });
    Object.defineProperty(img, 'naturalWidth', { configurable: true, get: () => 300 });
  }
  const script = window.document.createElement('script');
  script.textContent = fs.readFileSync(path.join(REPO_ROOT, 'static', 'station.js'), 'utf8');
  window.document.body.appendChild(script);
  return window;
}

function fail(window, img) {
  Object.defineProperty(img, 'complete', { configurable: true, get: () => true });
  Object.defineProperty(img, 'naturalWidth', { configurable: true, get: () => 0 });
  img.dispatchEvent(new window.Event('error'));
}

test('a failed cover is removed and the spare is revealed', () => {
  const window = page(`
    <div class="album-grid">
      <a class="album-tile" href="https://www.last.fm/music/A/One"><img src="https://lastfm.freetls.fastly.net/i/u/300x300/one.jpg" alt="One"></a>
      <a class="album-tile" href="https://www.last.fm/music/A/Two"><img src="https://lastfm.freetls.fastly.net/i/u/300x300/two.jpg" alt="Two"></a>
      <a class="album-tile" hidden href="https://www.last.fm/music/A/Spare"><img src="https://lastfm.freetls.fastly.net/i/u/300x300/spare.jpg" alt="Spare"></a>
    </div>
  `);
  const grid = window.document.querySelector('.album-grid');
  assert.equal(grid.querySelectorAll('.album-tile').length, 3);
  fail(window, grid.querySelector('img'));
  const tiles = [...grid.querySelectorAll('.album-tile')];
  assert.equal(tiles.length, 2);
  assert.equal(tiles[0].querySelector('img').getAttribute('alt'), 'Two');
  assert.equal(tiles[1].hasAttribute('hidden'), false);
  assert.equal(tiles[1].querySelector('img').getAttribute('alt'), 'Spare');
  assert.equal(grid.querySelector('img[alt="One"]'), null);
});

test('a spare that fails does not reveal another tile', () => {
  const window = page(`
    <div class="album-grid">
      <a class="album-tile"><img src="https://lastfm.freetls.fastly.net/i/u/300x300/one.jpg" alt="One"></a>
      <a class="album-tile" hidden><img src="https://lastfm.freetls.fastly.net/i/u/300x300/spare.jpg" alt="Spare"></a>
    </div>
  `);
  const grid = window.document.querySelector('.album-grid');
  const spare = grid.querySelector('.album-tile[hidden] img');
  fail(window, spare);
  const tiles = [...grid.querySelectorAll('.album-tile')];
  assert.equal(tiles.length, 1);
  assert.equal(tiles[0].querySelector('img').getAttribute('alt'), 'One');
  assert.equal(tiles[0].hasAttribute('hidden'), false);
});
