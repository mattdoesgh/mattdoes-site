// /unshared/ and its entries are published with the rest of the site.
// The hub has no socials. Every entry resolves to a built page.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

import { publishUnshared } from '../lib/publish-unshared.js';
import { unsharedEntries, unsharedHref, unsharedPrefix } from '../concepts/entries.js';
import { sitemapPaths, unsharedEnabled } from '../site/verbs.ts';
import { loadTokens, violationsInCss, violationsInSource } from '../lib/design-tokens.js';
import { renderUnshared } from '../site/render.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function tempDist(headers) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'unshared-publish-'));
  if (headers != null) fs.writeFileSync(path.join(dir, '_headers'), headers);
  return dir;
}

function hrefs(html, selector) {
  const doc = new JSDOM(html).window.document;
  return [...doc.querySelectorAll(selector)].map((anchor) => anchor.getAttribute('href'));
}

test('a registry entry with no page fails the publish copy', () => {
  const dir = tempDist('/*\n  X-Frame-Options: DENY\n');
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'unshared-empty-'));
  assert.throws(
    () => publishUnshared(dir, empty),
    /has no page at concepts\//,
  );
  assert.equal(fs.existsSync(path.join(dir, 'unshared')), false);
});

test('every unshared entry resolves to a built page', () => {
  const dir = tempDist('/*\n  X-Frame-Options: DENY\n');
  const before = fs.readFileSync(path.join(dir, '_headers'), 'utf8');
  assert.equal(publishUnshared(dir, REPO_ROOT, 'https://mattdoes.online'), true);
  assert.equal(fs.existsSync(path.join(dir, 'concepts')), false);
  assert.equal(fs.readFileSync(path.join(dir, '_headers'), 'utf8'), before);
  assert.equal(unsharedEnabled, true);

  const paths = sitemapPaths();
  assert.ok(paths.includes('/unshared/'));
  assert.deepEqual(
    paths.filter((route) => route.startsWith('/unshared/') && route !== '/unshared/'),
    unsharedEntries.map((entry) => unsharedHref(entry)),
  );

  const hubPath = path.join(dir, 'unshared', 'index.html');
  const hub = fs.readFileSync(hubPath, 'utf8');
  const doc = new JSDOM(hub).window.document;
  assert.equal(doc.querySelector('title')?.textContent, 'matt does unshared');
  assert.equal(doc.querySelector('h1')?.textContent, 'matt does unshared');
  assert.equal(doc.querySelector('h1 a')?.getAttribute('href'), '/');
  assert.equal(doc.querySelector('p.lede'), null);
  assert.equal(doc.querySelector('.outlinks'), null);
  assert.equal(doc.querySelector('footer'), null);
  assert.equal(hub.includes('Fun is unshared'), false);
  assert.equal(hub.includes('mailto:'), false);
  assert.doesNotMatch(hub, /music\.apple\.com|spotify\.com|bandcamp\.com|noindex/i);
  assert.equal(doc.querySelector('meta[name="description"]')?.getAttribute('content'), 'matt does unshared.');
  assert.equal(doc.querySelector('link[rel="canonical"]')?.getAttribute('href'), 'https://mattdoes.online/unshared/');
  assert.equal(doc.querySelector('.verb-kicker')?.textContent, unsharedPrefix);

  const rowHrefs = hrefs(hub, 'a.verb');
  assert.ok(unsharedEntries.length > 0);
  for (const entry of unsharedEntries) {
    const href = unsharedHref(entry);
    assert.ok(rowHrefs.includes(href), href);
    const page = path.join(dir, href.slice(1), 'index.html');
    assert.equal(fs.existsSync(page), true, page);
    const built = fs.readFileSync(page, 'utf8');
    const builtDoc = new JSDOM(built).window.document;
    assert.doesNotMatch(built, /noindex|mailto:|music\.apple\.com|spotify\.com|bandcamp\.com/i);
    assert.equal(builtDoc.querySelector('h1')?.textContent, 'birds1');
    assert.equal(builtDoc.querySelector('title')?.textContent, 'birds1 · mattdoes.online');
    assert.equal(builtDoc.querySelector('meta[property="og:title"]')?.getAttribute('content'), 'birds1 · mattdoes.online');
    assert.equal(builtDoc.querySelector('meta[name="description"]')?.getAttribute('content'), 'birds1');
    assert.equal(builtDoc.querySelector('link[rel="canonical"]')?.getAttribute('href'), 'https://mattdoes.online/unshared/birds1/');
    assert.equal(builtDoc.querySelector('h1 a')?.getAttribute('href'), '/unshared/');
    assert.match(built, /src="\.\/birds1\.js"/);
  }

  const label = doc.querySelector('.verb-label')?.textContent;
  const prefix = doc.querySelector('.verb-prefix')?.textContent;
  assert.equal(label, 'birds1');
  assert.equal(prefix, `${unsharedPrefix} `);
  assert.equal(rowHrefs[0], '/unshared/birds1/');
  assert.equal(renderUnshared({ siteUrl: 'https://mattdoes.online' }), hub);

  for (const file of ['hub.css', path.join('birds1', 'birds1.css')]) {
    const css = fs.readFileSync(path.join(dir, 'unshared', file), 'utf8');
    assert.match(css, /@import "\/unshared\/tokens\.css";/);
    assert.match(css, /url\("\/fonts\/Anton-latin\.woff2"\)/);
    assert.equal(css.includes('../site/'), false, file);
    assert.equal(css.includes('../static/'), false, file);
  }
  assert.equal(
    fs.readFileSync(path.join(dir, 'unshared', 'tokens.css'), 'utf8'),
    fs.readFileSync(path.join(REPO_ROOT, 'site', 'tokens.css'), 'utf8'),
  );
  const js = fs.readFileSync(path.join(dir, 'unshared', 'birds1', 'birds1.js'), 'utf8');
  assert.match(js, /AudioContext/);
  assert.match(js, /PannerNode|createPanner/);
  assert.equal(js.includes('TEST_IGNORE_REDUCED_MOTION_ON_TOUCH'), false);
  assert.equal(js.includes('motion.js'), false);
  assert.equal(fs.existsSync(path.join(dir, 'unshared', 'flock-model.js')), true);
  assert.equal(fs.existsSync(path.join(REPO_ROOT, 'concepts', 'ambient')), false);
  assert.equal(fs.existsSync(path.join(REPO_ROOT, 'concepts', 'birds1', 'motion.js')), false);

  const tokens = loadTokens();
  for (const rel of ['concepts/hub.css', 'concepts/birds1/birds1.css']) {
    const css = fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
    assert.deepEqual(violationsInCss(css, rel, tokens), []);
  }
  for (const rel of ['concepts/birds1/birds1.js', 'concepts/flock-model.js', 'concepts/hub.js']) {
    const source = fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
    assert.deepEqual(violationsInSource(source, rel, tokens), []);
  }
});
