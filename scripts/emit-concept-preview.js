// Copy concepts/signal-station/ into dist/concepts/signal-station/.
//
// Cloudflare Pages sets CF_PAGES=1 and CF_PAGES_BRANCH to the branch it is
// building. Production is main, and that output must stay the current site.
// Local builds and CI leave the vars unset, so they stay production-shaped
// too. CONCEPT_PREVIEW=1 forces a copy. CONCEPT_PREVIEW=0 forbids one.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONCEPT_SRC = path.join(REPO_ROOT, 'concepts', 'signal-station');
const URL_PATH = '/concepts/signal-station/';

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {boolean}
 */
export function conceptPreviewRequested(env = process.env) {
  if (env.CONCEPT_PREVIEW === '0') return false;
  if (env.CONCEPT_PREVIEW === '1') return true;
  if (env.CF_PAGES === '1') {
    const branch = env.CF_PAGES_BRANCH || '';
    return branch.length > 0 && branch !== 'main';
  }
  return false;
}

/**
 * @param {object} [opts]
 * @param {string} opts.distDir
 * @param {NodeJS.ProcessEnv} [opts.env]
 * @returns {{ emitted: boolean, urlPath: string }}
 */
export function emitConceptPreview({ distDir, env = process.env } = {}) {
  if (!conceptPreviewRequested(env)) {
    return { emitted: false, urlPath: URL_PATH };
  }
  if (!distDir) throw new Error('emitConceptPreview: distDir is required');
  if (!fs.existsSync(CONCEPT_SRC)) {
    throw new Error(`concept preview requested but ${CONCEPT_SRC} is missing`);
  }
  const dest = path.join(path.resolve(distDir), 'concepts', 'signal-station');
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.cpSync(CONCEPT_SRC, dest, {
    recursive: true,
    filter: (src) => path.basename(src) !== 'render.mjs',
  });
  return { emitted: true, urlPath: URL_PATH };
}
