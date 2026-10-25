// The Unshared hub is preview-only. Production and local builds leave it out.
// Every registry entry has to resolve to a page the copy actually writes.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

import { copyConceptsForPreview, pagesPreviewRequested } from '../lib/preview-concepts.js';
import { unsharedEntries, unsharedHref, unsharedPrefix } from '../concepts/entries.js';
import { loadTokens, violationsInCss, violationsInSource } from '../lib/design-tokens.js';
import { renderUnshared } from '../site/render.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const previewEnv = {
  CF_PAGES: '1',
  CF_PAGES_BRANCH: 'cursor/unshared-experiments-concepts',
};

function tempDist(headers) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'concepts-preview-'));
  if (headers != null) fs.writeFileSync(path.join(dir, '_headers'), headers);
  return dir;
}

function hrefs(html, selector) {
  const doc = new JSDOM(html).window.document;
  return [...doc.querySelectorAll(selector)].map((anchor) => anchor.getAttribute('href'));
}

test('pages preview is requested only for a non-production Pages branch', () => {
  assert.equal(pagesPreviewRequested({}), false);
  assert.equal(pagesPreviewRequested({ CF_PAGES: '1' }), false);
  assert.equal(pagesPreviewRequested({
    CF_PAGES: '1',
    CF_PAGES_BRANCH: 'main',
    CF_PAGES_PRODUCTION_BRANCH: 'main',
  }), false);
  assert.equal(pagesPreviewRequested({
    CF_PAGES: '1',
    CF_PAGES_BRANCH: 'main',
  }), false);
  assert.equal(pagesPreviewRequested(previewEnv), true);
  assert.equal(pagesPreviewRequested({
    ...previewEnv,
    CF_PAGES_PRODUCTION_BRANCH: 'main',
  }), true);
});

test('copy stays out of dist unless this is a preview branch', () => {
  const dir = tempDist('/*\n  X-Frame-Options: DENY\n');
  assert.equal(copyConceptsForPreview(dir, {}), false);
  assert.equal(fs.existsSync(path.join(dir, 'unshared')), false);
  assert.equal(fs.existsSync(path.join(dir, 'concepts')), false);
  assert.equal(copyConceptsForPreview(dir, {
    CF_PAGES: '1',
    CF_PAGES_BRANCH: 'main',
    CF_PAGES_PRODUCTION_BRANCH: 'main',
  }), false);
  assert.equal(fs.existsSync(path.join(dir, 'unshared')), false);
});

test('a registry entry with no page fails the preview copy', () => {
  const dir = tempDist('/*\n  X-Frame-Options: DENY\n');
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'concepts-empty-'));
  assert.throws(
    () => copyConceptsForPreview(dir, previewEnv, empty),
    /has no page at concepts\//,
  );
  assert.equal(fs.existsSync(path.join(dir, 'unshared')), false);
});

test('every unshared entry resolves to a built page', () => {
  const dir = tempDist('/*\n  X-Frame-Options: DENY\n');
  assert.equal(copyConceptsForPreview(dir, previewEnv, REPO_ROOT), true);
  assert.equal(fs.existsSync(path.join(dir, 'concepts')), false);

  const hubPath = path.join(dir, 'unshared', 'index.html');
  const hub = fs.readFileSync(hubPath, 'utf8');
  const doc = new JSDOM(hub).window.document;
  assert.equal(doc.querySelector('h1')?.textContent, 'matt does unshared');
  assert.equal(doc.querySelector('p.lede'), null);
  assert.equal(hub.includes('Fun is unshared'), false);
  assert.equal(doc.querySelector('.verb-kicker')?.textContent, unsharedPrefix);
  assert.match(hub, /name="robots" content="noindex"/);

  const rowHrefs = hrefs(hub, 'a.verb');
  assert.ok(unsharedEntries.length > 0);
  for (const entry of unsharedEntries) {
    const href = unsharedHref(entry);
    assert.ok(rowHrefs.includes(href), href);
    const page = path.join(dir, href.slice(1), 'index.html');
    assert.equal(fs.existsSync(page), true, page);
    const built = fs.readFileSync(page, 'utf8');
    assert.match(built, /name="robots" content="noindex"/);
    assert.match(built, /matt does unshared/);
  }

  const label = doc.querySelector('.verb-label')?.textContent;
  const prefix = doc.querySelector('.verb-prefix')?.textContent;
  assert.equal(label, 'ambient');
  assert.equal(prefix, `${unsharedPrefix} `);
  assert.equal(rowHrefs[0], '/unshared/ambient/');

  const published = renderUnshared({
    siteUrl: 'https://mattdoes.online',
    assets: { 'station.css': 'station.css', 'station.js': 'station.js' },
  });
  assert.deepEqual(hrefs(hub, '.outlinks a'), hrefs(published, '.outlinks a'));
  const email = new JSDOM(hub).window.document.querySelector('.outlinks a');
  assert.equal(email?.textContent, 'email');
  assert.equal(email?.getAttribute('aria-label'), 'email unshared');

  for (const file of ['hub.css', path.join('ambient', 'ambient.css')]) {
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
  const js = fs.readFileSync(path.join(dir, 'unshared', 'ambient', 'ambient.js'), 'utf8');
  assert.match(js, /AudioContext/);
  assert.match(js, /PannerNode|createPanner/);
  assert.equal(fs.existsSync(path.join(dir, 'unshared', 'flock-model.js')), true);

  const headers = fs.readFileSync(path.join(dir, '_headers'), 'utf8');
  assert.match(headers, /\/unshared\n {2}X-Robots-Tag: noindex\n\/unshared\/\*\n {2}X-Robots-Tag: noindex\n/);
  assert.equal(copyConceptsForPreview(dir, previewEnv, REPO_ROOT), true);
  const again = fs.readFileSync(path.join(dir, '_headers'), 'utf8');
  assert.equal(again.split('/unshared/*').length, 2);

  const tokens = loadTokens();
  for (const rel of ['concepts/hub.css', 'concepts/ambient/ambient.css']) {
    const css = fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
    assert.deepEqual(violationsInCss(css, rel, tokens), []);
  }
  for (const rel of ['concepts/ambient/ambient.js', 'concepts/ambient/motion.js', 'concepts/flock-model.js', 'concepts/hub.js']) {
    const source = fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
    assert.deepEqual(violationsInSource(source, rel, tokens), []);
  }
});
