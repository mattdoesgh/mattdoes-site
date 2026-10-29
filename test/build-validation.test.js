// The registry guards are the input check, and the in-repo tree builds.

import test from 'node:test';
import assert from 'node:assert/strict';
import { assertRegistry } from '../site/verbs.ts';
import { buildFixtureVault } from './helpers/run-build.js';

test('a missing renderer is a build-time failure', () => {
  assert.throws(() => assertRegistry(['watch']), /verb registry: missing renderer/);
});

test('the in-repo tree still builds cleanly (exit 0)', () => {
  const res = buildFixtureVault();
  assert.equal(res.status, 0);
  assert.match(res.stdout, /built in/);
});
