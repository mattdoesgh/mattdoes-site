// Test helper — runs build.js as a child process against a chosen vault.
//
// Every build targets its own temp dist/cache dir (DIST_DIR / CACHE_DIR env
// overrides in build.js), so test files are hermetic and can run in parallel:
// no shared repo-root dist/, no shared .cache/lastfm.json. Tests that need
// output call buildFixtureVault()/runBuild() and read via the returned
// distDir. Negative-fixture tests use runBuild() directly and only inspect
// the exit code + stderr.
//
// Temp dirs are left behind for post-mortem debugging; the OS cleans tmpdir.

import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(__dirname, '..', '..');
export const FIXTURE_VAULT = path.join(REPO_ROOT, 'test', 'fixture-vault');

/** Create a fresh temp directory. @param {string} [prefix] @returns {string} */
export function makeTempDir(prefix = 'mattdoes-test-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

/**
 * Seed a fresh temp cache dir with a fixture Last.fm cache, ready to pass as
 * runBuild's cacheDir. The copy's mtime is "now", so the build's TTL
 * freshness check (lib/listening.js) treats it as fresh.
 *
 * @param {string} fixtureJson absolute path to a fixture lastfm.json
 * @returns {string} the seeded cache dir
 */
export function seedLastfmCache(fixtureJson) {
  const cacheDir = makeTempDir('mattdoes-cache-');
  fs.copyFileSync(fixtureJson, path.join(cacheDir, 'lastfm.json'));
  return cacheDir;
}

/**
 * Run `node build.js` as a subprocess.
 *
 * @param {object}  opts
 * @param {string}  opts.vaultDir   absolute path passed as VAULT_DIR
 * @param {string} [opts.distDir]   output dir (default: fresh temp dir)
 * @param {string} [opts.cacheDir]  Last.fm cache dir (default: fresh temp
 *                                  dir, so builds never see the repo .cache)
 * @param {string} [opts.siteUrl]   SITE_URL (default https://mattdoes.online)
 * @param {Record<string,string>} [opts.env] extra env vars
 * @returns {{ status: number|null, stdout: string, stderr: string,
 *             distDir: string, cacheDir: string }}
 */
export function runBuild({
  vaultDir,
  distDir = makeTempDir('mattdoes-dist-'),
  cacheDir = makeTempDir('mattdoes-cache-'),
  siteUrl = 'https://mattdoes.online',
  env = {},
}) {
  const res = spawnSync(process.execPath, ['build.js'], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      VAULT_DIR: vaultDir,
      DIST_DIR: distDir,
      CACHE_DIR: cacheDir,
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
    distDir,
    cacheDir,
  };
}

/**
 * Build the canonical happy-path fixture vault. Throws if the build fails so
 * a broken build surfaces as a test error rather than silently empty output.
 *
 * @param {Omit<Parameters<typeof runBuild>[0], 'vaultDir'>} [opts]
 * @returns {ReturnType<typeof runBuild>}
 */
export function buildFixtureVault(opts = {}) {
  const res = runBuild({ vaultDir: FIXTURE_VAULT, ...opts });
  if (res.status !== 0) {
    throw new Error(
      `fixture-vault build failed (exit ${res.status}):\n${res.stderr || res.stdout}`,
    );
  }
  return res;
}

/**
 * Read a generated dist file as UTF-8.
 * @param {string} distDir @param {string} rel @returns {string}
 */
export function readDist(distDir, rel) {
  return fs.readFileSync(path.join(distDir, rel), 'utf8');
}

/**
 * List every generated HTML file under a dist dir.
 * @param {string} distDir @returns {string[]} absolute paths
 */
export function listDistHtml(distDir) {
  const out = [];
  const walk = (dir) => {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) walk(full);
      else if (name.endsWith('.html')) out.push(full);
    }
  };
  if (fs.existsSync(distDir)) walk(distDir);
  return out.sort();
}
