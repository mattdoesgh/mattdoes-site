// Prerender safety — enhancement scripts defer network work until activation
// (ADR 0007). Covers the moderate speculation-rules rollout.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { REPO_ROOT } from './helpers/run-build.js';

// now-playing.js and listening-live.js get their deferral from the shared
// poller lifecycle (static/poller.js); geo-background.js wires its own.
const SCRIPTS = [
  'static/poller.js',
  'static/geo-background.js',
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

// The polling scripts must route their lifecycle through the shared poller —
// a local reimplementation would dodge the deferral checks above.
for (const rel of ['static/now-playing.js', 'static/listening-live.js']) {
  test(`${rel} polls through the shared poller`, () => {
    const src = fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
    assert.match(src, /createPoller/, `${rel} must use createPoller`);
    assert.doesNotMatch(src, /setInterval/,
      `${rel} must not run its own interval`);
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
