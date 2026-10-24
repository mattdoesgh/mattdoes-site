// A cover that fails in the browser is replaced by the next hidden spare,
// in the same cell. With no spare left, the tile is removed.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { REPO_ROOT } from './helpers/run-build.js';

const STATION = fs.readFileSync(path.join(REPO_ROOT, 'static', 'station.js'), 'utf8');

function tile(name, src) {
  return `<a class="album-tile" href="https://www.last.fm/music/${name}">`
    + `<img src="${src}" alt="${name}">`
    + `<span class="album-cap">${name}</span></a>`;
}

function listeningDom() {
  const html = `<!doctype html><body data-root="/">
    <div class="album-charts">
      <div class="album-grid">
        ${tile('Bad', 'https://lastfm.freetls.fastly.net/i/u/300x300/bad.jpg')}
        ${tile('Ok', 'https://lastfm.freetls.fastly.net/i/u/300x300/ok.jpg')}
      </div>
      <div class="album-spares" hidden>
        ${tile('Spare', 'https://lastfm.freetls.fastly.net/i/u/300x300/spare.jpg')}
      </div>
    </div>
    <ol class="tracks" id="tracks"></ol>
  </body>`;
  const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'https://mattdoes.online/listening/' });
  for (const img of dom.window.document.querySelectorAll('img')) {
    Object.defineProperty(img, 'complete', { configurable: true, get: () => false });
    Object.defineProperty(img, 'naturalWidth', { configurable: true, get: () => 0 });
  }
  return dom;
}

function boot(dom) {
  const script = dom.window.document.createElement('script');
  script.textContent = STATION;
  dom.window.document.body.appendChild(script);
}

test('a broken cover is replaced in place, then removed when no spare remains', () => {
  const dom = listeningDom();
  boot(dom);
  const { document } = dom.window;
  const grid = document.querySelector('.album-grid');
  const before = [...grid.querySelectorAll('.album-tile')];
  const ok = before[1];

  before[0].querySelector('img').dispatchEvent(new dom.window.Event('error'));

  const swapped = [...grid.querySelectorAll('.album-tile')];
  assert.equal(swapped.length, 2);
  assert.equal(swapped[0].querySelector('img').getAttribute('alt'), 'Spare');
  assert.equal(swapped[1], ok, 'the cover after the failed cell does not move');
  assert.equal(document.querySelector('.album-spares .album-tile'), null);
  assert.equal(document.body.contains(before[0]), false);

  swapped[0].querySelector('img').dispatchEvent(new dom.window.Event('error'));

  const left = [...grid.querySelectorAll('.album-tile')];
  assert.equal(left.length, 1);
  assert.equal(left[0], ok);
  assert.equal(left[0].querySelector('img').getAttribute('alt'), 'Ok');
});

test('a cover that failed before the script runs is replaced', () => {
  const dom = listeningDom();
  const bad = dom.window.document.querySelector('.album-grid .album-tile img');
  Object.defineProperty(bad, 'complete', { configurable: true, get: () => true });
  Object.defineProperty(bad, 'naturalWidth', { configurable: true, get: () => 0 });
  bad.decode = () => Promise.reject(new Error('broken'));
  boot(dom);
  const tiles = [...dom.window.document.querySelectorAll('.album-grid .album-tile')];
  assert.equal(tiles.map((node) => node.querySelector('img').getAttribute('alt')).join(','), 'Spare,Ok');
});

test('a spare that already failed is not moved into the grid', () => {
  const dom = listeningDom();
  boot(dom);
  const { document } = dom.window;
  const spare = document.querySelector('.album-spares .album-tile');
  spare.querySelector('img').dispatchEvent(new dom.window.Event('error'));
  assert.equal(document.querySelector('.album-spares .album-tile'), null);

  const grid = document.querySelector('.album-grid');
  const bad = grid.querySelector('.album-tile');
  bad.querySelector('img').dispatchEvent(new dom.window.Event('error'));
  const left = [...grid.querySelectorAll('.album-tile')];
  assert.equal(left.length, 1);
  assert.equal(left[0].querySelector('img').getAttribute('alt'), 'Ok');
});
