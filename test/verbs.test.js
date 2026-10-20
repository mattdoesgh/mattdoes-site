// The verb registry is the source of truth for nav, routes, and the sitemap.
// An unknown source or a missing renderer fails the build. /frequency/ is
// the only page outside the registry, and it stays out of the menu and sitemap.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { buildFixtureVault, listDistHtml, readDist, REPO_ROOT } from './helpers/run-build.js';
import { verbs, sitemapPaths, SECRET_PATHS, assertRegistry, validateVerbs, verbHeading } from '../site/verbs.ts';

let distDir;
test.before(() => { ({ distDir } = buildFixtureVault()); });

test('the registry names watching, listening, and unshared once each', () => {
  const slugs = verbs.map((verb) => verb.slug);
  assert.deepEqual(slugs, ['watching', 'listening', 'unshared']);
  assert.equal(new Set(slugs).size, slugs.length);
  assert.equal(verbs.find((verb) => verb.slug === 'watching').label, 'letterboxd');
  assert.equal(verbs.find((verb) => verb.slug === 'listening').label, 'last.fm');
  for (const verb of verbs) {
    assert.ok(['letterboxd', 'listening', 'static'].includes(verb.source), verb.slug);
    assert.ok(['watch', 'listen', 'unshared'].includes(verb.renderer), verb.slug);
    assert.match(verbHeading(verb.label), /^matt does [a-z.]+$/);
  }
});

test('an unknown source, a duplicate, or a missing renderer fails', () => {
  assert.doesNotThrow(() => assertRegistry(['watch', 'listen', 'unshared']));
  assert.throws(() => assertRegistry(['watch', 'listen']), /missing renderer "unshared"/);
  assert.throws(() => validateVerbs([
    { slug: 'watching', label: 'letterboxd', source: 'nope', renderer: 'watch' },
    { slug: 'listening', label: 'last.fm', source: 'listening', renderer: 'listen' },
    { slug: 'unshared', label: 'unshared', source: 'static', renderer: 'unshared' },
  ], ['watch', 'listen', 'unshared']), /unknown data source "nope"/);
  assert.throws(() => validateVerbs([
    { slug: 'watching', label: 'letterboxd', source: 'letterboxd', renderer: 'watch' },
    { slug: 'watching', label: 'letterboxd', source: 'letterboxd', renderer: 'watch' },
    { slug: 'listening', label: 'last.fm', source: 'listening', renderer: 'listen' },
    { slug: 'unshared', label: 'unshared', source: 'static', renderer: 'unshared' },
  ], ['watch', 'listen', 'unshared']), /duplicate slug "watching"/);
  assert.throws(() => validateVerbs([
    { slug: 'listening', label: 'last.fm', source: 'listening', renderer: 'listen' },
    { slug: 'unshared', label: 'unshared', source: 'static', renderer: 'unshared' },
  ], ['listen', 'unshared']), /missing verb "watching"/);
});

test('every nav label and page h1 is matt does plus the label', () => {
  const home = new JSDOM(readDist(distDir, 'index.html')).window.document;
  for (const verb of verbs) {
    const heading = verbHeading(verb.label);
    assert.match(heading, /^matt does [a-z.]+$/);
    const homeLink = [...home.querySelectorAll('a.verb')].find((anchor) => anchor.getAttribute('href') === `/${verb.slug}/`);
    assert.equal(homeLink?.textContent, heading, verb.slug);
    const page = new JSDOM(readDist(distDir, `${verb.slug}/index.html`)).window.document;
    assert.equal(page.querySelector('h1')?.textContent, heading, verb.slug);
    const nav = [...page.querySelectorAll('nav.verb-nav a')].find((anchor) => anchor.getAttribute('href') === `/${verb.slug}/`);
    assert.equal(nav?.textContent, heading, verb.slug);
  }
  const watching = new JSDOM(readDist(distDir, 'watching/index.html')).window.document;
  const listening = new JSDOM(readDist(distDir, 'listening/index.html')).window.document;
  assert.equal(watching.querySelector('h1')?.textContent, 'matt does letterboxd');
  assert.equal(listening.querySelector('h1')?.textContent, 'matt does last.fm');
  assert.equal(watching.querySelector('.credit'), null);
  assert.equal(listening.querySelector('.credit'), null);
  assert.equal(watching.querySelector('a[href="https://letterboxd.com/mattdoes/"]'), null);
  assert.equal(listening.querySelector('a[href="https://www.last.fm/user/djverism"]'), null);
  assert.doesNotMatch(watching.body.textContent, /Letterboxd/);
  assert.doesNotMatch(listening.body.textContent, /Last\.fm/);
});

test('home links keep matt does in a separate prefix', () => {
  const home = new JSDOM(readDist(distDir, 'index.html')).window.document;
  for (const verb of verbs) {
    const link = [...home.querySelectorAll('a.verb')].find((anchor) => anchor.getAttribute('href') === `/${verb.slug}/`);
    const prefix = link?.querySelector('.verb-prefix');
    const label = link?.querySelector('.verb-label');
    assert.ok(prefix, verb.slug);
    assert.equal(prefix.textContent, 'matt does ');
    assert.equal(label?.textContent, verb.label);
    assert.equal(prefix.getAttribute('aria-hidden'), null);
    assert.equal(link.textContent, verbHeading(verb.label));
  }
});

test('the home kicker says matt does once and stays out of the accessible name', () => {
  const home = new JSDOM(readDist(distDir, 'index.html')).window.document;
  const kickers = [...home.querySelectorAll('.verb-kicker')];
  assert.equal(kickers.length, 1);
  assert.equal(kickers[0].textContent, 'matt does');
  assert.equal(kickers[0].getAttribute('aria-hidden'), 'true');
  const nav = home.querySelector('nav[aria-label="verbs"]');
  const list = nav?.querySelector('ol.verbs');
  assert.ok(nav?.contains(kickers[0]));
  assert.equal(kickers[0].compareDocumentPosition(list) & 4, 4);
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
  assert.equal(sitemap.includes('<loc>https://mattdoes.online/watch/</loc>'), false);
  assert.equal(sitemap.includes('<loc>https://mattdoes.online/listen/</loc>'), false);
  assert.equal(sitemap.includes('/digs/'), false);
  const frequency = readDist(distDir, 'frequency/index.html');
  assert.match(frequency, /name="robots" content="noindex"/);
  const home = readDist(distDir, 'index.html');
  assert.doesNotMatch(home, /frequency|lucia|luciadoes/i);
});
