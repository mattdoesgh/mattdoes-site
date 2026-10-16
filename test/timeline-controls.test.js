// The timeline filter island only mounted on writing archives. Those pages
// are not generated, so the client bundle must not ship.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildFixtureVault, readDist } from './helpers/run-build.js';

let distDir;
test.before(() => { ({ distDir } = buildFixtureVault()); });

test('the timeline-controls client bundle is not emitted', () => {
  const scripts = fs.readdirSync(distDir).filter((name) => name.endsWith('.js'));
  assert.equal(scripts.some((name) => name.startsWith('timeline-controls')), false);
  assert.equal(scripts.some((name) => name.startsWith('timeline-vendor')), false);
  assert.equal(scripts.some((name) => name.startsWith('tag-filter')), false);
  assert.doesNotMatch(readDist(distDir, 'listening/index.html'), /timeline-controls/);
  assert.equal(fs.existsSync(`${distDir}/blog/index.html`), false);
});
