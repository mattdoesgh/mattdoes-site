// Shipped HTML must not grow an inline handler, a third-party asset without
// subresource integrity, or an external link that can retarget the opener.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { buildFixtureVault, listDistHtml, REPO_ROOT } from './helpers/run-build.js';

let distDir;
test.before(() => { ({ distDir } = buildFixtureVault()); });

test('pages have no inline event handlers or inline scripts', () => {
  const files = listDistHtml(distDir);
  assert.ok(files.length >= 3);
  for (const file of files) {
    const doc = new JSDOM(fs.readFileSync(file, 'utf8')).window.document;
    for (const el of doc.querySelectorAll('*')) {
      for (const attr of el.attributes) {
        assert.equal(/^on/i.test(attr.name), false, `${path.relative(distDir, file)} ${attr.name}`);
      }
    }
    for (const script of doc.querySelectorAll('script')) {
      assert.ok(script.getAttribute('src'), `${path.relative(distDir, file)} has an inline script`);
      assert.equal(script.textContent.trim(), '');
    }
    assert.equal(doc.querySelector('[style]'), null, path.relative(distDir, file));
  }
});

test('external links use rel=noopener and third-party assets carry integrity', () => {
  for (const file of listDistHtml(distDir)) {
    const doc = new JSDOM(fs.readFileSync(file, 'utf8')).window.document;
    for (const anchor of doc.querySelectorAll('a[href]')) {
      const href = anchor.getAttribute('href') || '';
      const rel = anchor.getAttribute('rel') || '';
      if (/^https?:\/\//i.test(href) || anchor.getAttribute('target') === '_blank') {
        assert.match(rel, /\bnoopener\b/, `${path.relative(distDir, file)} ${href}`);
      }
      assert.doesNotMatch(href, /^javascript:/i);
    }
    const assets = [
      ...doc.querySelectorAll('script[src]'),
      ...doc.querySelectorAll('link[rel="stylesheet"][href]'),
    ];
    for (const el of assets) {
      const url = el.getAttribute('src') || el.getAttribute('href') || '';
      if (url.startsWith('/') || url.startsWith('./')) continue;
      assert.ok(el.getAttribute('integrity'), `${url} needs subresource integrity`);
      assert.match(el.getAttribute('crossorigin') || '', /anonymous|use-credentials/, url);
    }
  }
});

test('the station client sets noopener when it writes an external link', () => {
  const src = fs.readFileSync(path.join(REPO_ROOT, 'static', 'station.js'), 'utf8');
  assert.match(src, /noopener noreferrer/);
  assert.doesNotMatch(src, /\son\w+\s*=/);
});
