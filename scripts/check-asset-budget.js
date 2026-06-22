#!/usr/bin/env node
// Post-build asset budget check. Fails when hashed JS/CSS in dist/ exceed
// thresholds in asset-budget.json. Set ASSET_BUDGET_STRICT=0 to warn only.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  listAssetSizes, checkAssetBudget, formatAssetReport,
} from '../lib/asset-budget.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const DIST_DIR = path.resolve(process.env.DIST_DIR || path.join(REPO_ROOT, 'dist'));
const BUDGET_PATH = path.resolve(process.env.ASSET_BUDGET || path.join(REPO_ROOT, 'asset-budget.json'));
const STRICT = process.env.ASSET_BUDGET_STRICT !== '0';

if (!fs.existsSync(DIST_DIR)) {
  console.error(`check-asset-budget: dist not found at ${DIST_DIR}`);
  process.exit(1);
}

const budget = JSON.parse(fs.readFileSync(BUDGET_PATH, 'utf8'));
const assets = listAssetSizes(DIST_DIR);
const violations = checkAssetBudget(assets, budget.perFileMaxKb, budget.totals);

console.log('Asset sizes:\n' + formatAssetReport(assets));

if (violations.length === 0) {
  console.log('✓ asset budget OK');
  process.exit(0);
}

const prefix = STRICT ? '✗ asset budget exceeded' : '⚠ asset budget exceeded (warn-only)';
console.error(`${prefix}:\n  ${violations.join('\n  ')}`);
process.exit(STRICT ? 1 : 0);
