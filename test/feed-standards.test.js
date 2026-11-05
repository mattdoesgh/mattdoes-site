// The site does not publish a post Atom feed.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { buildFixtureVault, listDistHtml } from './helpers/run-build.js';

test('the site does not publish a post feed', () => {
  const { distDir } = buildFixtureVault();
  assert.equal(fs.existsSync(path.join(distDir, 'feed.xml')), false);
  assert.equal(fs.existsSync(path.join(distDir, 'rss.xml')), false);
  assert.equal(fs.existsSync(path.join(distDir, 'atom.xml')), false);

  for (const file of listDistHtml(distDir)) {
    const html = fs.readFileSync(file, 'utf8');
    assert.equal(html.includes('/feed.xml'), false, `${file} must not link the retired feed`);
    assert.equal(html.includes('application/atom+xml'), false, `${file} must not autodiscover a feed`);
  }
});
