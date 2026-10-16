// VAULT_DIR reaches git clone, git -C, and ls. Reject empty, absolute,
// `..` segments, and a leading dash before any of those run.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function run(env) {
  return spawnSync('bash', ['scripts/pages-prebuild.sh'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
}

function output(res) {
  return `${res.stdout}\n${res.stderr}`;
}

test('VAULT_DIR rejects empty, absolute, parent, and leading-dash paths', () => {
  const cases = [
    ['', /VAULT_DIR is empty/],
    ['/tmp/vault', /VAULT_DIR must be a relative path/],
    ['/etc', /VAULT_DIR must be a relative path/],
    ['..', /VAULT_DIR must not contain a '\.\.' segment/],
    ['../vault', /VAULT_DIR must not contain a '\.\.' segment/],
    ['foo/../../etc', /VAULT_DIR must not contain a '\.\.' segment/],
    ['foo/../bar', /VAULT_DIR must not contain a '\.\.' segment/],
    ['-rf', /VAULT_DIR must not start with '-'/],
    ['--upload-pack=evil', /VAULT_DIR must not start with '-'/],
  ];
  for (const [dir, pattern] of cases) {
    const res = run({ VAULT_DIR: dir, VAULT_TOKEN: 'should-not-be-used' });
    const text = output(res);
    assert.notEqual(res.status, 0, `expected reject for ${JSON.stringify(dir)}\n${text}`);
    assert.match(text, pattern, text);
    assert.doesNotMatch(text, /Cloning/);
  }
});

test('a nested relative directory is not rejected as a path', () => {
  const res = run({ VAULT_DIR: 'vault/nested', VAULT_TOKEN: '' });
  const text = output(res);
  assert.notEqual(res.status, 0, text);
  assert.match(text, /VAULT_TOKEN/);
  assert.doesNotMatch(text, /VAULT_DIR must/);
  assert.doesNotMatch(text, /Cloning/);
});

test('a relative populated VAULT_DIR skips the clone', () => {
  const res = run({ VAULT_DIR: 'test/fixture-vault', VAULT_TOKEN: '' });
  const text = output(res);
  assert.equal(res.status, 0, text);
  assert.match(text, /already populated/);
  assert.doesNotMatch(text, /Cloning/);
});

test('git clone places -- before the destination', () => {
  const src = fs.readFileSync(path.join(REPO_ROOT, 'scripts/pages-prebuild.sh'), 'utf8');
  assert.match(src, /git clone[\s\S]*"https:\/\/\$\{VAULT_REPO\}"[\s\S]*-- \\\n {2}"\$VAULT_DIR"/);
  assert.match(src, /npm --prefix workers ci/);
});
