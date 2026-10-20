// The Pages prebuild must succeed with no vault token and must not clone.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = path.join(REPO_ROOT, 'scripts', 'pages-prebuild.sh');

function run() {
  const env = { ...process.env };
  delete env.VAULT_TOKEN;
  delete env.VAULT_DIR;
  delete env.VAULT_BRANCH;
  return spawnSync('bash', ['scripts/pages-prebuild.sh'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env,
  });
}

test('prebuild succeeds with VAULT_TOKEN unset and does not clone', () => {
  const res = run();
  const text = `${res.stdout}\n${res.stderr}`;
  assert.equal(res.status, 0, text);
  assert.match(text, /no vault clone/);
  assert.doesNotMatch(text, /Cloning|VAULT_TOKEN|git clone/);
});

test('prebuild script has no vault clone and no token requirement', () => {
  const src = fs.readFileSync(SCRIPT, 'utf8');
  assert.doesNotMatch(src, /VAULT_TOKEN/);
  assert.doesNotMatch(src, /VAULT_DIR/);
  assert.doesNotMatch(src, /git clone/);
  assert.doesNotMatch(src, /mattdoes-vault/);
  assert.match(src, /set -euo pipefail/);
  assert.match(src, /site\/verbs\.ts/);
});
