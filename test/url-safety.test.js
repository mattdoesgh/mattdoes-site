// Audit backlog: "URL output safety — Malicious Last.fm links and authored
// Markdown URL fixtures". Covers audit finding #1.
//
// Three layers:
//   1. Unit tests of safeUrl()/esc() from templates/_helpers.js — the
//      primitives every other layer relies on.
//   2. A negative vault fixture with authored Markdown links carrying unsafe
//      schemes / attribute-breaking text — built and asserted.
//   3. A seeded .cache/lastfm.json carrying a javascript: URL, a quote-
//      breaking URL, and a normal URL — built into the real fixture vault
//      and asserted on the homepage + feed.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { esc, safeUrl } from '../templates/_helpers.js';
import { runBuild, buildFixtureVault, readDist, REPO_ROOT } from './helpers/run-build.js';

// ── 1. safeUrl / esc unit tests ─────────────────────────────────────────
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

// ── 2. authored Markdown link fixture ───────────────────────────────────
test('authored Markdown links with unsafe schemes are neutralized', () => {
  const res = runBuild({
    vaultDir: path.join(REPO_ROOT, 'test', 'fixtures', 'url-safety'),
  });
  assert.equal(res.status, 0, `url-safety fixture build failed:\n${res.stderr}`);

  const html = readDist('journal/dangerous-links/index.html');

  // No unsafe scheme reaches an href or src.
  assert.ok(!/href="javascript:/i.test(html), 'no javascript: href');
  assert.ok(!/href="data:/i.test(html),       'no data: href');
  assert.ok(!/href="vbscript:/i.test(html),   'no vbscript: href');
  assert.ok(!/src="javascript:/i.test(html),  'no javascript: img src');

  // The three unsafe links collapse to the harmless fallback href "#".
  const fallbackHrefs = (html.match(/href="#"/g) || []).length;
  assert.ok(fallbackHrefs >= 3,
    `expected >=3 fallback href="#" links, found ${fallbackHrefs}`);

  // The attribute-breaking URL is escaped — no raw quote escapes the href.
  assert.ok(!/onmouseover="alert/i.test(html),
    'attribute-breaking URL must not produce a live onmouseover attribute');

  // The genuinely safe link survives untouched.
  assert.ok(html.includes('href="https://example.com/page"'),
    'a normal external link must survive');
});

// ── 3. seeded Last.fm cache ─────────────────────────────────────────────
// build.js reads .cache/lastfm.json (mtime-fresh within cacheTtl). We seed
// it with a poisoned payload, build, and restore the prior state after.
test('Last.fm cache values are sanitized on the homepage and in the feed', () => {
  const cacheDir  = path.join(REPO_ROOT, '.cache');
  const cachePath = path.join(cacheDir, 'lastfm.json');
  const fixtureCache = path.join(REPO_ROOT, 'test', 'fixtures', 'lastfm-cache', 'lastfm.json');

  // Preserve any pre-existing cache so we don't disturb a local dev setup.
  const had = fs.existsSync(cachePath);
  const prior = had ? fs.readFileSync(cachePath) : null;

  try {
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.copyFileSync(fixtureCache, cachePath);
    // Touch so the mtime-freshness check treats it as fresh.
    const now = new Date();
    fs.utimesSync(cachePath, now, now);

    const res = buildFixtureVault();
    assert.equal(res.status, 0);

    const home = readDist('index.html');
    const feed = readDist('feed.xml');

    // The javascript: track URL must never reach an href on the homepage.
    assert.ok(!/href="javascript:/i.test(home),
      'homepage must not emit a javascript: listening href');

    // The quote-breaking Last.fm URL is HTML-escaped where it is emitted.
    assert.ok(!/onmouseover="alert/i.test(home),
      'homepage must not emit a live onmouseover from a poisoned Last.fm URL');

    // The feed never double-prefixes SITE_URL onto an absolute URL.
    assert.ok(!/https?:\/\/[^\s"]*https?:\/\//.test(feed),
      'feed must not contain a double-prefixed https://...https:// link');
  } finally {
    if (had) fs.writeFileSync(cachePath, prior);
    else fs.rmSync(cachePath, { force: true });
  }
});
