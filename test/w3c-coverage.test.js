// html-validate pins. wcag/h71, wcag/h32, no-raw-characters, and
// no-inline-style stay on. attribute-empty-style stays off because the
// pages emit empty attributes such as alt="".

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

  // Absent means the recommended default, which is on.
  for (const rule of ['wcag/h71', 'wcag/h32', 'no-raw-characters']) {
    assert.notEqual(rules[rule], 'off', `${rule} stays on`);
  }

  assert.notEqual(rules['no-inline-style'], 'off', 'no-inline-style stays on');

  // attribute-empty-style stays off. The pages emit empty attributes such as alt="".
  assert.equal(rules['attribute-empty-style'], 'off',
    'attribute-empty-style stays off');
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
