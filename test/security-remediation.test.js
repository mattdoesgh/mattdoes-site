// Notes are not rendered.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { runBuild, listDistHtml } from './helpers/run-build.js';

test('authored notes are not published into pages or feeds', () => {
  const res = runBuild();
  assert.equal(res.status, 0, `build failed:\n${res.stderr}`);
  assert.equal(fs.existsSync(path.join(res.distDir, 'feed.xml')), false);
  assert.equal(fs.existsSync(path.join(res.distDir, 'about', 'index.html')), false);
  for (const file of listDistHtml(res.distDir)) {
    const html = fs.readFileSync(file, 'utf8');
    assert.equal(/href="javascript:/i.test(html), false, file);
  }
});
