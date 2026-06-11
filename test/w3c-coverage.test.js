// Audit backlog: "W3C coverage — Revisit disabled html-validate WCAG rules".
// Covers audit findings #9, #13, #15 (W3C / standards side).
//
// Two concerns:
//   1. html-validate config — the audit asked to revisit the four disabled
//      rules now that the accent control is a real <fieldset> with a
//      <legend> and authored inline styles were migrated to classes:
//        - wcag/h71  RE-ENABLED  (the <fieldset> now has a <legend>)
//        - wcag/h32  RE-ENABLED  (form/control structure is now valid)
//        - no-raw-characters  RE-ENABLED  (output is clean)
//        - no-inline-style  KEPT OFF  — Shiki emits `style="--shiki-…"`
//          custom-property declarations on every highlighted token; this is
//          generated, not authored, presentation. (html-validate's default
//          no-inline-style ignores custom-property-only style attributes, but
//          the rule is left off deliberately so a future Shiki upgrade that
//          emits literal declarations does not break the build.)
//      This test asserts the config matches that decision, and that the
//      generated fixture output still passes html-validate with the three
//      re-enabled rules ON.
//   2. Thought fragment-id stability (finding #13): adding an older daily
//      note must not shift the ids of pre-existing thoughts.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { JSDOM } from 'jsdom';
import {
  runBuild, buildFixtureVault, readDist, REPO_ROOT,
} from './helpers/run-build.js';

// One fixture-vault build shared by the html-validate and sitemap tests.
let fixtureDist;
test.before(() => { ({ distDir: fixtureDist } = buildFixtureVault()); });

// ── 1. html-validate config ─────────────────────────────────────────────
test('.htmlvalidate.json keeps the intended rule decisions', () => {
  const cfg = JSON.parse(
    fs.readFileSync(path.join(REPO_ROOT, '.htmlvalidate.json'), 'utf8'));
  const rules = cfg.rules || {};

  // Re-enabled rules must NOT be present as "off" (or absent → default on).
  for (const rule of ['wcag/h71', 'wcag/h32', 'no-raw-characters']) {
    assert.notEqual(rules[rule], 'off',
      `${rule} should be re-enabled (not "off") — see the comment in this file`);
  }

  // no-inline-style stays off — Shiki emits inline custom-property styles.
  assert.equal(rules['no-inline-style'], 'off',
    'no-inline-style must stay disabled (Shiki highlighted-code styles)');
});

test('the fixture build still passes html-validate with the tightened rules', () => {
  // Same rules CI's lint step uses — the config is passed explicitly because
  // the build output lives in a temp dir outside the repo tree.
  const res = spawnSync('npx', [
    'html-validate',
    '--config', path.join(REPO_ROOT, '.htmlvalidate.json'),
    path.join(fixtureDist, '**', '*.html'),
  ], {
    cwd: REPO_ROOT, encoding: 'utf8', timeout: 60_000,
  });
  assert.equal(res.status, 0,
    `html-validate must pass with wcag/h71 + wcag/h32 + no-raw-characters ` +
    `enabled.\n${res.stdout}\n${res.stderr}`);
});

// ── 2. thought fragment-id stability (finding #13) ──────────────────────
function thoughtIds(distHtml) {
  const doc = new JSDOM(distHtml).window.document;
  return [...doc.querySelectorAll('.row[data-kind="thought"] a.permalink')]
    .map(a => a.id)
    .filter(Boolean);
}

test('adding an older thought does not shift pre-existing thought ids', () => {
  // Build the "before" vault: two thoughts on 2026-03-10.
  const before = runBuild({
    vaultDir: path.join(REPO_ROOT, 'test', 'fixtures', 'thoughts-before'),
  });
  assert.equal(before.status, 0, `thoughts-before build failed:\n${before.stderr}`);
  const idsBefore = thoughtIds(readDist(before.distDir, 'thoughts/index.html'));
  assert.ok(idsBefore.length >= 2, 'before-vault should yield >=2 thought ids');

  // Build the "after" vault: same March note + an OLDER (January) thought.
  const after = runBuild({
    vaultDir: path.join(REPO_ROOT, 'test', 'fixtures', 'thoughts-after'),
  });
  assert.equal(after.status, 0, `thoughts-after build failed:\n${after.stderr}`);
  const idsAfter = thoughtIds(readDist(after.distDir, 'thoughts/index.html'));

  // Every id that existed before must still exist — the older insertion must
  // not renumber later thoughts (the regression fixed in finding #13).
  for (const id of idsBefore) {
    assert.ok(idsAfter.includes(id),
      `pre-existing thought id "${id}" disappeared after adding an older note ` +
      `— ids must be stable. after=${JSON.stringify(idsAfter)}`);
  }

  // The ids are timestamp-derived (t-YYYYMMDD-HHMM), not sequential ordinals.
  for (const id of idsAfter) {
    assert.match(id, /^t-\d{8}-\d{4}(-\d+)?$/,
      `thought id "${id}" must be a stable timestamp id, not an ordinal`);
  }
});

test('sitemap.xml and robots.txt are emitted', () => {
  const sitemap = readDist(fixtureDist, 'sitemap.xml');
  assert.match(sitemap, /<urlset/, 'sitemap.xml must be a urlset');
  assert.ok(sitemap.includes('/blog/</loc>'), 'sitemap must list /blog/');

  const robots = readDist(fixtureDist, 'robots.txt');
  assert.match(robots, /Sitemap:/, 'robots.txt must advertise the sitemap');
  assert.match(robots, /User-agent:/, 'robots.txt must declare a user-agent rule');
});
