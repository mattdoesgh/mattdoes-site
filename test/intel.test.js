// The project index has to match a full regen, and curated entries have to
// point at real files. A stale verified-at fails here so a note cannot
// outrank the code it names.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { buildIndex, checkAll, loadCurated, serializeIndex } from '../scripts/intel.js';

const ROOT = process.cwd();

test('the committed index matches a full regen', () => {
  const { errors, stale, fresh } = checkAll();
  assert.deepEqual(errors, [], errors.join('\n'));
  assert.deepEqual(stale, [], stale.map((item) => `${item.id}: ${item.changed.join(', ')}`).join('\n'));
  const disk = fs.readFileSync(path.join(ROOT, 'intel', 'index.json'), 'utf8');
  assert.equal(disk, serializeIndex(fresh));
});

test('two builds of the index are the same text', () => {
  const a = serializeIndex(buildIndex().index);
  const b = serializeIndex(buildIndex().index);
  assert.equal(a, b);
});

test('query facts that agents rely on stay true', () => {
  const { index } = buildIndex();
  assert.equal(index.layout.contentDirExists, false);
  assert.equal(index.layout.unsharedEnabled, true);
  assert.deepEqual(index.layout.secretPaths, []);
  const frequency = index.sections.routes.entries.find((entry) => entry.path === '/frequency/');
  assert.equal(frequency.published, false);
  assert.equal(frequency.inSitemap, false);
  const listening = index.sections.workers.entries.find((entry) => entry.name === 'mattdoes-listening');
  assert.ok(listening.crons.includes('0 11 * * 1'));
  const names = index.sections.workers.entries.flatMap((entry) => entry.bindings.map((binding) => binding.name));
  for (const name of ['CSP_RL', 'GEO_CACHE', 'GEO_RL', 'LISTEN_RL', 'LASTFM_CACHE', 'LISTENING_POLLER', 'REBUILD']) {
    assert.ok(names.includes(name), name);
  }
  const text = serializeIndex(index);
  assert.equal(text.includes('a6ea68e07a764aeba929a865d1d33a58'), false);
  assert.equal(text.includes('luciadoes@'), false);
  const listen = index.sections.features.entries.find((entry) => entry.id === 'home-listen');
  assert.equal(listen.constants['lib/listen-line.js'].LISTEN_LIMIT, 48);
  assert.equal(listen.constants['static/station.js'].LISTEN_LIMIT, 48);
  assert.equal(fs.existsSync(path.join(ROOT, 'lib', 'time.js')), false);
  assert.equal(fs.existsSync(path.join(ROOT, 'test', 'time.test.js')), false);
});

test('a missing curated anchor fails the build', () => {
  const curated = loadCurated();
  curated.features = curated.features.map((feature) => (
    feature.id === 'home-rows'
      ? { ...feature, anchors: ['this-anchor-is-not-in-the-repo'] }
      : feature
  ));
  assert.throws(() => buildIndex({ curated }), /this-anchor-is-not-in-the-repo/);
});

test('dead css classes are only flagged when product strings do not use them', () => {
  const { index } = buildIndex();
  const flagged = index.sections.simplification.classesOnlyInCss.map((item) => item.class);
  for (const name of ['status', 'time', 'verb-nav', 'redaction', 'lede', 'outlinks', 'home-link', 'kicker']) {
    assert.equal(flagged.includes(name), false, `${name} still flagged: ${flagged.join(',')}`);
  }
  const defined = index.sections.tokens.entries.map((entry) => entry.name);
  for (const name of ['--signal', '--space-desk-feed', '--space-incident', '--space-incident-desk', '--space-incident-grid']) {
    assert.equal(defined.includes(name), false, name);
  }
  const product = [];
  const walk = (dir) => {
    for (const name of fs.readdirSync(dir)) {
      if (name === 'node_modules' || name === 'dist' || name === 'test' || name === 'intel') continue;
      const full = path.join(dir, name);
      if (fs.statSync(full).isDirectory()) walk(full);
      else if (/\.(js|html|ts)$/.test(name)) product.push(fs.readFileSync(full, 'utf8'));
    }
  };
  walk(ROOT);
  const hay = product.join('\n');
  assert.equal(/\bclass="[^"]*\bstatus\b/.test(hay), false);
  assert.equal(/\bclass="[^"]*\btime\b/.test(hay), false);
});

test('the index check is on the full-history job and the entry point names the commands', () => {
  const yml = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'build.yml'), 'utf8');
  const testJob = yml.slice(yml.indexOf('name: regression tests'), yml.indexOf('name: visual regression'));
  assert.match(testJob, /fetch-depth: 0/);
  assert.match(testJob, /npm run intel:check/);
  const agents = fs.readFileSync(path.join(ROOT, 'AGENTS.md'), 'utf8');
  for (const phrase of [
    'intel/index.json',
    'npm run intel:check',
    'npm run intel:touch',
    '390',
    '1280',
    'npx wrangler',
    'SECRET_PATHS',
    'tokens.css',
    '::before',
    'intel:hook',
  ]) {
    assert.ok(agents.includes(phrase), phrase);
  }
});
