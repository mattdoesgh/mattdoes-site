// The wave belongs to the films count word. Nothing else on the site rides it.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { renderHome, renderWatch } from '../site/render.js';
import { buildFixtureVault, listDistHtml, makeTempDir, REPO_ROOT } from './helpers/run-build.js';

const WAVE_WORDS = new Set(['films']);

const ctx = {
  siteUrl: 'https://mattdoes.online',
  assets: { 'station.css': 'station.abc12345.css', 'station.js': 'station.abc12345.js', 'hero.css': 'hero.abc12345.css', 'hero.js': 'hero.abc12345.js', 'ether.css': 'ether.abc12345.css', 'ether.js': 'ether.abc12345.js' },
  watches: [],
};

function wavesIn(html) {
  const doc = new JSDOM(html).window.document;
  return [...doc.querySelectorAll('.wave')].map((el) => ({
    text: el.textContent,
    hidden: el.getAttribute('aria-hidden'),
    inNumber: Boolean(el.closest('.total-num')),
    inHeading: Boolean(el.closest('h1, h2, h3, h4, h5, h6')),
    inLink: Boolean(el.closest('a')),
    numberHasWave: Boolean(el.closest('.total')?.querySelector('.total-num')?.querySelector('.wave')),
  }));
}

test('rendered counts wave only films', () => {
  const watch = wavesIn(renderWatch({ ...ctx, filmCount: 89 }));
  const home = wavesIn(renderHome({ ...ctx, filmCount: 89 }));
  assert.deepEqual(watch.map((row) => row.text), ['films']);
  assert.deepEqual(home, []);
  for (const row of watch) {
    assert.equal(row.hidden, 'true');
    assert.equal(row.inNumber, false);
    assert.equal(row.inHeading, false);
    assert.equal(row.inLink, false);
    assert.equal(row.numberHasWave, false);
  }
  const other = wavesIn(renderWatch({ ...ctx, filmCount: 4 }));
  assert.equal(other[0].text, 'films');
  const plain = new JSDOM(renderWatch({ ...ctx, filmCount: 0 })).window.document;
  assert.equal(plain.querySelector('.wave'), null);
});

test('every built page waves only that word', () => {
  const cacheDir = makeTempDir('mattdoes-wave-');
  const fixtures = path.join(REPO_ROOT, 'test', 'fixtures', 'visual');
  fs.copyFileSync(path.join(fixtures, 'letterboxd.json'), path.join(cacheDir, 'letterboxd.json'));
  const { distDir } = buildFixtureVault({ cacheDir });
  const found = [];
  for (const file of listDistHtml(distDir)) {
    const rel = path.relative(distDir, file);
    const html = fs.readFileSync(file, 'utf8');
    const doc = new JSDOM(html).window.document;
    for (const el of doc.querySelectorAll('.wave')) {
      found.push({ rel, text: el.textContent });
      assert.equal(el.getAttribute('aria-hidden'), 'true', rel);
      assert.equal(el.closest('.total-num'), null, rel);
      assert.equal(el.closest('h1, h2, h3, h4, h5, h6'), null, rel);
      assert.equal(el.closest('a'), null, rel);
      assert.ok(WAVE_WORDS.has(el.textContent), `${rel} waved ${el.textContent}`);
    }
    for (const num of doc.querySelectorAll('.total-num')) {
      assert.equal(num.classList.contains('wave'), false, rel);
      assert.equal(num.querySelector('.wave'), null, rel);
    }
    if (rel !== 'watching/index.html') {
      assert.equal(doc.querySelector('.wave'), null, rel);
    }
  }
  assert.deepEqual(
    found.map((row) => `${row.rel}:${row.text}`).sort(),
    ['watching/index.html:films'],
  );
  const render = fs.readFileSync(path.join(REPO_ROOT, 'site', 'render.js'), 'utf8');
  assert.equal(render.match(/class="wave"/g).length, 1);
});
