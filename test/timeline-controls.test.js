import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
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

  assert.match(readDist(distDir, 'listening/index.html'), /timeline-controls\.[\w-]+\.js/,
    'listening should keep the timeline controls boot shim');

  for (const rel of [
    'about/index.html',
    'index.html',
    'search/index.html',
    'colophon/index.html',
    'digs/index.html',
  ]) {
    assert.doesNotMatch(readDist(distDir, rel), /timeline-controls\.[\w-]+\.js/,
      `${rel} should not load feed-only controls`);
  }
  assert.equal(fs.existsSync(path.join(distDir, 'blog', 'index.html')), false);
  assert.equal(fs.existsSync(path.join(distDir, 'journal', 'index.html')), false);
});

test('the homepage does not mount a post highlight or archive filter', () => {
  const home = doc('index.html');
  assert.equal(home.querySelectorAll('.home-lead').length, 0);
  assert.equal(home.querySelectorAll('[data-timeline-controls]').length, 0);
  const listening = doc('listening/index.html');
  assert.equal(listening.querySelector('[data-timeline-controls]'), null,
    'listening has no writing filter for the island to mount');
});
