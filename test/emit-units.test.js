// In-process unit tests for Emit's pure helpers (lib/emit/), exercised at
// their interface instead of through the full subprocess build:
// buildSearchIndex, toListeningEntries, the feeds emitters
// and the wikilink/media-target string
// helpers in render.js (safe to import — Shiki only initializes lazily via
// initHighlighter(), which these tests never call; renderBody-free bodies
// never touch the highlighter).

import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSearchIndex } from '../lib/emit/search.js';
import { toListeningEntries } from '../lib/emit/listening-entries.js';
import { sitemapXml, robotsTxt } from '../lib/emit/feeds.js';
import { configureRender, resolveWikilinks, cleanMediaTarget } from '../lib/emit/render.js';

// ── buildSearchIndex ─────────────────────────────────────────────────────
test('buildSearchIndex indexes articles and not the retired notebook', () => {
  const articles = [
    { title: 'Hello', url: '/journal/hello/', summary: 'a greeting', kind: 'journal', tags: ['intro'] },
    { title: 'Bare', url: '/making/bare/', kind: 'making' }, // no summary/tags
  ];
  const idx = buildSearchIndex(articles);
  assert.equal(idx.length, 2);
  assert.deepEqual(idx[0], {
    title: 'Hello', url: '/journal/hello/', summary: 'a greeting',
    kind: 'journal', tags: ['intro'], text: 'Hello a greeting intro',
  });
  // Missing summary/tags degrade to '' / [] without undefined leaking in.
  assert.equal(idx[1].summary, '');
  assert.deepEqual(idx[1].tags, []);
  assert.equal(idx[1].text, 'Bare');
  assert.ok(!idx.some(row => row.kind === 'thought' || String(row.url).includes('/thoughts/')));
});

// ── toListeningEntries ───────────────────────────────────────────────────
test('toListeningEntries keeps dated tracks, sanitizes links, sorts newest-first', () => {
  const tracks = [
    { track: 'Old', artist: 'A', album: 'X', link: 'https://last.fm/old', date: '2026-01-01T00:00:00Z' },
    { track: 'Now', artist: 'B', album: 'Y', link: 'https://last.fm/now', nowPlaying: true }, // undated → dropped
    { track: 'New', artist: 'C', album: 'Z', link: 'javascript:alert(1)', date: '2026-01-03T00:00:00Z' },
  ];
  const entries = toListeningEntries(tracks);
  assert.deepEqual(entries.map(e => e.track), ['New', 'Old']);
  assert.equal(entries[0].kind, 'listening');
  assert.equal(entries[0].url, '/listening/');
  assert.ok(entries[0].date instanceof Date);
  // Untrusted snapshot link (contract C1): unsafe schemes never reach an href.
  assert.notEqual(entries[0].link, 'javascript:alert(1)');
  assert.equal(entries[1].link, 'https://last.fm/old');
  assert.deepEqual(toListeningEntries(tracks, 1).map(e => e.track), ['New']);
});

// ── feeds: sitemapXml / robotsTxt ────────────────────────────────────────
test('sitemapXml covers the static routes and omits unpublished writing', () => {
  const xml = sitemapXml({
    siteUrl: 'https://mattdoes.online',
    aboutWritten: false,
  });
  for (const r of ['/', '/search/', '/listening/', '/colophon/', '/digs/', '/movies/', '/grok/']) {
    assert.ok(xml.includes(`<loc>https://mattdoes.online${r}</loc>`), `sitemap must list ${r}`);
  }
  assert.ok(!xml.includes('/about/'), 'no /about/ entry when the note is absent');
  assert.ok(!xml.includes('/journal/'));
  assert.ok(!xml.includes('/design/'));
  assert.ok(sitemapXml({ siteUrl: 's', aboutWritten: true }).includes('<loc>s/about/</loc>'));
});

test('robotsTxt allows crawling, blocks /api/, advertises the sitemap', () => {
  const txt = robotsTxt('https://mattdoes.online');
  assert.ok(txt.includes('Disallow: /api/'));
  assert.ok(txt.includes('Sitemap: https://mattdoes.online/sitemap.xml'));
});

// ── render string helpers (no Shiki init needed) ────────────────────────
test('cleanMediaTarget normalizes slashes and rejects traversal', () => {
  assert.equal(cleanMediaTarget('attachments\\2026\\pic.png'), 'attachments/2026/pic.png');
  assert.equal(cleanMediaTarget('/leading/pic.png'), 'leading/pic.png');
  assert.equal(cleanMediaTarget('pic.png?x=1#frag'), 'pic.png?x=1#frag');
  assert.equal(cleanMediaTarget('../etc/passwd'), null);
  assert.equal(cleanMediaTarget('a/%2e%2e/b'), null, 'encoded traversal must be rejected');
  assert.equal(cleanMediaTarget(''), null);
});

test('resolveWikilinks rewrites links/embeds and masks code spans', () => {
  configureRender({
    mediaBase: '/img',
    slugIndex: new Map([['My Note', { url: '/journal/my-note/' }]]),
    mediaManifest: '/nonexistent-manifest.json',
  });
  const md = [
    'See [[My Note|the note]] and [[Missing]].',
    '`literal [[My Note]]`',
    '![[pic.png|A caption]]',
  ].join('\n\n');
  const out = resolveWikilinks(md);
  assert.ok(out.includes('<a href="/journal/my-note/">the note</a>'));
  assert.ok(out.includes('class="broken" title="unresolved: Missing"'));
  assert.ok(out.includes('`literal [[My Note]]`'), 'code spans must be left untouched');
  assert.ok(out.includes('<figcaption>A caption</figcaption>'));
  assert.ok(out.includes('src="/img/pic.png"'));
});
