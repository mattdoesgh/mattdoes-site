// sync-media must run the wrangler version pinned in workers/package-lock.json.
// An unpinned `npx --yes wrangler` would download whatever the registry
// currently serves while CLOUDFLARE_API_TOKEN is in the environment.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { lockedWranglerVersion, resolveWranglerBin } from '../scripts/wrangler-bin.js';

const REPO_ROOT = process.cwd();

test('the lockfile pin is an exact wrangler version', () => {
  assert.match(lockedWranglerVersion(REPO_ROOT), /^\d+\.\d+\.\d+$/);
});

test('a missing or mismatched install is refused', () => {
  const version = lockedWranglerVersion(REPO_ROOT);
  const bin = path.join(REPO_ROOT, 'workers', 'node_modules', 'wrangler', 'bin', 'wrangler.js');
  if (!fs.existsSync(bin)) {
    assert.throws(
      () => resolveWranglerBin(REPO_ROOT),
      new RegExp(`Locked wrangler@${version} is not installed`),
    );
  } else {
    assert.equal(resolveWranglerBin(REPO_ROOT), bin);
  }

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wrangler-pin-'));
  const workers = path.join(root, 'workers');
  const installedBin = path.join(workers, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
  fs.mkdirSync(path.dirname(installedBin), { recursive: true });
  fs.writeFileSync(path.join(workers, 'package-lock.json'), JSON.stringify({
    packages: { 'node_modules/wrangler': { version: '4.151.0' } },
  }));
  fs.writeFileSync(installedBin, '// test bin\n');
  fs.writeFileSync(
    path.join(workers, 'node_modules', 'wrangler', 'package.json'),
    JSON.stringify({ version: '9.9.9' }),
  );
  assert.throws(() => resolveWranglerBin(root), /wrangler@9\.9\.9/);

  fs.writeFileSync(
    path.join(workers, 'node_modules', 'wrangler', 'package.json'),
    JSON.stringify({ version: '4.151.0' }),
  );
  assert.equal(resolveWranglerBin(root), installedBin);
});

test('sync-media does not spawn an unpinned package runner', () => {
  const src = fs.readFileSync(new URL('../scripts/sync-media.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /spawnSync\(\s*['"]npx['"]/);
  assert.doesNotMatch(src, /--yes/);
  assert.match(src, /resolveWranglerBin\(/);
});

test('deploy:workers runs the lockfile binary', () => {
  const src = fs.readFileSync(new URL('../scripts/deploy-workers.js', import.meta.url), 'utf8');
  const rootPkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  const workersPkg = fs.readFileSync(new URL('../workers/package.json', import.meta.url), 'utf8');
  assert.equal(rootPkg.scripts['deploy:workers'], 'node scripts/deploy-workers.js');
  assert.match(src, /resolveWranglerBin\(/);
  assert.match(src, /listening/);
  assert.match(src, /geo/);
  assert.match(src, /csp-report/);
  assert.doesNotMatch(src, /npx/);
  assert.doesNotMatch(rootPkg.scripts['deploy:workers'], /npx/);
  assert.doesNotMatch(workersPkg, /npx/);
  for (const name of ['listening', 'geo', 'csp-report']) {
    const toml = fs.readFileSync(new URL(`../workers/${name}/wrangler.toml`, import.meta.url), 'utf8');
    assert.doesNotMatch(toml, /npx wrangler/);
  }
});
