import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JSDOM } from 'jsdom';
import { buildFixtureVault, readDist } from './helpers/run-build.js';

let distDir;
test.before(() => { ({ distDir } = buildFixtureVault()); });

function doc(rel) {
  return new JSDOM(readDist(distDir, rel)).window.document;
}

function hasRail(document) {
  return document.querySelector('.side-left, .side-right, .ident') !== null;
}

test('long-form article routes are not part of the public site', () => {
  assert.equal(doc('about/index.html').querySelector('a[href^="/journal/"]'), null);
  assert.throws(() => doc('journal/hello-fixture-world/index.html'));
});

test('about keeps the authored page first and moves profiles after it', () => {
  const about = doc('about/index.html');
  const main = about.querySelector('main.about-page');
  const article = main?.querySelector('article');

  assert.ok(main?.classList.contains('page--single-column'));
  assert.equal(hasRail(about), false);
  assert.equal(about.querySelector('h1')?.textContent.trim(), 'about');
  assert.equal(about.querySelector('.post-head .lede'), null,
    'the vault summary must not duplicate the authored opening');
  assert.ok(article?.querySelector(':scope > .post-body + .about-links'),
    'contact and profile links follow the authored About content');
});

test('colophon is a one-column document with inline navigation and stats', () => {
  const colophon = doc('colophon/index.html');
  const main = colophon.querySelector('main.colophon-page');
  const document = main?.querySelector('article.colophon-document');

  assert.ok(main?.classList.contains('page--single-column'));
  assert.equal(hasRail(colophon), false);
  assert.equal(colophon.querySelector('h1')?.textContent.trim(), 'colophon');
  assert.ok(document?.querySelector('.colophon-toc a[href="#build"]'));
  assert.ok(document?.querySelector('.colophon-build-stats'));
  assert.doesNotMatch(document?.textContent || '', /stack\s+Obsidian\s+vault/i,
    'the duplicate stack inventory is removed');
});

test('search and topics show their content without explanatory rails', () => {
  const search = doc('search/index.html');
  assert.ok(search.querySelector('main.search-page.page--single-column'));
  assert.equal(hasRail(search), false);
  assert.equal(search.querySelector('h1')?.textContent.trim(), 'search');
  assert.ok(search.querySelector('input[type="search"][placeholder="Search the site"]'));
  assert.equal(search.querySelector('.post-head'), null);

  assert.throws(() => doc('topics/meta/index.html'));
});

test('search only gives usage guidance after a query outcome', () => {
  const script = fs.readFileSync(new URL('../static/search.js', import.meta.url), 'utf8');
  assert.doesNotMatch(script, /Type to search the archive\./);
  assert.match(script, /No results for/);
});
