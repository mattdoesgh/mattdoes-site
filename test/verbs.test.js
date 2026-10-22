// The verb registry is the source of truth for nav, routes, and the sitemap.
// An unknown source or a missing renderer fails the build. /frequency/ stays
// offline while SECRET_PATHS is empty, and out of the menu and sitemap.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { buildFixtureVault, listDistHtml, readDist, REPO_ROOT } from './helpers/run-build.js';
import { verbs, sitemapPaths, SECRET_PATHS, unsharedEnabled, assertRegistry, validateVerbs, verbHeading } from '../site/verbs.ts';

let distDir;
test.before(() => { ({ distDir } = buildFixtureVault()); });

test('the registry names watching and listening while unshared is offline', () => {
  assert.equal(unsharedEnabled, false);
  const slugs = verbs.map((verb) => verb.slug);
  assert.deepEqual(slugs, ['watching', 'listening']);
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
  assert.doesNotThrow(() => assertRegistry(['watch', 'listen']));
  assert.throws(() => assertRegistry(['listen']), /missing renderer "watch"/);
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
    assert.equal(page.querySelector('footer nav.verb-nav'), null, verb.slug);
    assert.equal(page.querySelector('h1 a')?.getAttribute('href'), '/', verb.slug);
    assert.equal(page.querySelector('footer')?.textContent.includes('matt does'), false, verb.slug);
  }
  const watching = new JSDOM(readDist(distDir, 'watching/index.html')).window.document;
  const listening = new JSDOM(readDist(distDir, 'listening/index.html')).window.document;
  assert.equal(watching.querySelector('h1')?.textContent, 'matt does letterboxd');
  assert.equal(listening.querySelector('h1')?.textContent, 'matt does last.fm');
  assert.equal(watching.querySelector('.credit'), null);
  assert.equal(listening.querySelector('.credit'), null);
  assert.equal(watching.querySelector('main a[href="https://letterboxd.com/mattdoes/"]'), null);
  assert.equal(listening.querySelector('main a[href="https://www.last.fm/user/djverism"]'), null);
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
    assert.equal(link.textContent, `matt does ${verb.label}`);
    assert.equal(link.textContent.includes('\u00a0'), false);
    assert.equal(link.textContent.split(' ').length, 3);
  }
});

test('the home prefix is clipped shut until hover', () => {
  const css = fs.readFileSync(path.join(REPO_ROOT, 'static', 'station.css'), 'utf8');
  const rule = css.slice(css.indexOf('.verb-prefix {'), css.indexOf('.verb-prefix > span'));
  assert.match(rule, /width:\s*0/);
  assert.match(rule, /overflow:\s*clip/);
  assert.match(rule, /white-space:\s*nowrap/);
  const base = css.slice(css.indexOf('.verb-prefix {\n  display: block;'), css.indexOf('.verb-prefix > span'));
  assert.doesNotMatch(base, /font-size/);
  assert.match(css, /\.verb:hover \.verb-prefix,\s*\.verb:focus-visible \.verb-prefix \{\s*width:\s*4\.08em;\s*margin-right:\s*0\.24em;/);
  assert.match(css, /@media \(hover: none\) and \(max-width: 1023px\)[\s\S]*\.verb-kicker \{[^}]*font-size:\s*1\.5rem/);
  assert.match(css, /@media \(min-width: 1024px\)[\s\S]*\.verb-prefix \{[^}]*font-size:\s*1\.8em/);
  assert.match(css, /calc\(\(100vw - 5\.6rem\) \/ 8\.55\)/);
  assert.match(css, /font-size:\s*calc\(var\(--row-size\) \* 0\.7125\)/);
  assert.doesNotMatch(css, /\.verb-prefix[^{]*\{[^}]*transition/);
  assert.doesNotMatch(css, /@keyframes[\s\S]*verb-prefix|verb-prefix[\s\S]*@keyframes/);
});

test('the wordmark is solid type and the stars keep the pink stroke', () => {
  const css = fs.readFileSync(path.join(REPO_ROOT, 'static', 'station.css'), 'utf8');
  const support = css.slice(css.indexOf('@supports (-webkit-text-stroke: 0.025em #f7c8d8)'));
  assert.ok(support.startsWith('@supports'));
  assert.doesNotMatch(css, /\.mark\b/);
  assert.match(support, /\.stars\s*\{[^}]*color:\s*#000000;/);
  assert.match(support, /-webkit-text-fill-color:\s*#000000;/);
  assert.match(support, /-webkit-text-stroke:\s*0\.025em #f7c8d8;/);
  assert.match(support, /-webkit-text-stroke:\s*max\(0\.025em,\s*1\.5px\) #f7c8d8;/);
  assert.match(support, /paint-order:\s*stroke fill;/);
  assert.match(support, /body\[data-polarity="flip"\] \.stars\s*\{[^}]*background-color:\s*#000000;/);
  assert.doesNotMatch(css, /\.verb:hover \.verb-prefix,\s*\.verb:focus-visible \.verb-prefix,\s*\.verb:active \.verb-prefix\s*\{[^}]*background-color:\s*#000000;/);
  assert.doesNotMatch(css, /\.stars[^{]*\{[^}]*transition/);
  const home = new JSDOM(readDist(distDir, 'index.html')).window.document;
  for (const verb of verbs) {
    const link = [...home.querySelectorAll('a.verb')].find((anchor) => anchor.getAttribute('href') === `/${verb.slug}/`);
    assert.equal(link?.querySelector('.verb-prefix')?.textContent, 'matt does ', verb.slug);
    assert.equal(link?.querySelector('.mark'), null, verb.slug);
    const page = new JSDOM(readDist(distDir, `${verb.slug}/index.html`)).window.document;
    assert.equal(page.querySelector('h1 .mark'), null, verb.slug);
    assert.equal(page.querySelector('h1')?.textContent, `matt does ${verb.label}`, verb.slug);
    assert.equal(page.querySelector('h1 a')?.innerHTML, `matt does ${verb.label}`, verb.slug);
  }
  const kicker = home.querySelector('.verb-kicker');
  assert.equal(kicker?.textContent, 'matt does');
  assert.equal(kicker?.querySelector('.mark'), null);
  assert.equal(kicker?.getAttribute('aria-hidden'), 'true');
  const missing = new JSDOM(readDist(distDir, '404.html')).window.document;
  assert.equal(missing.querySelector('.mark'), null);
  assert.equal(missing.querySelector('h1')?.textContent, 'not found');
  const shipped = fs.readdirSync(distDir).find((name) => /^station\.[0-9a-f]+\.css$/.test(name));
  assert.ok(shipped);
  const built = fs.readFileSync(path.join(distDir, shipped), 'utf8');
  assert.match(built, /-webkit-text-stroke:\.025em #f7c8d8/);
  assert.match(built, /-webkit-text-stroke:max\(\.025em,\s*1\.5px\) #f7c8d8/);
  assert.match(built, /paint-order:stroke fill/);
  assert.match(built, /calc-size\(fit-content,size \* \.5\)|calc-size\(fit-content, size \* \.5\)/);
  assert.doesNotMatch(built, /\.mark[\s,{]/);
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
  assert.equal(sitemap.includes('/unshared/'), false);
  assert.equal(sitemap.includes('/frequency/'), false);
  assert.equal(sitemap.includes('/movies/'), false);
  assert.equal(sitemap.includes('<loc>https://mattdoes.online/watch/</loc>'), false);
  assert.equal(sitemap.includes('<loc>https://mattdoes.online/listen/</loc>'), false);
  assert.equal(sitemap.includes('/digs/'), false);
  assert.equal(fs.existsSync(path.join(distDir, 'unshared', 'index.html')), false);
  assert.equal(fs.existsSync(path.join(distDir, 'frequency', 'index.html')), false);
  const home = readDist(distDir, 'index.html');
  assert.equal(home.includes('/unshared/'), false);
  assert.doesNotMatch(home, /frequency|lucia|luciadoes/i);
});

test('/unshared/ is not built and no built file links to it or names the mailto', () => {
  assert.equal(unsharedEnabled, false);
  assert.equal(fs.existsSync(path.join(distDir, 'unshared', 'index.html')), false);
  const files = [];
  const walk = (dir) => {
    for (const name of fs.readdirSync(dir)) {
      const file = path.join(dir, name);
      if (fs.statSync(file).isDirectory()) walk(file);
      else files.push(file);
    }
  };
  walk(distDir);
  assert.ok(files.length > 0);
  for (const file of files) {
    const text = fs.readFileSync(file).toString('latin1');
    const rel = path.relative(distDir, file);
    assert.equal(text.includes('/unshared/'), false, rel);
    assert.equal(text.includes('luciadoes+unshared@'), false, rel);
  }
});

test('/frequency/ is not built and no built HTML or JS names it', () => {
  assert.deepEqual([...SECRET_PATHS], []);
  assert.equal(fs.existsSync(path.join(distDir, 'frequency', 'index.html')), false);
  const files = [];
  const walk = (dir) => {
    for (const name of fs.readdirSync(dir)) {
      const file = path.join(dir, name);
      if (fs.statSync(file).isDirectory()) walk(file);
      else files.push(file);
    }
  };
  walk(distDir);
  const built = files.filter((file) => file.endsWith('.html') || file.endsWith('.js'));
  assert.ok(built.length > 0);
  for (const file of built) {
    const text = fs.readFileSync(file, 'utf8');
    assert.equal(text.includes('frequency'), false, path.relative(distDir, file));
  }
});
