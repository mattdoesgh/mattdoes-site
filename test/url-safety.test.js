// URL output safety. safeUrl()/esc() reject unsafe schemes.

import test from 'node:test';
import assert from 'node:assert/strict';
import { esc, safeUrl } from '../lib/safe-url.js';

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
  assert.equal(safeUrl('/watching/'), '/watching/');
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
