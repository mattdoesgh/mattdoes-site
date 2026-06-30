// Audit backlog: "Feed standards — Atom validator". Covers audit finding #5.
//
// Builds the fixture vault with a seeded Last.fm cache (own temp CACHE_DIR, so
// the repo .cache is never touched) so that scrobble data IS present at build
// time, parses the generated feed.xml, and asserts:
//   - the XML is well-formed (jsdom XML parse, no <parsererror>)
//   - a feed-level <author> exists
//   - every <entry> carries its own <author>
//   - no entry link is double-prefixed (https://...https://...)
//   - no two entries share an <id>
//   - listening/scrobble data never leaks into the feed (not a feed kind)

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { buildFixtureVault, readDist, seedLastfmCache, REPO_ROOT } from './helpers/run-build.js';

// Build once with the duplicate-scrobble cache seeded into a temp CACHE_DIR.
const fixtureCache = path.join(REPO_ROOT, 'test', 'fixtures', 'lastfm-cache', 'lastfm.json');
let feedXml = '';

test.before(() => {
  const res = buildFixtureVault({ cacheDir: seedLastfmCache(fixtureCache) });
  feedXml = readDist(res.distDir, 'feed.xml');
});

/** Parse an Atom feed as XML and return the document. Throws on malformed XML. */
function parseFeed(xml) {
  const dom = new JSDOM(xml, { contentType: 'application/xml' });
  const doc = dom.window.document;
  const err = doc.querySelector('parsererror');
  if (err) throw new Error(`feed.xml is not well-formed XML:\n${err.textContent}`);
  return doc;
}

test('feed.xml is well-formed XML', () => {
  const doc = parseFeed(feedXml);
  assert.equal(doc.documentElement.localName, 'feed');
});

test('feed has a feed-level <author>', () => {
  const doc = parseFeed(feedXml);
  // The feed-level author is a direct child of <feed>.
  const feedLevelAuthor = [...doc.documentElement.children]
    .find(el => el.localName === 'author');
  assert.ok(feedLevelAuthor, 'feed must declare a feed-level <author>');
  const name = feedLevelAuthor.querySelector('name');
  assert.ok(name && name.textContent.trim(),
    'feed-level <author> must contain a non-empty <name>');
});

test('every <entry> carries its own <author>', () => {
  const doc = parseFeed(feedXml);
  const entries = [...doc.querySelectorAll('entry')];
  assert.ok(entries.length > 0, 'feed should contain at least one entry');
  for (const entry of entries) {
    const author = [...entry.children].find(el => el.localName === 'author');
    const id = entry.querySelector('id')?.textContent || '(no id)';
    assert.ok(author, `entry ${id} must carry a per-entry <author>`);
    const name = author.querySelector('name');
    assert.ok(name && name.textContent.trim(),
      `entry ${id} <author> must contain a non-empty <name>`);
  }
});

test('no entry link is double-prefixed with the site URL', () => {
  const doc = parseFeed(feedXml);
  for (const link of doc.querySelectorAll('entry link')) {
    const href = link.getAttribute('href') || '';
    assert.ok(!/https?:\/\/[^\s]*https?:\/\//.test(href),
      `entry link must not be double-prefixed: "${href}"`);
  }
});

test('no two entries share an <id> (repeated scrobbles stay distinct)', () => {
  const doc = parseFeed(feedXml);
  const ids = [...doc.querySelectorAll('entry id')].map(n => n.textContent.trim());
  assert.ok(ids.length > 0, 'feed should contain entry ids');
  const unique = new Set(ids);
  assert.equal(unique.size, ids.length,
    `every entry <id> must be unique. Duplicates: ` +
    `${ids.filter((v, i) => ids.indexOf(v) !== i).join(', ')}`);
});

test('listening/scrobble data is excluded from the feed entirely', () => {
  // The seeded cache contains scrobbles (including a track played twice), so a
  // regression that re-admitted listening into the feed WOULD surface here.
  // Listening is not a feed kind: no listening tag-URI <id>s, and no entry
  // links to the /listening/ page.
  const doc = parseFeed(feedXml);
  const listeningIds = [...doc.querySelectorAll('entry id')]
    .map(n => n.textContent.trim())
    .filter(id => id.startsWith('tag:mattdoes.online'));
  assert.equal(listeningIds.length, 0,
    `feed must carry no listening entries, found ${listeningIds.length}`);

  const listeningLinks = [...doc.querySelectorAll('entry link')]
    .map(l => l.getAttribute('href') || '')
    .filter(href => /\/listening\/?$/.test(href));
  assert.equal(listeningLinks.length, 0,
    `feed must carry no /listening/ entry links, found ${listeningLinks.length}`);

  // Sanity: the feed still built and carries the article/thought entries.
  assert.ok(doc.querySelectorAll('entry').length > 0,
    'feed should still contain article/thought entries');
});
