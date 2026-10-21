// Internal links in the build output must resolve. External URLs are left
// to the network. Anchors must land on an id in the target document.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { buildFixtureVault, listDistHtml } from './helpers/run-build.js';

const ORIGIN = 'https://mattdoes.online';

let distDir;
test.before(() => { ({ distDir } = buildFixtureVault()); });

function pageUrl(file) {
  const rel = path.relative(distDir, file).split(path.sep).join('/');
  if (rel === 'index.html') return `${ORIGIN}/`;
  if (rel.endsWith('/index.html')) return `${ORIGIN}/${rel.slice(0, -'index.html'.length)}`;
  return `${ORIGIN}/${rel}`;
}

function localTarget(file, href) {
  if (!href || /^(mailto:|tel:|javascript:|data:)/i.test(href)) return null;
  let url;
  try { url = new URL(href, pageUrl(file)); } catch { return { broken: href }; }
  if (url.origin !== ORIGIN) return null;
  return { pathname: url.pathname, hash: url.hash };
}

function fileForPath(pathname) {
  if (pathname.endsWith('/')) {
    const rel = pathname === '/' ? 'index.html' : `${pathname.slice(1)}index.html`;
    return path.join(distDir, rel);
  }
  return path.join(distDir, pathname.slice(1));
}

test('no internal link 404s', () => {
  const misses = [];
  for (const file of listDistHtml(distDir)) {
    const doc = new JSDOM(fs.readFileSync(file, 'utf8')).window.document;
    const attrs = [
      ...doc.querySelectorAll('[href]'),
      ...doc.querySelectorAll('[src]'),
    ];
    for (const el of attrs) {
      const raw = el.getAttribute('href') || el.getAttribute('src');
      const target = localTarget(file, raw);
      if (!target) continue;
      if (target.broken) {
        misses.push(`${path.relative(distDir, file)} → ${target.broken}`);
        continue;
      }
      const dest = fileForPath(target.pathname);
      if (!fs.existsSync(dest)) {
        misses.push(`${path.relative(distDir, file)} → ${target.pathname}`);
        continue;
      }
      if (!target.hash) continue;
      const id = target.hash.slice(1);
      const destDoc = new JSDOM(fs.readFileSync(dest, 'utf8')).window.document;
      if (!destDoc.getElementById(id)) {
        misses.push(`${path.relative(distDir, file)} → ${target.pathname}${target.hash}`);
      }
    }
  }
  assert.deepEqual(misses, []);
});

test('sitemap locs are pages that were built', () => {
  const sitemap = fs.readFileSync(path.join(distDir, 'sitemap.xml'), 'utf8');
  const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
  assert.ok(locs.length >= 3);
  assert.equal(locs.some((loc) => loc.includes('/unshared/')), false);
  for (const loc of locs) {
    const url = new URL(loc);
    assert.equal(fs.existsSync(fileForPath(url.pathname)), true, loc);
  }
});
