// The verb registry is the source of truth for nav, routes, and the sitemap.
// An unknown source or a missing renderer fails the build. /frequency/ is
// the only page outside the registry, and it stays out of the menu and sitemap.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { buildFixtureVault, listDistHtml, readDist, REPO_ROOT } from './helpers/run-build.js';
import { verbs, sitemapPaths, SECRET_PATHS, assertRegistry, validateVerbs } from '../site/verbs.ts';

let distDir;
test.before(() => { ({ distDir } = buildFixtureVault()); });

test('the registry names watch, listen, and unshared once each', () => {
  const slugs = verbs.map((verb) => verb.slug);
  assert.deepEqual(slugs, ['watch', 'listen', 'unshared']);
  assert.equal(new Set(slugs).size, slugs.length);
  for (const verb of verbs) {
    assert.ok(['letterboxd', 'listening', 'static'].includes(verb.source), verb.slug);
    assert.ok(['watch', 'listen', 'unshared'].includes(verb.renderer), verb.slug);
  }
});

test('an unknown source, a duplicate, or a missing renderer fails', () => {
  assert.doesNotThrow(() => assertRegistry(['watch', 'listen', 'unshared']));
  assert.throws(() => assertRegistry(['watch', 'listen']), /missing renderer "unshared"/);
  assert.throws(() => validateVerbs([
    { slug: 'watch', label: 'watch', number: '01', source: 'nope', renderer: 'watch' },
    { slug: 'listen', label: 'listen', number: '02', source: 'listening', renderer: 'listen' },
    { slug: 'unshared', label: 'unshared', number: '03', source: 'static', renderer: 'unshared' },
  ], ['watch', 'listen', 'unshared']), /unknown data source "nope"/);
  assert.throws(() => validateVerbs([
    { slug: 'watch', label: 'watch', number: '01', source: 'letterboxd', renderer: 'watch' },
    { slug: 'watch', label: 'watch', number: '01', source: 'letterboxd', renderer: 'watch' },
    { slug: 'listen', label: 'listen', number: '02', source: 'listening', renderer: 'listen' },
    { slug: 'unshared', label: 'unshared', number: '03', source: 'static', renderer: 'unshared' },
  ], ['watch', 'listen', 'unshared']), /duplicate slug "watch"/);
  assert.throws(() => validateVerbs([
    { slug: 'listen', label: 'listen', number: '02', source: 'listening', renderer: 'listen' },
    { slug: 'unshared', label: 'unshared', number: '03', source: 'static', renderer: 'unshared' },
  ], ['listen', 'unshared']), /missing verb "watch"/);
});

test('emit fails the build through assertRegistry', () => {
  const src = fs.readFileSync(path.join(REPO_ROOT, 'lib', 'emit', 'index.js'), 'utf8');
  assert.match(src, /assertRegistry\(/);
});

test('every verb builds a page, a menu link, and a sitemap entry', () => {
  const home = new JSDOM(readDist(distDir, 'index.html')).window.document;
  const menu = home.querySelector('nav[aria-label="verbs"]');
  const sitemap = readDist(distDir, 'sitemap.xml');
  for (const verb of verbs) {
    assert.equal(fs.existsSync(path.join(distDir, verb.slug, 'index.html')), true, verb.slug);
    assert.ok(menu.querySelector(`a[href="/${verb.slug}/"]`), `${verb.slug} missing from the menu`);
    assert.ok(sitemap.includes(`<loc>https://mattdoes.online/${verb.slug}/</loc>`), verb.slug);
  }
  for (const route of sitemapPaths()) {
    assert.ok(sitemap.includes(`<loc>https://mattdoes.online${route}</loc>`), route);
  }
});

test('nothing public is built outside the registry except / and /404', () => {
  const allowed = new Set([
    'index.html',
    '404.html',
    ...verbs.map((verb) => `${verb.slug}/index.html`),
    ...SECRET_PATHS.map((route) => `${route.replace(/^\//, '').replace(/\/$/, '')}/index.html`),
  ]);
  const html = listDistHtml(distDir).map((file) => path.relative(distDir, file).split(path.sep).join('/'));
  assert.deepEqual(html.filter((file) => !allowed.has(file)), []);
  const sitemap = readDist(distDir, 'sitemap.xml');
  assert.equal(sitemap.includes('/frequency/'), false);
  assert.equal(sitemap.includes('/movies/'), false);
  assert.equal(sitemap.includes('/listening/'), false);
  assert.equal(sitemap.includes('/digs/'), false);
  const frequency = readDist(distDir, 'frequency/index.html');
  assert.match(frequency, /name="robots" content="noindex"/);
  const home = readDist(distDir, 'index.html');
  assert.doesNotMatch(home, /frequency|lucia|luciadoes/i);
});
