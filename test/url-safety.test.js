// URL output safety. safeUrl()/esc() reject unsafe schemes, and a seeded
// Last.fm cache must not publish those URLs on the listening pages.

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { esc, safeUrl } from '../lib/safe-url.js';
import {
  buildFixtureVault, readDist, seedLastfmCache, REPO_ROOT,
} from './helpers/run-build.js';

// safeUrl / esc
test('safeUrl neutralizes dangerous schemes', () => {
  assert.equal(safeUrl('javascript:alert(1)'), '#');
  assert.equal(safeUrl('JavaScript:alert(1)'), '#');
  assert.equal(safeUrl('  javascript:alert(1)  '), '#');
  assert.equal(safeUrl('data:text/html,<script>'), '#');
  assert.equal(safeUrl('vbscript:msgbox(1)'), '#');
});

test('safeUrl preserves allowed schemes and relative paths', () => {
  assert.equal(safeUrl('https://example.com/x'), 'https://example.com/x');
  assert.equal(safeUrl('http://example.com'), 'http://example.com');
  assert.equal(safeUrl('mailto:a@b.com'), 'mailto:a@b.com');
  assert.equal(safeUrl('tel:+15551234'), 'tel:+15551234');
  assert.equal(safeUrl('/listening/'), '/listening/');
  assert.equal(safeUrl('#anchor'), '#anchor');
  assert.equal(safeUrl('./rel'), './rel');
});

test('safeUrl rejects protocol-relative URLs and parent traversal', () => {
  assert.equal(safeUrl('//evil.example/path'), '#');
  assert.equal(safeUrl('../escape'), '#');
  assert.equal(safeUrl('/safe/../escape'), '#');
  assert.equal(safeUrl('./safe/%2e%2e/escape'), '#');
});

test('safeUrl returns empty string for nullish/empty input', () => {
  assert.equal(safeUrl(null), '');
  assert.equal(safeUrl(undefined), '');
  assert.equal(safeUrl(''), '');
  assert.equal(safeUrl('   '), '');
});

test('esc escapes every attribute-breaking character', () => {
  assert.equal(esc('a"b'), 'a&quot;b');
  assert.equal(esc("a'b"), 'a&#39;b');
  assert.equal(esc('a<b>c'), 'a&lt;b&gt;c');
  assert.equal(esc('a&b'), 'a&amp;b');
  // A URL that tries to break out of an href attribute is fully escaped.
  const payload = 'https://x/"onmouseover="alert(1)';
  const escaped = esc(payload);
  assert.ok(!escaped.includes('"'), 'no raw double quote survives esc()');
});

// The build reads <CACHE_DIR>/lastfm.json (mtime-fresh within cacheTtl). We
// seed a temp cache dir with a poisoned payload and build against it — the
// repo .cache is never touched, so this is safe under parallel test files.
test('Last.fm cache values are sanitized on the homepage', () => {
  const fixtureCache = path.join(REPO_ROOT, 'test', 'fixtures', 'lastfm-cache', 'lastfm.json');
  const res = buildFixtureVault({ cacheDir: seedLastfmCache(fixtureCache) });
  assert.equal(res.status, 0);

  const home = readDist(res.distDir, 'index.html');
  const listen = readDist(res.distDir, 'listening/index.html');

  assert.ok(!/href="javascript:/i.test(home),
    'homepage must not emit a javascript: listening href');
  assert.ok(!/href="javascript:/i.test(listen),
    'listen must not emit a javascript: href');
  assert.ok(!/onmouseover="alert/i.test(home));
  assert.ok(!/onmouseover="alert/i.test(listen),
    'listen must not emit a live onmouseover from a poisoned Last.fm URL');
  assert.ok(listen.includes('href="https://www.last.fm/music/Repeat+Artist/_/Repeated+Song"'),
    'a normal Last.fm link must survive');
});
