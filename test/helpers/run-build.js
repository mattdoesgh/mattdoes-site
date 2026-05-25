// Test helper — runs build.js as a child process against a chosen vault.
//
// The build writes to a fixed dist/ at the repo root, so tests that need a
// fresh build call buildFixtureVault() in a before() hook and then read
// dist/. Negative-fixture tests use runBuild() directly and only inspect the
// exit code + stderr — they never need the (non-existent) output.

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(__dirname, '..', '..');
export const DIST_DIR  = path.join(REPO_ROOT, 'dist');
export const FIXTURE_VAULT = path.join(REPO_ROOT, 'test', 'fixture-vault');

/**
 * Run `node build.js` as a subprocess.
 *
 * @param {object}  opts
 * @param {string}  opts.vaultDir   absolute path passed as VAULT_DIR
 * @param {string} [opts.siteUrl]   SITE_URL (default https://mattdoes.online)
 * @param {Record<string,string>} [opts.env] extra env vars
 * @returns {{ status: number|null, stdout: string, stderr: string }}
 */
export function runBuild({ vaultDir, siteUrl = 'https://mattdoes.online', env = {} }) {
  const res = spawnSync(process.execPath, ['build.js'], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      VAULT_DIR: vaultDir,
      SITE_URL: siteUrl,
      ...env,
    },
    encoding: 'utf8',
    timeout: 60_000,
  });
  return {
    status: res.status,
    stdout: res.stdout || '',
    stderr: res.stderr || '',
  };
}

/**
 * Build the canonical happy-path fixture vault. Throws if the build fails so
 * a broken build surfaces as a test error rather than silently empty dist/.
 *
 * @param {Record<string,string>} [env] extra env vars (e.g. a seeded cache)
 * @returns {{ status: number|null, stdout: string, stderr: string }}
 */
export function buildFixtureVault(env = {}) {
  const res = runBuild({ vaultDir: FIXTURE_VAULT, env });
  if (res.status !== 0) {
    throw new Error(
      `fixture-vault build failed (exit ${res.status}):\n${res.stderr || res.stdout}`,
    );
  }
  return res;
}

/** Read a generated dist file as UTF-8. @param {string} rel @returns {string} */
export function readDist(rel) {
  return fs.readFileSync(path.join(DIST_DIR, rel), 'utf8');
}

/** List every generated HTML file under dist/. @returns {string[]} absolute paths */
export function listDistHtml() {
  const out = [];
  const walk = (dir) => {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) walk(full);
      else if (name.endsWith('.html')) out.push(full);
    }
  };
  if (fs.existsSync(DIST_DIR)) walk(DIST_DIR);
  return out.sort();
}
