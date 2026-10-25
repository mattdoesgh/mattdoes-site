// Poster strip controls on /watching/. The head script applies a stored
// choice before the buttons exist. Listening keeps the plain count line.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { renderHome, renderListen, renderWatch } from '../site/render.js';
import { REPO_ROOT } from './helpers/run-build.js';

const script = fs.readFileSync(path.join(REPO_ROOT, 'static', 'poster-prefs.js'), 'utf8');
const css = fs.readFileSync(path.join(REPO_ROOT, 'static', 'station.css'), 'utf8');

const assets = {
  'station.css': 'station.abc12345.css',
  'station.js': 'station.abc12345.js',
  'poster-prefs.js': 'poster-prefs.abc12345.js',
};

const ctx = {
  siteUrl: 'https://mattdoes.online',
  assets,
  watches: [],
  tracks: [],
  filmCount: 89,
  playcount: 120022,
};

function buttons() {
  return new JSDOM(renderWatch(ctx)).window.document.querySelector('.poster-controls').outerHTML;
}

function domWith(storage) {
  const dom = new JSDOM(renderWatch(ctx), {
    runScripts: 'dangerously',
    url: 'https://mattdoes.online/watching/',
  });
  if (storage) {
    for (const [key, value] of Object.entries(storage)) dom.window.localStorage.setItem(key, value);
  }
  dom.window.eval(script);
  return dom;
}

test('watching renders posters on and across, and other pages do not', () => {
  const html = renderWatch(ctx);
  const doc = new JSDOM(html).window.document;
  const posters = doc.querySelector('[data-posters-toggle]');
  const axis = doc.querySelector('[data-axis-toggle]');
  assert.equal(posters?.tagName, 'BUTTON');
  assert.equal(axis?.tagName, 'BUTTON');
  assert.equal(posters.getAttribute('type'), 'button');
  assert.equal(axis.getAttribute('type'), 'button');
  assert.equal(posters.getAttribute('aria-pressed'), 'true');
  assert.equal(axis.getAttribute('aria-pressed'), 'false');
  assert.equal(posters.getAttribute('aria-label'), 'posters on');
  assert.equal(axis.getAttribute('aria-label'), 'layout across');
  assert.equal(posters.getAttribute('aria-controls'), 'feed');
  assert.equal(axis.getAttribute('aria-controls'), 'feed');
  assert.equal(posters.querySelector('.poster-key')?.textContent, 'posters');
  assert.equal(posters.querySelector('.poster-on')?.textContent, 'on');
  assert.equal(posters.querySelector('.poster-off')?.textContent, 'off');
  assert.equal(axis.querySelector('.poster-key')?.textContent, 'layout');
  assert.equal(axis.querySelector('.axis-across')?.textContent, 'across');
  assert.equal(axis.querySelector('.axis-down')?.textContent, 'down');
  assert.equal(doc.querySelector('.poster-sizer'), null);
  assert.match(css, /\.poster-controls\s*\{[^}]*flex-direction:\s*column/);
  assert.match(css, /\.poster-switch\s*\{[^}]*font-family:\s*var\(--body\)/);
  assert.match(css, /\.poster-track\s*\{[^}]*border:\s*var\(--line-strong\)/);
  assert.match(css, /\.poster-on,\s*\n\.axis-across\s*\{[^}]*background:\s*var\(--ink\)/);
  assert.equal(doc.querySelector('#feed')?.tagName, 'OL');
  assert.equal(doc.querySelector('.watch-head')?.nextElementSibling?.id, 'feed');

  const sheet = html.indexOf('rel="stylesheet"');
  const prefs = html.indexOf('/poster-prefs.abc12345.js');
  const body = html.indexOf('<body');
  assert.ok(sheet !== -1 && prefs > sheet && prefs < body, 'prefs script blocks in the head after the stylesheet');
  assert.match(html, /<script src="\/poster-prefs\.abc12345\.js"><\/script>/);
  assert.doesNotMatch(html.slice(prefs - 40, prefs + 80), /defer|async|type=/);

  for (const htmlPage of [renderHome(ctx), renderListen(ctx)]) {
    assert.equal(htmlPage.includes('poster-controls'), false);
    assert.equal(htmlPage.includes('poster-prefs'), false);
    assert.equal(htmlPage.includes('data-posters-toggle'), false);
  }
  const listen = new JSDOM(renderListen(ctx)).window.document;
  assert.equal(listen.querySelector('h1')?.nextElementSibling?.className, 'total');
  assert.equal(listen.querySelector('.poster-controls'), null);
});

test('the toggles change state, persist, and restore aria-pressed', async () => {
  const live = domWith();
  const root = live.window.document.documentElement;
  const posters = live.window.document.querySelector('[data-posters-toggle]');
  const axis = live.window.document.querySelector('[data-axis-toggle]');
  assert.equal(root.hasAttribute('data-posters'), false);
  assert.equal(root.hasAttribute('data-poster-axis'), false);

  posters.click();
  assert.equal(posters.getAttribute('aria-pressed'), 'false');
  assert.equal(posters.getAttribute('aria-label'), 'posters off');
  assert.equal(axis.getAttribute('aria-pressed'), 'false');
  assert.equal(axis.getAttribute('aria-label'), 'layout across');
  assert.equal(root.getAttribute('data-posters'), 'off');
  assert.equal(root.hasAttribute('data-poster-axis'), false);
  assert.equal(live.window.localStorage.getItem('mattdoes-posters'), 'off');
  assert.equal(live.window.localStorage.getItem('mattdoes-poster-axis'), 'across');

  axis.click();
  assert.equal(axis.getAttribute('aria-pressed'), 'true');
  assert.equal(axis.getAttribute('aria-label'), 'layout down');
  assert.equal(root.getAttribute('data-poster-axis'), 'down');
  assert.equal(live.window.localStorage.getItem('mattdoes-poster-axis'), 'down');
  assert.equal(root.getAttribute('data-posters'), 'off');

  posters.click();
  axis.click();
  assert.equal(posters.getAttribute('aria-pressed'), 'true');
  assert.equal(axis.getAttribute('aria-pressed'), 'false');
  assert.equal(root.hasAttribute('data-posters'), false);
  assert.equal(root.hasAttribute('data-poster-axis'), false);
  assert.equal(live.window.localStorage.getItem('mattdoes-posters'), 'on');
  assert.equal(live.window.localStorage.getItem('mattdoes-poster-axis'), 'across');

  const stored = domWith({ 'mattdoes-posters': 'off', 'mattdoes-poster-axis': 'down' });
  assert.equal(stored.window.document.documentElement.getAttribute('data-posters'), 'off');
  assert.equal(stored.window.document.documentElement.getAttribute('data-poster-axis'), 'down');
  assert.equal(stored.window.document.querySelector('[data-posters-toggle]').getAttribute('aria-pressed'), 'false');
  assert.equal(stored.window.document.querySelector('[data-posters-toggle]').getAttribute('aria-label'), 'posters off');
  assert.equal(stored.window.document.querySelector('[data-axis-toggle]').getAttribute('aria-pressed'), 'true');
  assert.equal(stored.window.document.querySelector('[data-axis-toggle]').getAttribute('aria-label'), 'layout down');

  const junk = domWith({ 'mattdoes-posters': 'maybe', 'mattdoes-poster-axis': 'up' });
  assert.equal(junk.window.document.documentElement.hasAttribute('data-posters'), false);
  assert.equal(junk.window.document.documentElement.hasAttribute('data-poster-axis'), false);
  assert.equal(junk.window.document.querySelector('[data-posters-toggle]').getAttribute('aria-pressed'), 'true');
  assert.equal(junk.window.document.querySelector('[data-axis-toggle]').getAttribute('aria-pressed'), 'false');
});

test('a stored choice is on the document before the buttons are parsed', async () => {
  const dom = new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>', {
    runScripts: 'dangerously',
    url: 'https://mattdoes.online/watching/',
  });
  dom.window.localStorage.setItem('mattdoes-posters', 'off');
  dom.window.localStorage.setItem('mattdoes-poster-axis', 'down');
  dom.window.eval(script);
  const root = dom.window.document.documentElement;
  assert.equal(root.getAttribute('data-posters'), 'off');
  assert.equal(root.getAttribute('data-poster-axis'), 'down');
  assert.equal(dom.window.document.querySelector('[data-posters-toggle]'), null);

  dom.window.document.body.innerHTML = buttons();
  await new Promise((resolve) => { setTimeout(resolve, 0); });
  assert.equal(dom.window.document.querySelector('[data-posters-toggle]').getAttribute('aria-pressed'), 'false');
  assert.equal(dom.window.document.querySelector('[data-axis-toggle]').getAttribute('aria-pressed'), 'true');

  dom.window.document.querySelector('[data-axis-toggle]').click();
  assert.equal(root.hasAttribute('data-poster-axis'), false);
  assert.equal(dom.window.localStorage.getItem('mattdoes-poster-axis'), 'across');
  assert.equal(dom.window.document.querySelector('[data-axis-toggle]').getAttribute('aria-pressed'), 'false');
});

test('the strip hides when posters are off and stacks in the page when down', () => {
  const down = css.slice(css.indexOf('html[data-poster-axis="down"] .feed'), css.indexOf('html[data-poster-axis="down"] .film'));
  assert.match(down, /display:\s*flex/);
  assert.match(down, /flex-direction:\s*column/);
  assert.match(down, /overflow:\s*visible/);
  assert.match(down, /max-height:\s*none/);
  assert.match(down, /gap:\s*var\(--space-section\)/);
  assert.doesNotMatch(down, /overflow-y:\s*auto/);
  assert.doesNotMatch(down, /max-height:\s*70vh/);
  assert.doesNotMatch(down, /scroll-snap-type:\s*y/);
  assert.doesNotMatch(down, /animation|transition|transform/);
  assert.match(css, /html\[data-poster-axis="down"\] \.film \.copy\s*\{[^}]*flex-direction:\s*column/);
  const off = css.slice(css.indexOf('html[data-posters="off"] .feed'));
  assert.match(off, /display:\s*none/);
  assert.ok(css.indexOf('html[data-posters="off"] .feed') > css.indexOf('html[data-poster-axis="down"] .feed'));

  const sheet = css.replace(/@import[^;]+;/, '');
  const dom = new JSDOM(
    `<!DOCTYPE html><html><head><style>${sheet}</style></head><body><ol class="feed" id="feed"><li class="film"></li></ol></body></html>`,
    { url: 'https://mattdoes.online/watching/' },
  );
  const feed = dom.window.document.querySelector('.feed');
  const view = dom.window.getComputedStyle(feed);
  assert.equal(view.display, 'flex');
  assert.equal(view.flexDirection, 'row');
  dom.window.document.documentElement.setAttribute('data-poster-axis', 'down');
  const stacked = dom.window.getComputedStyle(feed);
  assert.equal(stacked.display, 'flex');
  assert.equal(stacked.flexDirection, 'column');
  assert.equal(stacked.overflowY, 'visible');
  assert.equal(stacked.maxHeight, 'none');
  dom.window.document.documentElement.setAttribute('data-posters', 'off');
  assert.equal(dom.window.getComputedStyle(feed).display, 'none');
});

test('poster prefs are the storage client; station.js is not', () => {
  const station = fs.readFileSync(path.join(REPO_ROOT, 'static', 'station.js'), 'utf8');
  assert.match(script, /localStorage/);
  assert.doesNotMatch(station, /localStorage|sessionStorage/);
  assert.doesNotMatch(script, /\son\w+\s*=/);
});
