// The verb pages carry the home ether: a glyph band, the ether polarity,
// and a script that keeps everything in the page.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { renderWatch, renderUnshared } from '../site/render.js';
import { renderHubDocument } from '../concepts/hub.js';
import { REPO_ROOT } from './helpers/run-build.js';

const assets = {
  'station.css': 'station.abc12345.css',
  'station.js': 'station.abc12345.js',
  'poster-prefs.js': 'poster-prefs.abc12345.js',
  'ether.css': 'ether.abc12345.css',
  'ether.js': 'ether.abc12345.js',
};

function doc(html) {
  return new JSDOM(html).window.document;
}

test('letterboxd joins the ether with a band ringed by its word', () => {
  const page = doc(renderWatch({ siteUrl: 'https://mattdoes.online', assets, watches: [], filmCount: 0 }));
  assert.equal(page.body.getAttribute('data-polarity'), 'ether');
  const band = page.querySelector('main > canvas.ether-band');
  assert.ok(band);
  assert.equal(band.getAttribute('aria-hidden'), 'true');
  assert.equal(band.getAttribute('data-word'), 'letterboxd');
  assert.equal(band.nextElementSibling?.matches('h1.sign'), true);
  assert.ok(page.querySelector('link[href="/ether.abc12345.css"]'));
  assert.ok(page.querySelector('script[src="/ether.abc12345.js"][defer]'));
});

test('unshared joins the ether and loads the band script when it is built', () => {
  const page = doc(renderUnshared({ siteUrl: 'https://mattdoes.online', assets }));
  assert.equal(page.body.getAttribute('data-polarity'), 'ether');
  const band = page.querySelector('main > canvas.ether-band');
  assert.equal(band?.getAttribute('aria-hidden'), 'true');
  assert.equal(band?.getAttribute('data-word'), 'unshared');
  assert.ok(page.querySelector('script[src="/ether.abc12345.js"][defer]'));
  const bare = doc(renderHubDocument('https://mattdoes.online'));
  assert.equal(bare.querySelector('script'), null);
});

test('ether.js keeps to the page and summons at random', () => {
  const src = fs.readFileSync(path.join(REPO_ROOT, 'static', 'ether.js'), 'utf8');
  assert.doesNotMatch(src, /\bfetch\(|XMLHttpRequest|sendBeacon|localStorage|sessionStorage|document\.cookie|innerHTML/);
  assert.match(src, /crypto\.getRandomValues/);
});

test('ether.js draws a frame into the band', async () => {
  const src = fs.readFileSync(path.join(REPO_ROOT, 'static', 'ether.js'), 'utf8');
  const dom = new JSDOM('<body><canvas class="ether-band" data-word="letterboxd"></canvas></body>', { runScripts: 'outside-only', pretendToBeVisual: true });
  const { window } = dom;
  const drawn = [];
  const ctx = {
    setTransform() {}, clearRect() {}, measureText: () => ({ width: 7 }),
    fillText: (ch) => drawn.push(ch), font: '', textBaseline: '', fillStyle: '', globalAlpha: 1,
  };
  const band = window.document.querySelector('canvas');
  band.getContext = () => ctx;
  band.getBoundingClientRect = () => ({ width: 1000, height: 200, top: 0, left: 0 });
  window.matchMedia = () => ({ matches: false, addEventListener() {} });
  Object.defineProperty(window, 'crypto', { value: { getRandomValues: (a) => { a[0] = 123456789; return a; } } });
  window.eval(src);
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(band.hasAttribute('data-drawn'), true);
  assert.ok(drawn.length > 50);
  assert.ok(drawn.includes('l'));
});

test('the ether pages carry no prompt marks', () => {
  const ether = fs.readFileSync(path.join(REPO_ROOT, 'static', 'ether.css'), 'utf8');
  const hub = fs.readFileSync(path.join(REPO_ROOT, 'concepts', 'hub.css'), 'utf8');
  for (const css of [ether, hub]) {
    assert.doesNotMatch(css, /content:\s*">|content:\s*"\/\/|content:\s*"\[|invoke/);
  }
});

test('the half star cut line is violet in the ether', () => {
  const css = fs.readFileSync(path.join(REPO_ROOT, 'static', 'ether.css'), 'utf8');
  assert.match(css, /body\[data-polarity="ether"\] \.stars \.star-half::after \{[^}]*-webkit-text-stroke-color:\s*var\(--violet\)/);
});

test('ether.js veils nothing when motion is reduced', () => {
  const src = fs.readFileSync(path.join(REPO_ROOT, 'static', 'ether.js'), 'utf8');
  const dom = new JSDOM('<body><ul class="feed"><li>a</li><li>b</li></ul></body>', { runScripts: 'outside-only' });
  const { window } = dom;
  window.matchMedia = () => ({ matches: false, addEventListener() {} });
  window.IntersectionObserver = class { observe() { throw new Error('observed'); } unobserve() {} };
  window.eval(src);
  assert.equal(window.document.querySelectorAll('.ether-veil').length, 0);
});

test('ether.js veils films until they enter the viewport', () => {
  const src = fs.readFileSync(path.join(REPO_ROOT, 'static', 'ether.js'), 'utf8');
  const dom = new JSDOM('<body><ul class="feed"><li>a</li><li>b</li></ul></body>', { runScripts: 'outside-only' });
  const { window } = dom;
  let fire;
  window.matchMedia = () => ({ matches: true, addEventListener() {} });
  window.IntersectionObserver = class {
    constructor(cb) { fire = cb; }
    observe() {}
    unobserve() {}
  };
  window.eval(src);
  const items = [...window.document.querySelectorAll('.feed > li')];
  assert.equal(items.every((li) => li.classList.contains('ether-veil')), true);
  fire([{ isIntersecting: true, target: items[0] }]);
  assert.equal(items[0].classList.contains('ether-veil'), false);
  assert.equal(items[0].classList.contains('ether-rise'), true);
  assert.equal(items[1].classList.contains('ether-veil'), true);
});
