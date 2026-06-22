// Post-build asset budget regression — catches unexpected growth in the
// hashed JS/CSS shell shipped from dist/.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  listAssetSizes, checkAssetBudget, formatAssetReport,
} from '../lib/asset-budget.js';
import { buildFixtureVault } from './helpers/run-build.js';

const BUDGET_PATH = path.join(import.meta.dirname, '..', 'asset-budget.json');

let distDir;
let budget;

test.before(() => {
  ({ distDir } = buildFixtureVault());
  budget = JSON.parse(fs.readFileSync(BUDGET_PATH, 'utf8'));
});

test('fixture build asset sizes stay within budget', () => {
  const assets = listAssetSizes(distDir);
  assert.ok(assets.length >= 2, 'dist must ship hashed JS and CSS assets');
  const violations = checkAssetBudget(assets, budget.perFileMaxKb, budget.totals);
  assert.deepEqual(violations, [], () =>
    `asset budget violations:\n${formatAssetReport(assets)}\n${violations.join('\n')}`);
});
