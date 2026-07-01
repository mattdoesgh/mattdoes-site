import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';
import { buildFixtureVault, readDist } from './helpers/run-build.js';

let distDir;
test.before(() => { ({ distDir } = buildFixtureVault()); });

function doc(rel) {
  return new JSDOM(readDist(distDir, rel), {
    url: `https://mattdoes.online/${rel.replace(/index\.html$/, '')}`,
    pretendToBeVisual: true,
  }).window.document;
}

function topLevelJs() {
  return fs.readdirSync(distDir).filter((name) => name.endsWith('.js'));
}

test('timeline controls are emitted as hashed feed-only assets', () => {
  const scripts = topLevelJs();
  const controls = scripts.filter((name) => /^timeline-controls\.[\w-]+\.js$/.test(name));
  const vendors = scripts.filter((name) => /^timeline-vendor\.[\w-]+\.js$/.test(name));

  assert.equal(controls.length, 1, 'one hashed timeline-controls entry should be emitted');
  assert.ok(vendors.length >= 1, 'React runtime chunks should be emitted explicitly');
  assert.equal(scripts.some((name) => name.startsWith('tag-filter')), false,
    'the old tag-filter asset should not ship');

  for (const rel of [
    'index.html',
    'blog/index.html',
    'journal/index.html',
    'making/index.html',
    'thoughts/index.html',
    'listening/index.html',
  ]) {
    assert.match(readDist(distDir, rel), /timeline-controls\.[\w-]+\.js/,
      `${rel} should load the timeline controls island`);
  }

  for (const rel of [
    'about/index.html',
    'search/index.html',
    'colophon/index.html',
    'journal/hello-fixture-world/index.html',
  ]) {
    assert.doesNotMatch(readDist(distDir, rel), /timeline-controls\.[\w-]+\.js/,
      `${rel} should not load feed-only controls`);
  }
});

test('timeline filter markup keeps accessible active and density controls', () => {
  const d = doc('blog/index.html');
  const filter = d.querySelector('.filter[data-timeline-controls]');
  assert.ok(filter, 'blog should render a timeline controls mount');

  const active = filter.querySelector('a.all[aria-current="true"]');
  assert.ok(active, 'the all filter should be active server-side');

  assert.ok(filter.querySelector('button[aria-label="comfortable density"][aria-pressed="true"]'),
    'comfortable density control should be labelled and active');
  assert.ok(filter.querySelector('button[aria-label="compact density"][aria-pressed="false"]'),
    'compact density control should be labelled and inactive');
});

test('timeline rows preserve kind classes, data filters, and featured state', () => {
  const home = doc('index.html');
  assert.equal(home.querySelectorAll('.timeline .row[data-featured="true"]').length, 1,
    'homepage should feature exactly one current entry');

  const blog = doc('blog/index.html');
  const rows = [...blog.querySelectorAll('.timeline .row[data-kind]')];
  assert.ok(rows.length > 0, 'blog should render filterable rows');
  for (const row of rows) {
    const kind = row.getAttribute('data-kind');
    assert.ok(row.classList.contains(`row--${kind}`),
      `row for ${kind} should carry row--${kind}`);
    assert.ok(row.hasAttribute('data-tags'),
      'filterable rows must keep data-tags');
  }
});

test('timeline controls update count and active filter on click', async () => {
  const html = readDist(distDir, 'blog/index.html');
  const dom = new JSDOM(html, {
    url: 'https://mattdoes.online/blog/',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });
  const keys = ['window', 'document', 'localStorage', 'Element', 'HTMLElement', 'navigator'];
  const previous = new Map(keys.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));

  Object.defineProperties(globalThis, {
    window: { value: dom.window, configurable: true },
    document: { value: dom.window.document, configurable: true },
    localStorage: { value: dom.window.localStorage, configurable: true },
    Element: { value: dom.window.Element, configurable: true },
    HTMLElement: { value: dom.window.HTMLElement, configurable: true },
    navigator: { value: dom.window.navigator, configurable: true },
  });

  try {
    const [asset] = topLevelJs().filter((name) => /^timeline-controls\.[\w-]+\.js$/.test(name));
    await import(`${pathToFileURL(path.join(distDir, asset)).href}?test=${Date.now()}`);
    dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 20));

    const meta = dom.window.document.querySelector('.filter a[data-filter="meta"]');
    assert.ok(meta, 'fixture should expose a meta filter');
    meta.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
    await new Promise((resolve) => setTimeout(resolve, 20));

    assert.equal(meta.getAttribute('aria-current'), 'true',
      'clicked filter should become active');
    assert.equal(dom.window.document.querySelector('.filter .cnt')?.textContent.trim(), '3 entries',
      'visible count should update after filtering');
  } finally {
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
    dom.window.close();
  }
});
