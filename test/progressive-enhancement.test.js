// Audit backlog: "Progressive enhancement — Script-disabled blog/archive
// navigation checks". Covers audit finding #12.
//
// With JavaScript disabled, /journal/, /making/, and /thoughts/ must be REAL
// generated pages whose content is the section's entries — not redirects
// into /blog/?kind=… (which only filters client-side). This test asserts the
// files exist in dist/, carry the section's entries server-rendered, and
// that static/_redirects no longer 301s those three routes.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { buildFixtureVault, DIST_DIR, readDist, REPO_ROOT } from './helpers/run-build.js';

test.before(() => { buildFixtureVault(); });

const ARCHIVE_ROUTES = ['journal', 'making', 'thoughts'];

test('each archive route is a real generated index.html, not a redirect', () => {
  for (const route of ARCHIVE_ROUTES) {
    const file = path.join(DIST_DIR, route, 'index.html');
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
  const html = readDist('journal/index.html');
  const doc = new JSDOM(html).window.document;
  const rows = doc.querySelectorAll('.timeline .row');
  assert.ok(rows.length >= 2,
    `journal archive should server-render its entries (found ${rows.length} rows)`);
  assert.ok(html.includes('Hello, fixture world'),
    'journal archive must contain the journal post title');
  assert.ok(html.includes('Reader features fixture'),
    'journal archive must contain the second journal post');
});

test('the thoughts archive lists thought entries without JavaScript', () => {
  // The fixture daily note splits into two thoughts.
  const html = readDist('thoughts/index.html');
  const doc = new JSDOM(html).window.document;
  const rows = doc.querySelectorAll('.timeline .row[data-kind="thought"]');
  assert.ok(rows.length >= 2,
    `thoughts archive should server-render its entries (found ${rows.length} rows)`);
  // Stable thought IDs are server-rendered as fragment anchors.
  assert.ok(/id="t-\d{8}-\d{4}"/.test(html),
    'thoughts archive must server-render stable thought-id anchors');
});

test('the making archive is a real page even when empty', () => {
  // The fixture vault has no `making` posts — the page must still render an
  // empty-state, not 404 or redirect.
  const html = readDist('making/index.html');
  const doc = new JSDOM(html).window.document;
  assert.ok(doc.querySelector('main#main'),
    'an empty making archive must still be a real page');
});

test('the archive routes are NOT in the per-page sitemap as anything else', () => {
  // sitemap.xml should list the three archive routes (they are real pages).
  const sitemap = readDist('sitemap.xml');
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
  const html = readDist('blog/index.html');
  const doc = new JSDOM(html).window.document;
  assert.ok(doc.querySelector('main#main'), '/blog/ must still be a real page');
});
