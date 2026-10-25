// Preview-only copy of /concepts/. Production Pages builds leave it out.
// The stylesheet in the repo points at site/ and static/ so a local server
// from the repo root can open it. The copy retargets those two paths at
// files the Pages output actually contains.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Pages injects CF_PAGES and CF_PAGES_BRANCH. It does not inject the
// production branch name. This project's production branch is main.
const PRODUCTION_BRANCH = 'main';

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {boolean}
 */
export function pagesPreviewRequested(env = process.env) {
  if (env.CF_PAGES !== '1') return false;
  const branch = env.CF_PAGES_BRANCH || '';
  if (!branch) return false;
  const production = env.CF_PAGES_PRODUCTION_BRANCH || PRODUCTION_BRANCH;
  return branch !== production;
}

/**
 * @param {string} distDir
 * @param {NodeJS.ProcessEnv} [env]
 * @param {string} [root]
 * @returns {boolean}
 */
export function copyConceptsForPreview(distDir, env = process.env, root = REPO_ROOT) {
  if (!pagesPreviewRequested(env)) return false;
  const srcDir = path.join(root, 'concepts');
  const dest = path.join(distDir, 'concepts');
  fs.mkdirSync(dest, { recursive: true });
  for (const name of ['index.html', 'unshared.js']) {
    fs.copyFileSync(path.join(srcDir, name), path.join(dest, name));
  }
  const cssPath = path.join(srcDir, 'unshared.css');
  const css = fs.readFileSync(cssPath, 'utf8');
  if (!css.includes('../site/tokens.css') || !css.includes('../static/fonts/Anton-latin.woff2')) {
    throw new Error('concepts stylesheet no longer has the local asset paths the preview copy rewrites');
  }
  const shipped = css
    .replace('@import "../site/tokens.css";', '@import "./tokens.css";')
    .replace('url("../static/fonts/Anton-latin.woff2")', 'url("/fonts/Anton-latin.woff2")');
  fs.writeFileSync(path.join(dest, 'unshared.css'), shipped);
  fs.copyFileSync(path.join(root, 'site', 'tokens.css'), path.join(dest, 'tokens.css'));
  const headersPath = path.join(distDir, '_headers');
  if (fs.existsSync(headersPath)) {
    const txt = fs.readFileSync(headersPath, 'utf8');
    if (!txt.includes('/concepts/*')) {
      const extra = `${txt.endsWith('\n') ? '' : '\n'}/concepts/*\n  X-Robots-Tag: noindex\n`;
      fs.appendFileSync(headersPath, extra);
    }
  }
  return true;
}
