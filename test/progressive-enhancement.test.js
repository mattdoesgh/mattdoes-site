// /journal/, /making/, and /blog/ are not public pages.
// /thoughts/ and /posts/ are not sections and are not redirected.
// /listening/ remains a real page without JavaScript.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { buildFixtureVault, readDist, REPO_ROOT } from './helpers/run-build.js';

let distDir;
test.before(() => { ({ distDir } = buildFixtureVault()); });

const RETIRED_ROUTES = ['journal', 'making', 'blog'];

test('listening is a real page without JavaScript', () => {
  const html = readDist(distDir, 'listening/index.html');
  assert.ok(!/http-equiv=["']?refresh/i.test(html));
  const doc = new JSDOM(html).window.document;
  assert.ok(doc.querySelector('main#main'));
});

test('journal, making, and blog are not generated', () => {
  for (const route of RETIRED_ROUTES) {
    assert.equal(fs.existsSync(path.join(distDir, route, 'index.html')), false,
      `/${route}/ must not be written`);
  }
  const home = readDist(distDir, 'index.html');
  assert.equal(home.includes('Hello, fixture world'), false);
  assert.equal(home.includes('Reader features fixture'), false);
});

test('/posts/ and /thoughts/ are not pages and are not redirected', () => {
  assert.equal(fs.existsSync(path.join(distDir, 'posts', 'index.html')), false);
  assert.equal(fs.existsSync(path.join(distDir, 'thoughts', 'index.html')), false);

  const redirects = fs.readFileSync(path.join(REPO_ROOT, 'static', '_redirects'), 'utf8');
  const rules = redirects.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
  for (const rule of rules) {
    const from = rule.split(/\s+/)[0];
    assert.ok(from !== '/posts' && from !== '/posts/' && from !== '/thoughts' && from !== '/thoughts/',
      `static/_redirects must not keep a posts or thoughts section (found "${rule}")`);
  }
  const sitemap = readDist(distDir, 'sitemap.xml');
  assert.equal(sitemap.includes('/posts/'), false);
  assert.equal(sitemap.includes('/thoughts/'), false);
});

test('retired writing routes are absent from the sitemap', () => {
  const sitemap = readDist(distDir, 'sitemap.xml');
  for (const route of RETIRED_ROUTES) {
    assert.equal(sitemap.includes(`/${route}/</loc>`), false,
      `/${route}/ must not appear in sitemap.xml`);
  }
  assert.ok(sitemap.includes('/listening/</loc>'));
});

test('static/_redirects does not revive retired writing routes', () => {
  const redirects = fs.readFileSync(
    path.join(REPO_ROOT, 'static', '_redirects'), 'utf8');

  // Drop comment lines, then scan redirect rules.
  const rules = redirects.split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('#'));

  for (const route of [...RETIRED_ROUTES, 'posts', 'thoughts']) {
    for (const rule of rules) {
      // A rule whose FROM path is exactly /journal (etc.) would be a regression.
      const from = rule.split(/\s+/)[0];
      assert.ok(from !== `/${route}` && from !== `/${route}/`,
        `static/_redirects must not redirect /${route}/ (found rule: "${rule}")`);
    }
  }
});

// ── shared poller lifecycle (static/poller.js) ─────────────────────────────
// The polling machine now-playing.js and listening-live.js share: visible-tab
// interval, bfcache resume, prerender deferral. Tested once here
// against a JSDOM window with mocked timers instead of implicitly twice.

import { createPoller } from '../static/poller.js';

const POLL_MS = 1000;

/** Stand up a JSDOM document/window as the poller's globals for one test. */
function pollerDom(t, { prerendering = false } = {}) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>');
  const doc = dom.window.document;
  let visibility = 'visible';
  Object.defineProperty(doc, 'visibilityState',
    { get: () => visibility, configurable: true });
  if (prerendering) doc.prerendering = true;
  globalThis.document = doc;
  globalThis.window = dom.window;
  t.after(() => { delete globalThis.document; delete globalThis.window; });
  return {
    setVisibility(state) {
      visibility = state;
      doc.dispatchEvent(new dom.window.Event('visibilitychange'));
    },
    pageshow(persisted) {
      const e = new dom.window.Event('pageshow');
      Object.defineProperty(e, 'persisted', { value: persisted });
      dom.window.dispatchEvent(e);
    },
    activatePrerender() {
      doc.prerendering = false;
      doc.dispatchEvent(new dom.window.Event('prerenderingchange'));
    },
  };
}

test('poller ticks immediately, then on each interval while visible', (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  pollerDom(t);
  const tick = t.mock.fn();
  createPoller({ tick, intervalMs: POLL_MS });

  assert.equal(tick.mock.callCount(), 1, 'must tick once on startup');
  t.mock.timers.tick(POLL_MS * 3);
  assert.equal(tick.mock.callCount(), 4, 'must tick once per interval');
});

test('poller stops while hidden and catches up on regaining visibility', (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const dom = pollerDom(t);
  const tick = t.mock.fn();
  createPoller({ tick, intervalMs: POLL_MS });

  dom.setVisibility('hidden');
  t.mock.timers.tick(POLL_MS * 5);
  assert.equal(tick.mock.callCount(), 1, 'a hidden tab must not poll');

  dom.setVisibility('visible');
  assert.equal(tick.mock.callCount(), 2, 'regaining visibility must tick once immediately');
  t.mock.timers.tick(POLL_MS);
  assert.equal(tick.mock.callCount(), 3, 'the interval must resume after visibility returns');
});

test('bfcache restore re-ticks without doubling the interval', (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const dom = pollerDom(t);
  const tick = t.mock.fn();
  createPoller({ tick, intervalMs: POLL_MS });

  // Initial-load pageshow (persisted=false) must NOT double-fire the startup tick.
  dom.pageshow(false);
  assert.equal(tick.mock.callCount(), 1, 'a non-persisted pageshow must not re-tick');

  // A genuine bfcache restore ticks once; startPolling is idempotent, so the
  // already-running interval must not stack a second one.
  dom.pageshow(true);
  assert.equal(tick.mock.callCount(), 2, 'a bfcache restore must tick immediately');
  t.mock.timers.tick(POLL_MS);
  assert.equal(tick.mock.callCount(), 3, 'the interval must not double after a restore');
});

test('a prerendered document defers polling until activation', (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const dom = pollerDom(t, { prerendering: true });
  const tick = t.mock.fn();
  createPoller({ tick, intervalMs: POLL_MS });

  t.mock.timers.tick(POLL_MS * 3);
  assert.equal(tick.mock.callCount(), 0, 'no network work while prerendering');

  dom.activatePrerender();
  assert.equal(tick.mock.callCount(), 1, 'activation must run the deferred startup tick');
  t.mock.timers.tick(POLL_MS);
  assert.equal(tick.mock.callCount(), 2, 'polling must run normally after activation');
});
