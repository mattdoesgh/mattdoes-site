// Test helper — runs build.js as a child process.
//
// Every build targets its own temp dist/cache dir (DIST_DIR / CACHE_DIR env
// overrides in build.js), so test files are hermetic and can run in parallel:
// no shared repo-root dist/, no shared .cache/lastfm.json. Tests that need
// output call buildFixtureVault()/runBuild() and read via the returned
// distDir.
//
// Temp dirs are left behind for post-mortem debugging; the OS cleans tmpdir.

import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(__dirname, '..', '..');

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
 * @param {string} [opts.distDir]   output dir (default: fresh temp dir)
 * @param {string} [opts.cacheDir]  Last.fm cache dir (default: fresh temp
 *                                  dir, so builds never see the repo .cache)
 * @param {string} [opts.siteUrl]   SITE_URL (default https://mattdoes.online)
 * @param {Record<string,string>} [opts.env] extra env vars
 * @returns {{ status: number|null, stdout: string, stderr: string,
 *             distDir: string, cacheDir: string }}
 */
export function runBuild({
  distDir = makeTempDir('mattdoes-dist-'),
  cacheDir = makeTempDir('mattdoes-cache-'),
  siteUrl = 'https://mattdoes.online',
  env = {},
} = {}) {
  const childEnv = {
    ...process.env,
    DIST_DIR: distDir,
    CACHE_DIR: cacheDir,
    SITE_URL: siteUrl,
    // Keep build subprocesses hermetic: never let the listening snapshot
    // reach out to the Worker/Last.fm. Tests that want listening data seed a
    // fresh cache (seedLastfmCache), which short-circuits the network anyway.
    LISTENING_OFFLINE: '1',
    LETTERBOXD_OFFLINE: '1',
    ...env,
  };
  // Poster mirroring must not use a developer token during tests.
  delete childEnv.CLOUDFLARE_API_TOKEN;
  delete childEnv.CLOUDFLARE_ACCOUNT_ID;
  const res = spawnSync(process.execPath, ['build.js'], {
    cwd: REPO_ROOT,
    env: childEnv,
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
 * Build the in-repo site. Throws if the build fails so a broken build
 * surfaces as a test error rather than silently empty output.
 *
 * @param {Parameters<typeof runBuild>[0]} [opts]
 * @returns {ReturnType<typeof runBuild>}
 */
export function buildFixtureVault(opts = {}) {
  const res = runBuild({ ...opts });
  if (res.status !== 0) {
    throw new Error(
      `build failed (exit ${res.status}):\n${res.stderr || res.stdout}`,
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
