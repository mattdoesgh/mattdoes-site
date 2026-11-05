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
  assert.match(css, /\.poster-switch\s*\{[^}]*font-size:\s*var\(--type-setting\)/);
  const tokens = fs.readFileSync(path.join(REPO_ROOT, 'site', 'tokens.css'), 'utf8');
  assert.match(tokens, /--hit-pad:\s*calc\(var\(--hit-setting\) - var\(--type-setting\) - var\(--space-phone-row\)\)/);
  assert.match(tokens, /--hit-setting:\s*2\.75rem;/);
  assert.match(tokens, /--type-setting:\s*clamp\(0\.5625rem,\s*0\.05rem \+ 1\.95vw,\s*1\.2rem\)/);
  assert.match(tokens, /--type-body:\s*clamp\(1\.125rem,/);
  assert.match(tokens, /--space-md:\s*clamp\(0\.75rem,/);
  assert.match(css, /\.poster-switch:first-child\s*\{[^}]*padding-top:\s*var\(--hit-pad\)/);
  assert.match(css, /\.poster-switch:last-child\s*\{[^}]*margin-bottom:\s*calc\(var\(--hit-pad\) \* -1\)/);
  assert.doesNotMatch(css, /\.poster-switch::before/);
  assert.match(css, /text-size-adjust:\s*100%/);
  assert.match(css, /\.poster-controls\s*\{[^}]*gap:\s*var\(--space-phone-row\)/);
  assert.match(css, /\.poster-track\s*\{[^}]*border:\s*var\(--line-hair\)/);
  assert.match(css, /\.watch-head\s*\{[^}]*align-items:\s*flex-end/);
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
  assert.equal(axis.getAttribute('aria-pressed'), 'true');
  assert.equal(axis.getAttribute('aria-label'), 'layout down');
  assert.equal(axis.getAttribute('aria-disabled'), 'true');
  assert.equal(root.getAttribute('data-posters'), 'off');
  assert.equal(root.hasAttribute('data-poster-axis'), false);
  assert.equal(live.window.localStorage.getItem('mattdoes-posters'), 'off');
  assert.equal(live.window.localStorage.getItem('mattdoes-poster-axis'), 'across');

  axis.click();
  assert.equal(axis.getAttribute('aria-pressed'), 'true');
  assert.equal(axis.getAttribute('aria-disabled'), 'true');
  assert.equal(root.hasAttribute('data-poster-axis'), false);
  assert.equal(live.window.localStorage.getItem('mattdoes-poster-axis'), 'across');
  assert.equal(root.getAttribute('data-posters'), 'off');

  posters.click();
  assert.equal(posters.getAttribute('aria-pressed'), 'true');
  assert.equal(axis.getAttribute('aria-pressed'), 'false');
  assert.equal(axis.getAttribute('aria-label'), 'layout across');
  assert.equal(axis.hasAttribute('aria-disabled'), false);
  assert.equal(root.hasAttribute('data-posters'), false);
  assert.equal(root.hasAttribute('data-poster-axis'), false);
  assert.equal(live.window.localStorage.getItem('mattdoes-posters'), 'on');
  assert.equal(live.window.localStorage.getItem('mattdoes-poster-axis'), 'across');

  axis.click();
  assert.equal(axis.getAttribute('aria-pressed'), 'true');
  assert.equal(root.getAttribute('data-poster-axis'), 'down');
  assert.equal(live.window.localStorage.getItem('mattdoes-poster-axis'), 'down');
  posters.click();
  assert.equal(root.getAttribute('data-posters'), 'off');
  assert.equal(root.getAttribute('data-poster-axis'), 'down');
  assert.equal(live.window.localStorage.getItem('mattdoes-poster-axis'), 'down');
  axis.click();
  assert.equal(live.window.localStorage.getItem('mattdoes-poster-axis'), 'down');
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
  assert.equal(junk.window.localStorage.getItem('mattdoes-posters'), null);
  assert.equal(junk.window.localStorage.getItem('mattdoes-poster-axis'), null);
  assert.equal(junk.window.document.querySelector('.watch-head'), junk.window.document.querySelector('.poster-controls').parentElement);
  assert.equal(junk.window.document.querySelector('#feed').id, 'feed');
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
  assert.equal(root.getAttribute('data-poster-axis'), 'down');
  assert.equal(dom.window.localStorage.getItem('mattdoes-poster-axis'), 'down');
  assert.equal(dom.window.document.querySelector('[data-axis-toggle]').getAttribute('aria-disabled'), 'true');
  assert.equal(dom.window.document.querySelector('[data-axis-toggle]').getAttribute('aria-pressed'), 'true');

  dom.window.document.querySelector('[data-posters-toggle]').click();
  assert.equal(root.hasAttribute('data-posters'), false);
  assert.equal(dom.window.document.querySelector('[data-axis-toggle]').hasAttribute('aria-disabled'), false);
  dom.window.document.querySelector('[data-axis-toggle]').click();
  assert.equal(root.hasAttribute('data-poster-axis'), false);
  assert.equal(dom.window.localStorage.getItem('mattdoes-poster-axis'), 'across');
  assert.equal(dom.window.document.querySelector('[data-axis-toggle]').getAttribute('aria-pressed'), 'false');
});

test('posters off is a text list and down still stacks the posters', () => {
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
  const off = css.slice(css.indexOf('html[data-posters="off"] .feed'), css.indexOf('html.is-holding'));
  assert.match(off, /display:\s*flex/);
  assert.match(off, /flex-direction:\s*column/);
  assert.match(off, /overflow:\s*visible/);
  assert.match(off, /scroll-snap-type:\s*none/);
  assert.match(off, /font-size:\s*var\(--type-list\)/);
  assert.match(off, /display:\s*none/);
  assert.doesNotMatch(off, /watch-head|poster-controls|poster-switch/);
  assert.ok(css.indexOf('html[data-posters="off"] .feed') > css.indexOf('html[data-poster-axis="down"] .feed'));
  assert.match(css, /scroll-snap-type:\s*x proximity/);
  assert.doesNotMatch(css, /scroll-snap-type:\s*x mandatory/);
  const tokens = fs.readFileSync(path.join(REPO_ROOT, 'site', 'tokens.css'), 'utf8');
  assert.match(tokens, /--type-list:\s*clamp\(1\.15rem,\s*0\.9rem \+ 1\.1vw,\s*1\.85rem\)/);
  assert.match(tokens, /--motion:\s*240ms/);
  assert.match(tokens, /--ease:\s*cubic-bezier\(0\.2,\s*0\.7,\s*0\.2,\s*1\)/);
  assert.match(css, /html\[data-posters="off"\] \.axis-across\s*\{[^}]*opacity:\s*0\.35/);
  assert.doesNotMatch(script, /preventDefault/);

  const sheet = css.replace(/@import[^;]+;/, '');
  const dom = new JSDOM(
    `<!DOCTYPE html><html><head><style>${sheet}</style></head><body><ol class="feed" id="feed"><li class="film"><a class="film-open"><img alt=""><span class="copy"><span class="name">Heat</span><span class="meta">★★★★</span></span></a></li></ol><button type="button" data-axis-toggle><span class="poster-seg axis-across">across</span><span class="poster-seg axis-down">down</span></button></body></html>`,
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
  const listed = dom.window.getComputedStyle(feed);
  assert.equal(listed.display, 'flex');
  assert.equal(listed.flexDirection, 'column');
  assert.equal(dom.window.getComputedStyle(dom.window.document.querySelector('.film-open img')).display, 'none');
  const across = dom.window.getComputedStyle(dom.window.document.querySelector('.axis-across'));
  assert.equal(across.opacity, '0.35');
  assert.match(css, /html\[data-posters="off"\] \.axis-down[\s\S]*background:\s*var\(--ink\)/);
});

test('poster prefs are the storage client; station.js is not', () => {
  const station = fs.readFileSync(path.join(REPO_ROOT, 'static', 'station.js'), 'utf8');
  assert.match(script, /localStorage/);
  assert.doesNotMatch(station, /localStorage|sessionStorage/);
  assert.doesNotMatch(script, /\son\w+\s*=/);
});

const heat = {
  title: 'Heat',
  stars: '★★★★½',
  rewatch: true,
  link: 'https://letterboxd.com/mattdoes/film/heat/',
  poster: 'https://media.mattdoes.online/posters/heat.jpg',
  posterWidth: 300,
  posterHeight: 450,
};

function scrolledDom(storage) {
  const dom = new JSDOM(renderWatch({ ...ctx, watches: [heat], filmCount: 1 }), {
    runScripts: 'dangerously',
    url: 'https://mattdoes.online/watching/',
  });
  const win = dom.window;
  const metrics = { scrollY: 1400, innerHeight: 800, scrollHeight: 2200 };
  if (storage) {
    for (const [key, value] of Object.entries(storage)) win.localStorage.setItem(key, value);
  }
  Object.defineProperty(win, 'scrollY', { configurable: true, get: () => metrics.scrollY });
  Object.defineProperty(win, 'innerHeight', { configurable: true, get: () => metrics.innerHeight });
  Object.defineProperty(win, 'innerWidth', { configurable: true, get: () => 390 });
  const root = win.document.documentElement;
  Object.defineProperty(root, 'scrollHeight', { configurable: true, get: () => metrics.scrollHeight });
  let top = 0;
  Object.defineProperty(root, 'scrollTop', {
    configurable: true,
    get: () => top,
    set: (value) => { top = Number(value) || 0; },
  });
  win.eval(script);
  const film = win.document.querySelector('.film');
  film.getBoundingClientRect = () => {
    const down = root.getAttribute('data-poster-axis') === 'down';
    const y = down ? 420 : 80;
    return { top: y, left: 20, right: 220, bottom: y + 120, width: 200, height: 120, x: 20, y };
  };
  function stamp(event, time) {
    Object.defineProperty(event, 'timeStamp', { value: time });
    return event;
  }
  function wheel(deltaY, time, deltaMode = 0) {
    const event = stamp(new win.WheelEvent('wheel', { deltaY, deltaMode, bubbles: true, cancelable: true }), time);
    win.dispatchEvent(event);
    return event;
  }
  function touch(type, clientY) {
    const event = new win.Event(type, { bubbles: true, cancelable: true });
    if (type !== 'touchend' && type !== 'touchcancel') event.touches = [{ clientY }];
    win.dispatchEvent(event);
    return event;
  }
  return { win, metrics, root, wheel, touch, film };
}

test('posters on promotes data-src and posters off does not fetch', () => {
  const on = scrolledDom();
  const img = on.win.document.querySelector('.film-open img');
  assert.equal(img.getAttribute('data-src'), heat.poster);
  assert.equal(img.getAttribute('src'), heat.poster);
  assert.equal(on.win.document.querySelector('.flag')?.textContent, 'rewatch');
  const off = scrolledDom({ 'mattdoes-posters': 'off', 'mattdoes-poster-axis': 'across' });
  const hidden = off.win.document.querySelector('.film-open img');
  assert.equal(hidden.getAttribute('data-src'), heat.poster);
  assert.equal(hidden.hasAttribute('src'), false);
  assert.equal(off.win.document.querySelector('.name')?.textContent, 'Heat');
  assert.match(off.win.document.querySelector('.meta')?.textContent || '', /★/);
});

test('a wheel below the overscroll threshold does not switch and one above does', () => {
  const page = scrolledDom();
  const under = page.wheel(400, 5000);
  assert.equal(under.defaultPrevented, false);
  page.wheel(79, 5030);
  assert.equal(page.root.hasAttribute('data-poster-axis'), false);
  assert.equal(page.win.localStorage.getItem('mattdoes-poster-axis'), null);
  assert.equal(page.win.document.querySelector('[data-axis-toggle]').getAttribute('aria-label'), 'layout across');
  assert.ok(page.root.hasAttribute('data-pull'));
  page.wheel(1, 5060);
  assert.equal(page.root.getAttribute('data-poster-axis'), 'down');
  assert.equal(page.win.localStorage.getItem('mattdoes-poster-axis'), 'down');
  assert.equal(page.win.document.querySelector('[data-axis-toggle]').getAttribute('aria-label'), 'layout down');
  assert.equal(page.win.document.querySelector('.layout-live').textContent, 'layout down');
  assert.equal(page.root.hasAttribute('data-pull'), false);
  assert.equal(page.root.scrollTop, 340);
});

test('a slow wheel and a flick that started above the bottom do not switch', () => {
  const slow = scrolledDom();
  slow.wheel(200, 1000);
  slow.wheel(200, 1300);
  slow.wheel(200, 1600);
  slow.wheel(200, 1900);
  assert.equal(slow.root.hasAttribute('data-poster-axis'), false);
  assert.equal(slow.win.localStorage.getItem('mattdoes-poster-axis'), null);

  const flick = scrolledDom();
  flick.metrics.scrollY = 200;
  flick.wheel(500, 2000);
  flick.metrics.scrollY = 1400;
  flick.wheel(500, 2030);
  assert.equal(flick.root.hasAttribute('data-poster-axis'), false);
  flick.wheel(480, 2300);
  assert.equal(flick.root.getAttribute('data-poster-axis'), 'down');
  assert.equal(flick.win.localStorage.getItem('mattdoes-poster-axis'), 'down');
});

test('a line-mode wheel uses the same pixel threshold', () => {
  const page = scrolledDom();
  page.wheel(29, 8000, 1);
  assert.equal(page.root.hasAttribute('data-poster-axis'), false);
  page.wheel(30, 8200, 1);
  assert.equal(page.root.getAttribute('data-poster-axis'), 'down');
});

test('a touch pull below 100px does not switch and one past it does', () => {
  const under = scrolledDom();
  const start = under.touch('touchstart', 400);
  assert.equal(start.defaultPrevented, false);
  under.touch('touchmove', 310);
  under.touch('touchend');
  assert.equal(under.root.hasAttribute('data-poster-axis'), false);
  assert.equal(under.win.localStorage.getItem('mattdoes-poster-axis'), null);
  assert.equal(under.root.hasAttribute('data-pull'), false);

  const over = scrolledDom();
  over.touch('touchstart', 400);
  over.touch('touchmove', 340);
  assert.equal(over.root.hasAttribute('data-poster-axis'), false);
  over.touch('touchmove', 289);
  assert.equal(over.root.getAttribute('data-poster-axis'), 'down');
  assert.equal(over.win.localStorage.getItem('mattdoes-poster-axis'), 'down');
  assert.equal(over.win.document.querySelector('.layout-live').textContent, 'layout down');
  assert.equal(over.root.scrollTop, 340);
});

test('a touch that starts above the bottom does not switch', () => {
  const page = scrolledDom();
  page.metrics.scrollY = 200;
  page.touch('touchstart', 500);
  page.metrics.scrollY = 1400;
  page.touch('touchmove', 200);
  page.touch('touchend');
  assert.equal(page.root.hasAttribute('data-poster-axis'), false);
  assert.equal(page.win.localStorage.getItem('mattdoes-poster-axis'), null);
});

test('overscroll does nothing while posters are off, already down, or the page does not scroll', () => {
  const off = scrolledDom({ 'mattdoes-posters': 'off', 'mattdoes-poster-axis': 'across' });
  off.wheel(600, 3000);
  off.touch('touchstart', 400);
  off.touch('touchmove', 200);
  off.touch('touchend');
  assert.equal(off.root.hasAttribute('data-poster-axis'), false);
  assert.equal(off.win.localStorage.getItem('mattdoes-poster-axis'), 'across');
  assert.equal(off.root.hasAttribute('data-pull'), false);

  const down = scrolledDom({ 'mattdoes-poster-axis': 'down' });
  down.wheel(600, 4000);
  assert.equal(down.root.getAttribute('data-poster-axis'), 'down');
  assert.equal(down.win.document.querySelector('.layout-live').textContent, '');

  const short = scrolledDom();
  short.metrics.scrollHeight = 800;
  short.metrics.scrollY = 0;
  short.wheel(600, 5000);
  short.touch('touchstart', 400);
  short.touch('touchmove', 200);
  assert.equal(short.root.hasAttribute('data-poster-axis'), false);
});

test('reduced motion hides the pull hint and still switches on a hard wheel', () => {
  const page = scrolledDom();
  page.win.matchMedia = () => ({ matches: true, media: '(prefers-reduced-motion: reduce)' });
  page.wheel(200, 9000);
  assert.equal(page.root.hasAttribute('data-pull'), false);
  assert.equal(page.root.hasAttribute('data-poster-axis'), false);
  page.wheel(280, 9040);
  assert.equal(page.root.getAttribute('data-poster-axis'), 'down');
  assert.equal(page.root.hasAttribute('data-pull'), false);
});
