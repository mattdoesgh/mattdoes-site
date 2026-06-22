// Post-build asset size checks for hashed JS/CSS in dist/.
// Used by scripts/check-asset-budget.js and test/asset-budget.test.js.

import fs from 'node:fs';
import path from 'node:path';

/**
 * @typedef {{ file: string, bytes: number, kb: number }} AssetSize
 */

/**
 * List every top-level .js and .css file in dist with byte sizes.
 *
 * @param {string} distDir
 * @returns {AssetSize[]}
 */
export function listAssetSizes(distDir) {
  const root = path.resolve(distDir);
  return fs.readdirSync(root)
    .filter(name => name.endsWith('.js') || name.endsWith('.css'))
    .map(file => {
      const bytes = fs.statSync(path.join(root, file)).size;
      return { file, bytes, kb: Math.round((bytes / 1024) * 10) / 10 };
    })
    .sort((a, b) => b.bytes - a.bytes);
}

/**
 * @param {AssetSize[]} assets
 * @param {Record<string, number>} perFileMaxKb  basename prefix → max KB
 * @param {{ totalJsKb?: number, totalCssKb?: number }} [totals]
 * @returns {string[]} violation messages (empty when within budget)
 */
export function checkAssetBudget(assets, perFileMaxKb = {}, totals = {}) {
  const violations = [];

  for (const asset of assets) {
    for (const [prefix, maxKb] of Object.entries(perFileMaxKb)) {
      if (!asset.file.startsWith(prefix)) continue;
      if (asset.kb > maxKb) {
        violations.push(`${asset.file}: ${asset.kb} KB exceeds ${prefix} budget of ${maxKb} KB`);
      }
    }
  }

  const totalJsKb = assets.filter(a => a.file.endsWith('.js'))
    .reduce((sum, a) => sum + a.kb, 0);
  const totalCssKb = assets.filter(a => a.file.endsWith('.css'))
    .reduce((sum, a) => sum + a.kb, 0);

  if (totals.totalJsKb != null && totalJsKb > totals.totalJsKb) {
    violations.push(`total JS: ${totalJsKb} KB exceeds budget of ${totals.totalJsKb} KB`);
  }
  if (totals.totalCssKb != null && totalCssKb > totals.totalCssKb) {
    violations.push(`total CSS: ${totalCssKb} KB exceeds budget of ${totals.totalCssKb} KB`);
  }

  return violations;
}

/**
 * Format a human-readable size table for logs.
 *
 * @param {AssetSize[]} assets
 * @returns {string}
 */
export function formatAssetReport(assets) {
  const lines = assets.map(a => `  ${a.file.padEnd(34)} ${String(a.kb).padStart(6)} KB`);
  const totalJs = assets.filter(a => a.file.endsWith('.js')).reduce((s, a) => s + a.kb, 0);
  const totalCss = assets.filter(a => a.file.endsWith('.css')).reduce((s, a) => s + a.kb, 0);
  return `${lines.join('\n')}\n  ${'─'.repeat(42)}\n  total JS ${totalJs} KB · total CSS ${totalCss} KB`;
}
