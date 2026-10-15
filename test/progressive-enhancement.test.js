// Audit backlog: "Progressive enhancement — Script-disabled blog/archive
// navigation checks". Covers audit finding #12.
//
// With JavaScript disabled, /journal/ and /making/ must be REAL generated
// pages whose content is the section's entries — not redirects into
// /blog/?kind=… (which only filters client-side). /thoughts/ is no longer
// a section; it redirects to /posts/.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { buildFixtureVault, readDist, REPO_ROOT } from './helpers/run-build.js';

let distDir;
test.before(() => { ({ distDir } = buildFixtureVault()); });

const ARCHIVE_ROUTES = ['journal', 'making'];

test('each archive route is a real generated index.html, not a redirect', () => {
  for (const route of ARCHIVE_ROUTES) {
    const file = path.join(distDir, route, 'index.html');
    assert.ok(fs.existsSync(file),
      `/${route}/ must be a real generated page (dist/${route}/index.html)`);

    const html = fs.readFileSync(file, 'utf8');
    // A redirect stub would be tiny / contain a meta-refresh. Assert this is
    // a full document with a real <main>.
    assert.ok(!/http-equiv=["']?refresh/i.test(html),
      `/${route}/ must not be a meta-refresh redirect`);
    const doc = new JSDOM(html).window.document;
    assert.ok(doc.querySelector('main#main'),
      `/${route}/ must render a real <main id="main">`);
  }
});

test('the journal archive lists journal entries without JavaScript', () => {
  // The fixture vault has two journal posts: "Hello, fixture world" and
  // "Reader features fixture".
  const html = readDist(distDir, 'journal/index.html');
  const doc = new JSDOM(html).window.document;
  const rows = doc.querySelectorAll('.timeline .row');
  assert.ok(rows.length >= 2,
    `journal archive should server-render its entries (found ${rows.length} rows)`);
  assert.ok(html.includes('Hello, fixture world'),
    'journal archive must contain the journal post title');
  assert.ok(html.includes('Reader features fixture'),
    'journal archive must contain the second journal post');
});

test('/posts/ is a real page and /thoughts/ redirects there', () => {
  const html = readDist(distDir, 'posts/index.html');
  const doc = new JSDOM(html).window.document;
  assert.equal(doc.querySelector('h1')?.textContent.trim(), 'posts');
  assert.equal(doc.querySelector('.notebook'), null);
  assert.equal(fs.existsSync(path.join(distDir, 'thoughts', 'index.html')), false,
    '/thoughts/ must not be a generated page, or the Pages redirect will not run');

  const redirects = fs.readFileSync(path.join(REPO_ROOT, 'static', '_redirects'), 'utf8');
  const rules = redirects.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
  assert.ok(rules.some(rule => rule.startsWith('/thoughts/') && rule.includes('/posts/') && rule.includes('301')));
  assert.ok(rules.some(rule => rule.startsWith('/thoughts ') && rule.includes('/posts/') && rule.includes('301')));
});

test('the making archive is a real page even when empty', () => {
  // The fixture vault has no `making` posts — the page must still render an
  // empty-state, not 404 or redirect.
  const html = readDist(distDir, 'making/index.html');
  const doc = new JSDOM(html).window.document;
  assert.ok(doc.querySelector('main#main'),
    'an empty making archive must still be a real page');
});

test('the archive routes are NOT in the per-page sitemap as anything else', () => {
  // sitemap.xml should list the three archive routes (they are real pages).
  const sitemap = readDist(distDir, 'sitemap.xml');
  for (const route of ARCHIVE_ROUTES) {
    assert.ok(sitemap.includes(`/${route}/</loc>`),
      `/${route}/ should appear in sitemap.xml as a real route`);
  }
});

test('static/_redirects no longer 301s the archive routes', () => {
  const redirects = fs.readFileSync(
    path.join(REPO_ROOT, 'static', '_redirects'), 'utf8');

  // Drop comment lines, then scan redirect rules.
  const rules = redirects.split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('#'));

  for (const route of ARCHIVE_ROUTES) {
    for (const rule of rules) {
      // A rule whose FROM path is exactly /journal (etc.) would be a regression.
      const from = rule.split(/\s+/)[0];
      assert.ok(from !== `/${route}` && from !== `/${route}/`,
        `static/_redirects must not redirect /${route}/ (found rule: "${rule}")`);
    }
  }
});

test('the unified /blog/ view still exists alongside the archives', () => {
  // /blog/ remains the chip-filterable combined timeline.
  const html = readDist(distDir, 'blog/index.html');
  const doc = new JSDOM(html).window.document;
  assert.ok(doc.querySelector('main#main'), '/blog/ must still be a real page');
});

// ── shared poller lifecycle (static/poller.js) ─────────────────────────────
// The polling machine now-playing.js and listening-live.js share: visible-tab
// interval, bfcache resume, prerender deferral (ADR 0007). Tested once here
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
