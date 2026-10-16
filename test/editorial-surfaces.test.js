import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { buildFixtureVault, readDist } from './helpers/run-build.js';

let distDir;
test.before(() => { ({ distDir } = buildFixtureVault()); });

function doc(rel) {
  return new JSDOM(readDist(distDir, rel)).window.document;
}

test('homepage is a calm front door without a post highlight', () => {
  const d = doc('index.html');
  assert.equal(d.querySelector('.home-lead, .home-recent'), null);
  assert.equal(d.querySelector('.side-left'), null);
  assert.equal(d.querySelector('.side-right'), null);
  assert.equal(d.querySelector('[data-timeline-controls]'), null);
  assert.equal(d.querySelector('main')?.firstElementChild?.classList.contains('home-content'), true,
    'the intro and shelves should be the first thing in the main landmark');
  assert.ok(d.querySelector('.home-intro h1'));
  assert.ok(d.querySelector('.home-shelves'));
  assert.ok(d.querySelector('.home-wire'));
});

test('the homepage shelf keeps the non-post rooms', () => {
  const d = doc('index.html');
  assert.equal(d.querySelector('.home-shelves a[href="/posts/"]'), null);
  assert.equal(d.querySelector('.home-shelves a[href="/thoughts/"]'), null);
  assert.equal(d.querySelector('.home-shelves a[href="/blog/"]'), null);
  assert.ok(d.querySelector('.home-shelves a[href="/listening/"]'));
  assert.ok(d.querySelector('.home-shelves a[href="/digs/"]'));
  assert.ok(d.querySelector('.home-shelves a[href="/movies/"]'));
  assert.ok(d.querySelector('.home-shelves a[href="/grok/"]'));
});

test('journal, making, and topic paths are not written', () => {
  assert.equal(fs.existsSync(path.join(distDir, 'journal', 'index.html')), false);
  assert.equal(fs.existsSync(path.join(distDir, 'making', 'index.html')), false);
  assert.equal(fs.existsSync(path.join(distDir, 'blog', 'index.html')), false);
  assert.equal(fs.existsSync(path.join(distDir, 'topics', 'meta', 'index.html')), false);
  assert.equal(fs.existsSync(path.join(distDir, 'journal', 'hello-fixture-world', 'index.html')), false);

  const sitemap = readDist(distDir, 'sitemap.xml');
  assert.equal(sitemap.includes('/topics/'), false);
  assert.equal(sitemap.includes('/journal/'), false);
  assert.equal(sitemap.includes('/making/'), false);
  assert.equal(sitemap.includes('/blog/'), false);
});
