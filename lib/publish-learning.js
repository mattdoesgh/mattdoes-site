// Publish /learning/ into dist/. Stylesheets in the repo point at site/
// and static/ so a local server from the repo root can open them. The
// copy retargets those paths at files the Pages output actually contains.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { assertCurriculum, publishedLessons } from '../learning/curriculum.js';
import { renderArraysDocument } from '../learning/arrays-page.js';
import { renderLearningHub } from '../learning/hub.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const PAGES = {
  arrays: renderArraysDocument,
};

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
    .replace(importRe, '@import "/learning/tokens.css";')
    .replace(fontRe, 'url("/fonts/Anton-latin.woff2")');
}

/**
 * @param {string} distDir
 * @param {string} [root]
 * @param {string} [siteUrl]
 * @returns {boolean}
 */
export function publishLearning(distDir, root = REPO_ROOT, siteUrl) {
  assertCurriculum();
  const lessons = publishedLessons();
  for (const lesson of lessons) {
    if (typeof PAGES[lesson.slug] !== 'function') {
      throw new Error(`learning lesson "${lesson.slug}" has no page`);
    }
  }

  const srcDir = path.join(root, 'learning');
  const dest = path.join(distDir, 'learning');
  fs.mkdirSync(dest, { recursive: true });
  fs.writeFileSync(path.join(dest, 'index.html'), renderLearningHub(siteUrl));
  fs.writeFileSync(
    path.join(dest, 'learning.css'),
    shipCss(fs.readFileSync(path.join(srcDir, 'learning.css'), 'utf8'), 'learning/learning.css'),
  );
  fs.copyFileSync(path.join(root, 'site', 'tokens.css'), path.join(dest, 'tokens.css'));
  fs.copyFileSync(path.join(srcDir, 'model.js'), path.join(dest, 'model.js'));

  for (const lesson of lessons) {
    const to = path.join(dest, lesson.slug);
    fs.mkdirSync(to, { recursive: true });
    fs.writeFileSync(path.join(to, 'index.html'), PAGES[lesson.slug](siteUrl));
    const script = path.join(srcDir, lesson.slug, `${lesson.slug}.js`);
    if (!fs.existsSync(script)) {
      throw new Error(`learning lesson "${lesson.slug}" has no script`);
    }
    fs.copyFileSync(script, path.join(to, `${lesson.slug}.js`));
  }
  return true;
}
