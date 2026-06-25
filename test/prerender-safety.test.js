// Prerender safety — enhancement scripts defer network work until activation
// (ADR 0007). Covers the moderate speculation-rules rollout.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { REPO_ROOT } from './helpers/run-build.js';

const SCRIPTS = [
  'static/now-playing.js',
  'static/geo-background.js',
  'static/listening-live.js',
];

for (const rel of SCRIPTS) {
  test(`${rel} defers startup until prerender activation`, () => {
    const src = fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
    assert.match(src, /document\.prerendering/,
      `${rel} must check document.prerendering`);
    assert.match(src, /prerenderingchange/,
      `${rel} must listen for prerenderingchange`);
  });
}

test('document shell uses moderate speculation rules', () => {
  const src = fs.readFileSync(
    path.join(REPO_ROOT, 'design-system', 'ssg', 'document.tsx'), 'utf8');
  assert.match(src, /eagerness:\s*'moderate'/,
    'speculation rules should use moderate eagerness');
});

test('style-src omits unsafe-inline in shipped headers', () => {
  const headers = fs.readFileSync(path.join(REPO_ROOT, 'static', '_headers'), 'utf8');
  assert.match(headers, /style-src 'self'/);
  assert.doesNotMatch(headers, /style-src[^;]*unsafe-inline/);
});
