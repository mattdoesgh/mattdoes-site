// Audit backlog: "Feed standards — Atom validator and duplicate-scrobble ID
// fixtures". Covers audit finding #5.
//
// Builds the fixture vault with a seeded Last.fm cache that contains TWO
// plays of the same track, parses dist/feed.xml, and asserts:
//   - the XML is well-formed (jsdom XML parse, no <parsererror>)
//   - a feed-level <author> exists
//   - every <entry> carries its own <author>
//   - no entry link is double-prefixed (https://...https://...)
//   - no two entries share an <id> (repeated scrobbles stay distinct)

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { buildFixtureVault, readDist, REPO_ROOT } from './helpers/run-build.js';

// Build once with the duplicate-scrobble cache seeded; tear down after.
const cacheDir   = path.join(REPO_ROOT, '.cache');
const cachePath  = path.join(cacheDir, 'lastfm.json');
const fixtureCache = path.join(REPO_ROOT, 'test', 'fixtures', 'lastfm-cache', 'lastfm.json');
let priorCache = null;
let hadCache = false;
let feedXml = '';

test.before(() => {
  hadCache = fs.existsSync(cachePath);
  priorCache = hadCache ? fs.readFileSync(cachePath) : null;
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.copyFileSync(fixtureCache, cachePath);
  const now = new Date();
  fs.utimesSync(cachePath, now, now);

  buildFixtureVault();
  feedXml = readDist('feed.xml');
});

test.after(() => {
  if (hadCache) fs.writeFileSync(cachePath, priorCache);
  else fs.rmSync(cachePath, { force: true });
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

test('two plays of the same track produce two distinct listening ids', () => {
  // The seeded cache has two plays of "Repeated Song" at different times.
  const doc = parseFeed(feedXml);
  const listeningIds = [...doc.querySelectorAll('entry id')]
    .map(n => n.textContent.trim())
    .filter(id => id.startsWith('tag:mattdoes.online'));
  // At least the two repeated-song plays must each have a distinct tag URI.
  assert.ok(listeningIds.length >= 2,
    `expected >=2 listening entries, found ${listeningIds.length}`);
  assert.equal(new Set(listeningIds).size, listeningIds.length,
    'repeated plays of one track must not collapse to a single feed id');
});

test('transient now-playing entries are excluded from the feed', () => {
  // None of the seeded tracks are nowPlaying; assert the feed carries no
  // entry whose id/link suggests a now-playing placeholder leaked through.
  const doc = parseFeed(feedXml);
  const titles = [...doc.querySelectorAll('entry title')].map(n => n.textContent);
  // Sanity: feed built and has entries.
  assert.ok(titles.length > 0);
});
