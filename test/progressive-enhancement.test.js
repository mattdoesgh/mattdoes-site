// journal, making, and blog are not published and are not redirected.
// /listening/ is a real page without JavaScript.
// A redirect source must not be a real page. An empty or missing _redirects file passes.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { buildFixtureVault, readDist, REPO_ROOT } from './helpers/run-build.js';

let distDir;
test.before(() => { ({ distDir } = buildFixtureVault()); });

const RETIRED_ROUTES = ['journal', 'making', 'blog'];

const REAL_PAGES = ['/', '/watching/', '/listening/'];

function rules() {
  const file = path.join(REPO_ROOT, 'static', '_redirects');
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));
}

function redirectSourceKey(src) {
  if (!src.startsWith('/')) return null;
  const bare = src.replace(/\/\*$/, '').replace(/\/$/, '');
  return bare === '' ? '/' : `${bare}/`;
}

test('listening is a real page without JavaScript', () => {
  const html = readDist(distDir, 'listening/index.html');
  assert.ok(!/http-equiv=["']?refresh/i.test(html));
  const doc = new JSDOM(html).window.document;
  assert.ok(doc.querySelector('main#main'));
  assert.equal(doc.querySelector('iframe'), null);
});

test('the home verb list does not link to unshared', () => {
  const home = new JSDOM(readDist(distDir, 'index.html')).window.document;
  assert.equal(home.querySelector('a.verb[href="/unshared/"]'), null);
  assert.equal(home.querySelector('.home-suno-sign a')?.getAttribute('href'), '/unshared/');
  assert.equal(home.querySelector('a[href="/unshared/birds1/"]'), null);
  assert.equal(home.querySelector('details.redaction'), null);
  assert.equal(fs.existsSync(path.join(distDir, 'unshared', 'index.html')), true);
  assert.equal(fs.existsSync(path.join(distDir, 'unshared', 'birds1', 'index.html')), true);
});

test('journal, making, and blog are not generated', () => {
  for (const route of RETIRED_ROUTES) {
    assert.equal(fs.existsSync(path.join(distDir, route, 'index.html')), false);
  }
});

test('/posts/ and /thoughts/ are not pages and are not redirected', () => {
  assert.equal(fs.existsSync(path.join(distDir, 'posts', 'index.html')), false);
  assert.equal(fs.existsSync(path.join(distDir, 'thoughts', 'index.html')), false);
  for (const rule of rules()) {
    const from = rule.split(/\s+/)[0];
    assert.ok(from !== '/posts' && from !== '/posts/' && from !== '/thoughts' && from !== '/thoughts/', rule);
  }
  const sitemap = readDist(distDir, 'sitemap.xml');
  assert.equal(sitemap.includes('/posts/'), false);
  assert.equal(sitemap.includes('/thoughts/'), false);
  assert.ok(sitemap.includes('/listening/</loc>'));
  assert.ok(sitemap.includes('/watching/</loc>'));
});

test('static/_redirects does not revive retired writing routes', () => {
  for (const route of [...RETIRED_ROUTES, 'posts', 'thoughts']) {
    for (const rule of rules()) {
      const from = rule.split(/\s+/)[0];
      assert.ok(from !== `/${route}` && from !== `/${route}/`, rule);
    }
  }
});

test('no redirect source is a real page', () => {
  const real = new Set(REAL_PAGES);
  for (const rule of rules()) {
    const key = redirectSourceKey(rule.split(/\s+/)[0]);
    if (!key) continue;
    assert.equal(real.has(key), false, `${rule} would redirect a real page`);
  }
});

test('station.js defers network until prerender activation', () => {
  const src = fs.readFileSync(path.join(REPO_ROOT, 'static', 'station.js'), 'utf8');
  assert.match(src, /document\.prerendering/);
  assert.match(src, /prerenderingchange/);
  assert.doesNotMatch(src, /luciadoes|mail\.grokbot/);
});
