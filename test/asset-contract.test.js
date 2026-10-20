// Asset name contract — every shipped CSS/JS asset (static/*.{css,js} plus
// the two templates/ browser modules) must reach dist/ as a content-hashed
// twin, with no unhashed original left behind. Guards the disk-derived
// process list in lib/emit/assets.js (listShippedAssets): a file that slips
// through unprocessed would ship unminified at its clean URL and bypass the
// immutable-cache headers.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { listShippedAssets } from '../lib/emit/assets.js';
import { buildFixtureVault, REPO_ROOT } from './helpers/run-build.js';

const STATIC_DIR = path.join(REPO_ROOT, 'static');

let distDir;

test.before(() => {
  ({ distDir } = buildFixtureVault());
});

test('every shipped asset gets a hashed dist twin; no unhashed original ships', () => {
  const distFiles = fs.readdirSync(distDir);
  const shipped = listShippedAssets(STATIC_DIR);
  assert.ok(shipped.length >= 2, 'expected station.css and station.js');
  for (const [filename] of shipped) {
    const ext = path.extname(filename);
    const stem = filename.slice(0, -ext.length);
    const hashedRe = new RegExp(`^${stem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.[0-9a-f]{8}\\${ext}$`);
    assert.ok(
      distFiles.some((n) => hashedRe.test(n)),
      `${filename} has no content-hashed twin in dist/`,
    );
    assert.ok(!distFiles.includes(filename), `unhashed ${filename} shipped in dist/`);
  }
});

test('station.css and station.js are the shipped shell', () => {
  const kinds = Object.fromEntries(listShippedAssets(STATIC_DIR));
  assert.equal(kinds['station.css'], 'css');
  assert.equal(kinds['station.js'], 'js');
});
