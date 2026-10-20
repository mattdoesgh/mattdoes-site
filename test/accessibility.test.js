// axe-core on the generated pages, WCAG A/AA. color-contrast is disabled
// here because jsdom does not lay out; test/contrast.test.js covers the tokens.
// Smoke targets: home, watch, listen, unshared, frequency.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { buildFixtureVault, listDistHtml } from './helpers/run-build.js';

const AXE_SRC = fs.readFileSync(
  path.join(process.cwd(), 'node_modules', 'axe-core', 'axe.min.js'), 'utf8',
);

const SMOKE = [
  'index.html',
  'watch/index.html',
  'listen/index.html',
  'unshared/index.html',
  'frequency/index.html',
];

let distDir;
test.before(() => { ({ distDir } = buildFixtureVault()); });

async function axeScan(html) {
  const dom = new JSDOM(html, { runScripts: 'outside-only' });
  dom.window.eval(AXE_SRC);
  return dom.window.axe.run(dom.window.document, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
    rules: { 'color-contrast': { enabled: false } },
  });
}

function doc(rel) {
  return new JSDOM(fs.readFileSync(path.join(distDir, rel), 'utf8')).window.document;
}

test('home, watch, listen, unshared, and frequency have zero WCAG A/AA axe violations', async (t) => {
  for (const rel of SMOKE) {
    await t.test(rel, async () => {
      const results = await axeScan(fs.readFileSync(path.join(distDir, rel), 'utf8'));
      const summary = results.violations
        .map((v) => `${v.id} (${v.nodes.length}×): ${v.help}`)
        .join('\n  ');
      assert.equal(results.violations.length, 0, `${rel} has axe violations:\n  ${summary}`);
    });
  }
});

test('every generated page has zero WCAG A/AA axe violations', async (t) => {
  for (const file of listDistHtml(distDir)) {
    const rel = path.relative(distDir, file);
    await t.test(rel, async () => {
      const results = await axeScan(fs.readFileSync(file, 'utf8'));
      const summary = results.violations
        .map((v) => `${v.id} (${v.nodes.length}×): ${v.help}`)
        .join('\n  ');
      assert.equal(results.violations.length, 0, `${rel} has axe violations:\n  ${summary}`);
    });
  }
});

test('every page has a skip link, one main, and a description', () => {
  for (const file of listDistHtml(distDir)) {
    const rel = path.relative(distDir, file);
    const d = doc(rel);
    const skip = d.querySelector('a.skip-link');
    assert.equal(skip?.getAttribute('href'), '#main', rel);
    assert.equal(d.querySelectorAll('main#main').length, 1, rel);
    assert.ok(d.querySelector('meta[name="description"]')?.getAttribute('content'), rel);
    assert.ok(d.querySelector('link[rel="canonical"]'), rel);
  }
});

test('the active verb is marked and the secret is not in the anomaly index', () => {
  const watch = doc('watch/index.html');
  assert.equal(watch.querySelector('nav.verb-nav a[aria-current="page"]')?.getAttribute('href'), '/watch/');
  for (const rel of ['index.html', 'watch/index.html', 'listen/index.html', 'unshared/index.html', '404.html']) {
    const text = doc(rel).querySelector('#anomalies')?.textContent || '';
    assert.doesNotMatch(text, /lucia|frequency|transmission|luciadoes/i, rel);
  }
  const frequency = doc('frequency/index.html');
  assert.equal(frequency.querySelector('meta[name="robots"]')?.getAttribute('content'), 'noindex');
  assert.ok(frequency.querySelector('a[href="mailto:luciadoes@mail.grokbot.com"]'));
});
