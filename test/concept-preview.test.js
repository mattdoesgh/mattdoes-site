// Signal / Station is a branch-preview mock. Production dist stays the
// current site. Lucia's mailto is the hidden prize, not a footer listing.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { JSDOM } from 'jsdom';
import { conceptPreviewRequested, emitConceptPreview } from '../scripts/emit-concept-preview.js';
import { buildFixtureVault, REPO_ROOT } from './helpers/run-build.js';

const CONCEPT = path.join(REPO_ROOT, 'concepts', 'signal-station');
const PRIZE = 'mailto:luciadoes@mail.grokbot.com';
const PUBLIC_MAIL = 'mailto:unshared@mattdoes.online';
const PUBLIC_PAGES = [
  'index.html',
  'watch/index.html',
  'listen/index.html',
  'unshared/index.html',
  '404.html',
];

function readConcept(rel) {
  return fs.readFileSync(path.join(CONCEPT, rel), 'utf8');
}

function anomaliesText(html) {
  const doc = new JSDOM(html).window.document;
  const node = doc.querySelector('#anomalies');
  assert.ok(node, 'missing index of anomalies');
  return node.textContent;
}

test('concept preview is off for production and on for other Pages branches', () => {
  assert.equal(conceptPreviewRequested({}), false);
  assert.equal(conceptPreviewRequested({ CF_PAGES: '1' }), false);
  assert.equal(conceptPreviewRequested({ CF_PAGES: '1', CF_PAGES_BRANCH: '' }), false);
  assert.equal(conceptPreviewRequested({ CF_PAGES: '1', CF_PAGES_BRANCH: 'main' }), false);
  assert.equal(conceptPreviewRequested({
    CF_PAGES: '1',
    CF_PAGES_BRANCH: 'cursor/signal-station-concept-6593',
  }), true);
  assert.equal(conceptPreviewRequested({ CONCEPT_PREVIEW: '1', CF_PAGES_BRANCH: 'main' }), true);
  assert.equal(conceptPreviewRequested({
    CONCEPT_PREVIEW: '0',
    CF_PAGES: '1',
    CF_PAGES_BRANCH: 'preview',
  }), false);
});

test('emit copies the concept beside an existing site and can refuse', () => {
  const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'concept-preview-'));
  fs.writeFileSync(path.join(dist, 'index.html'), '<p>site</p>');
  const off = emitConceptPreview({ distDir: dist, env: {} });
  assert.equal(off.emitted, false);
  assert.equal(fs.existsSync(path.join(dist, 'concepts')), false);

  const on = emitConceptPreview({ distDir: dist, env: { CONCEPT_PREVIEW: '1' } });
  assert.equal(on.emitted, true);
  assert.equal(on.urlPath, '/concepts/signal-station/');
  assert.equal(fs.readFileSync(path.join(dist, 'index.html'), 'utf8'), '<p>site</p>');
  assert.ok(fs.existsSync(path.join(dist, 'concepts/signal-station/index.html')));
  assert.ok(fs.existsSync(path.join(dist, 'concepts/signal-station/watch/index.html')));
  assert.ok(fs.existsSync(path.join(dist, 'concepts/signal-station/frequency/index.html')));
  assert.equal(fs.existsSync(path.join(dist, 'concepts/signal-station/render.mjs')), false);
});

test('build.js emits the concept after the site emit', () => {
  const src = fs.readFileSync(path.join(REPO_ROOT, 'build.js'), 'utf8');
  const emitAt = src.indexOf('await emit(');
  const conceptAt = src.indexOf('emitConceptPreview(');
  assert.ok(emitAt > 0);
  assert.ok(conceptAt > emitAt);
});

test('public pages keep Lucia out of the footer and the anomaly index', () => {
  for (const rel of PUBLIC_PAGES) {
    const html = readConcept(rel);
    assert.equal(html.includes(PRIZE), false, rel);
    assert.equal(html.includes('luciadoes@mail.grokbot.com'), false, rel);
    const index = anomaliesText(html);
    assert.doesNotMatch(index, /lucia|grokbot|frequency|transmission/i, rel);
  }

  const home = readConcept('index.html');
  assert.equal(home.includes('frequency/'), false);
  assert.doesNotMatch(home, /lucia/i);

  const unshared = new JSDOM(readConcept('unshared/index.html')).window.document;
  const contact = unshared.querySelector(`a[href="${PUBLIC_MAIL}"]`);
  assert.ok(contact, 'public Unshared contact');
  assert.equal(contact.closest('.redaction'), null);
  assert.equal(contact.closest('#anomalies'), null);
  assert.equal(contact.closest('footer'), null);
  assert.equal(contact.textContent, 'unshared@mattdoes.online');

  const secret = unshared.querySelector('.redaction a[href="../frequency/"]');
  assert.ok(secret, 'night file link lives inside the redaction');
  assert.equal(secret.closest('footer'), null);

  const frequency = readConcept('frequency/index.html');
  assert.ok(frequency.includes(PRIZE));
  assert.match(frequency, /send a transmission/);
  assert.doesNotMatch(anomaliesText(frequency), /lucia|grokbot|frequency|transmission/i);

  const script = readConcept('assets/station.js');
  assert.match(script, /lucia/);
  assert.equal(script.includes('luciadoes@mail.grokbot.com'), false);
  assert.match(readConcept('assets/station.css'), /prefers-reduced-motion:\s*reduce/);
  assert.match(readConcept('404.html'), /href="#anomalies"/);
  assert.match(readConcept('404.html'), /<details class="anomalies" id="anomalies" open>/);
});

test('concept markup passes html-validate', () => {
  const bin = path.join(REPO_ROOT, 'node_modules', '.bin', 'html-validate');
  const files = [
    ...PUBLIC_PAGES,
    'frequency/index.html',
  ].map((rel) => path.join(CONCEPT, rel));
  const res = spawnSync(bin, files, { encoding: 'utf8' });
  assert.equal(res.status, 0, `${res.stdout}\n${res.stderr}`);
});

test('concept pages have no WCAG A/AA axe violations', async () => {
  const axeSrc = fs.readFileSync(
    path.join(REPO_ROOT, 'node_modules', 'axe-core', 'axe.min.js'),
    'utf8',
  );
  const files = [...PUBLIC_PAGES, 'frequency/index.html'];
  for (const rel of files) {
    const dom = new JSDOM(readConcept(rel), { runScripts: 'outside-only' });
    dom.window.eval(axeSrc);
    const results = await dom.window.axe.run(dom.window.document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
      rules: { 'color-contrast': { enabled: false } },
    });
    const summary = results.violations
      .map((v) => `${v.id} (${v.nodes.length}×): ${v.help}`)
      .join('\n  ');
    assert.equal(results.violations.length, 0, `${rel}\n  ${summary}`);
  }
});

test('a production-shaped build does not emit the concept', () => {
  const { distDir, stdout } = buildFixtureVault();
  assert.equal(fs.existsSync(path.join(distDir, 'concepts')), false);
  assert.doesNotMatch(stdout, /concept preview/);
  assert.ok(fs.existsSync(path.join(distDir, 'index.html')));
});

test('a preview-shaped build emits the concept beside the current site', () => {
  const { distDir, stdout } = buildFixtureVault({
    env: { CONCEPT_PREVIEW: '1', CF_PAGES: '1', CF_PAGES_BRANCH: 'preview' },
  });
  assert.match(stdout, /concept preview: \/concepts\/signal-station\//);
  assert.ok(fs.existsSync(path.join(distDir, 'index.html')));
  assert.ok(fs.existsSync(path.join(distDir, 'movies', 'index.html')));
  assert.ok(fs.existsSync(path.join(distDir, 'concepts', 'signal-station', 'listen', 'index.html')));
  const home = fs.readFileSync(path.join(distDir, 'index.html'), 'utf8');
  assert.equal(home.includes('signal / station'), false);
});
