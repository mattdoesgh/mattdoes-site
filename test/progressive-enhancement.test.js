// Retired writing routes stay unpublished and unredirected.
// /listen/ is a real page without JavaScript. Old paths 301 to the verbs.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { buildFixtureVault, readDist, REPO_ROOT } from './helpers/run-build.js';

let distDir;
test.before(() => { ({ distDir } = buildFixtureVault()); });

const RETIRED_ROUTES = ['journal', 'making', 'blog'];

function rules() {
  return fs.readFileSync(path.join(REPO_ROOT, 'static', '_redirects'), 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));
}

test('listen is a real page without JavaScript', () => {
  const html = readDist(distDir, 'listen/index.html');
  assert.ok(!/http-equiv=["']?refresh/i.test(html));
  const doc = new JSDOM(html).window.document;
  assert.ok(doc.querySelector('main#main'));
  assert.equal(doc.querySelector('iframe'), null);
});

test('the redaction trail is a native details element', () => {
  const home = new JSDOM(readDist(distDir, 'index.html')).window.document;
  const bar = home.querySelector('details.redaction');
  assert.ok(bar?.querySelector('summary'));
  assert.equal(bar.querySelector('a')?.getAttribute('href'), '/unshared/');
  const unshared = new JSDOM(readDist(distDir, 'unshared/index.html')).window.document;
  const second = unshared.querySelector('details.redaction a');
  assert.equal(second?.getAttribute('href'), '/frequency/');
  assert.equal(unshared.querySelector('a[href="mailto:unshared@mattdoes.online"]'), null);
  assert.equal(unshared.querySelector('details.redaction a[href^="mailto:"]'), null);
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
  assert.ok(sitemap.includes('/listen/</loc>'));
});

test('static/_redirects does not revive retired writing routes', () => {
  for (const route of [...RETIRED_ROUTES, 'posts', 'thoughts']) {
    for (const rule of rules()) {
      const from = rule.split(/\s+/)[0];
      assert.ok(from !== `/${route}` && from !== `/${route}/`, rule);
    }
  }
});

test('old sections 301 to the verbs or home, including subpaths', () => {
  const text = rules().join('\n');
  const expect = [
    ['/movies', '/watch/'],
    ['/movies/', '/watch/'],
    ['/movies/*', '/watch/:splat'],
    ['/listening', '/listen/'],
    ['/listening/', '/listen/'],
    ['/listening/*', '/listen/:splat'],
  ];
  for (const [from, to] of expect) {
    assert.match(text, new RegExp(`${from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+${to.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+301`));
  }
  for (const section of ['digs', 'grok', 'about', 'search', 'colophon']) {
    for (const from of [`/${section}`, `/${section}/`, `/${section}/*`]) {
      assert.ok(rules().some((rule) => {
        const [src, dest, code] = rule.split(/\s+/);
        return src === from && dest === '/' && code === '301';
      }), from);
    }
  }
});

test('station.js defers network until prerender activation', () => {
  const src = fs.readFileSync(path.join(REPO_ROOT, 'static', 'station.js'), 'utf8');
  assert.match(src, /document\.prerendering/);
  assert.match(src, /prerenderingchange/);
  assert.doesNotMatch(src, /luciadoes|mail\.grokbot/);
});
