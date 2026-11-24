// The built pages pass html-validate under the repo config.

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { buildFixtureVault, REPO_ROOT } from './helpers/run-build.js';

let fixtureDist;
test.before(() => { ({ distDir: fixtureDist } = buildFixtureVault()); });

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
