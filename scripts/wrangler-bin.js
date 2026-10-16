// The wrangler program pinned in workers/package-lock.json.
//
// The package.json range is not the pin. A runtime install of that range,
// or `npx wrangler`, can resolve a different build while a Cloudflare
// token is in the environment. Callers spawn this binary directly.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WRANGLER_LOCK_KEY = 'node_modules/wrangler';

/**
 * Exact wrangler version pinned in workers/package-lock.json.
 *
 * @param {string} [repoRoot]
 * @returns {string} semver, e.g. `4.151.0`
 */
export function lockedWranglerVersion(repoRoot = DEFAULT_ROOT) {
  const lockPath = path.join(repoRoot, 'workers', 'package-lock.json');
  let lock;
  try {
    lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  } catch (err) {
    throw new Error(`Cannot read workers/package-lock.json (${err.message}).`);
  }
  const version = lock.packages?.[WRANGLER_LOCK_KEY]?.version;
  if (typeof version !== 'string' || !/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error('workers/package-lock.json does not pin an exact wrangler version.');
  }
  return version;
}

/**
 * Path to the lockfile's wrangler program. Refuses a missing or
 * version-mismatched install so a deploy cannot fetch a different package.
 *
 * @param {string} [repoRoot]
 * @returns {string} absolute path to bin/wrangler.js
 */
export function resolveWranglerBin(repoRoot = DEFAULT_ROOT) {
  const version = lockedWranglerVersion(repoRoot);
  const pkgPath = path.join(repoRoot, 'workers', 'node_modules', 'wrangler', 'package.json');
  const binPath = path.join(repoRoot, 'workers', 'node_modules', 'wrangler', 'bin', 'wrangler.js');
  if (!fs.existsSync(pkgPath) || !fs.existsSync(binPath)) {
    throw new Error(
      `Locked wrangler@${version} is not installed at workers/node_modules. `
      + 'Run `npm ci --prefix workers` first.',
    );
  }
  let installed;
  try {
    installed = JSON.parse(fs.readFileSync(pkgPath, 'utf8')).version;
  } catch (err) {
    throw new Error(`Cannot read the installed wrangler package (${err.message}).`);
  }
  if (installed !== version) {
    throw new Error(
      `Installed wrangler@${installed} does not match workers/package-lock.json wrangler@${version}. `
      + 'Run `npm ci --prefix workers` and retry.',
    );
  }
  return binPath;
}
