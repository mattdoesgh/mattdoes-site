// Publish the Unshared hub and its entries into dist/.
// Stylesheets in the repo point at site/ and static/ so a local server
// from the repo root can open them. The copy retargets those paths at
// files the Pages output actually contains.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { renderHubDocument } from '../concepts/hub.js';
import { unsharedEntries } from '../concepts/entries.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * @param {string} css
 * @param {string} file
 * @returns {string}
 */
function shipCss(css, file) {
  const importRe = /@import\s+["'][^"']*tokens\.css["'];/;
  const fontRe = /url\(["'][^"']*Anton-latin\.woff2["']\)/;
  if (!importRe.test(css) || !fontRe.test(css)) {
    throw new Error(`${file} no longer has the local asset paths the publish copy rewrites`);
  }
  return css
    .replace(importRe, '@import "/unshared/tokens.css";')
    .replace(fontRe, 'url("/fonts/Anton-latin.woff2")');
}

/**
 * @param {string} distDir
 * @param {string} [root]
 * @param {string} [siteUrl]
 * @returns {boolean}
 */
export function publishUnshared(distDir, root = REPO_ROOT, siteUrl) {
  const srcDir = path.join(root, 'concepts');
  for (const entry of unsharedEntries) {
    const page = path.join(srcDir, entry.slug, 'index.html');
    if (!fs.existsSync(page)) {
      throw new Error(`unshared entry "${entry.slug}" has no page at concepts/${entry.slug}/index.html`);
    }
  }

  const dest = path.join(distDir, 'unshared');
  fs.mkdirSync(dest, { recursive: true });
  fs.writeFileSync(path.join(dest, 'index.html'), renderHubDocument(siteUrl));
  fs.writeFileSync(
    path.join(dest, 'hub.css'),
    shipCss(fs.readFileSync(path.join(srcDir, 'hub.css'), 'utf8'), 'concepts/hub.css'),
  );
  fs.copyFileSync(path.join(root, 'site', 'tokens.css'), path.join(dest, 'tokens.css'));
  fs.copyFileSync(path.join(srcDir, 'flock-model.js'), path.join(dest, 'flock-model.js'));

  for (const entry of unsharedEntries) {
    const from = path.join(srcDir, entry.slug);
    const to = path.join(dest, entry.slug);
    fs.mkdirSync(to, { recursive: true });
    fs.copyFileSync(path.join(from, 'index.html'), path.join(to, 'index.html'));
    for (const name of fs.readdirSync(from)) {
      if (!name.endsWith('.js')) continue;
      fs.copyFileSync(path.join(from, name), path.join(to, name));
    }
    const cssName = fs.readdirSync(from).find((name) => name.endsWith('.css'));
    if (!cssName) throw new Error(`unshared entry "${entry.slug}" has no stylesheet`);
    const css = fs.readFileSync(path.join(from, cssName), 'utf8');
    fs.writeFileSync(path.join(to, cssName), shipCss(css, `concepts/${entry.slug}/${cssName}`));
  }
  return true;
}
