// Audit backlog: "W3C coverage — Revisit disabled html-validate WCAG rules".
// Covers audit findings #9, #13, #15 (W3C / standards side).
//
// html-validate config — the audit asked to revisit the four disabled
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
//        - attribute-empty-style  KEPT OFF  — pages are rendered by React
//         , and renderToStaticMarkup serializes boolean attributes
//          as `hidden=""` (e.g. the idle now-playing pill) with no bare-form
//          option. `hidden=""` and `hidden` are semantically identical valid
//          HTML5; this joins the sibling serialization-style rules already off
//          (attribute-boolean-style, void-style) for the same reason.
//      This test asserts the config matches that decision, and that the
//      generated fixture output still passes html-validate with the three
//      re-enabled rules ON.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  buildFixtureVault, readDist, REPO_ROOT,
} from './helpers/run-build.js';
// One in-repo content build shared by the html-validate and sitemap tests.
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

  // no-inline-style re-enabled — Shiki tokens use build-time CSS classes.
  assert.notEqual(rules['no-inline-style'], 'off',
    'no-inline-style should be re-enabled (Shiki uses CSS classes)');

  // attribute-empty-style stays off — React serializes boolean attributes as
  // `hidden=""` (renderToStaticMarkup has no bare-form option).
  assert.equal(rules['attribute-empty-style'], 'off',
    'attribute-empty-style must stay disabled (React boolean-attr serialization)');
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

test('sitemap.xml and robots.txt are emitted', () => {
  const sitemap = readDist(fixtureDist, 'sitemap.xml');
  assert.match(sitemap, /<urlset/, 'sitemap.xml must be a urlset');
  assert.equal(sitemap.includes('/blog/</loc>'), false, 'sitemap must not list the retired writing archive');
  assert.ok(sitemap.includes('/listening/</loc>'), 'sitemap must list /listening/');

  const robots = readDist(fixtureDist, 'robots.txt');
  assert.match(robots, /Sitemap:/, 'robots.txt must advertise the sitemap');
  assert.match(robots, /User-agent:/, 'robots.txt must declare a user-agent rule');
});
