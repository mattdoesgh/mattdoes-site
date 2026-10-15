import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { selectOriginalPosts } from '../lib/x-posts.js';
import { fetchPosts } from '../lib/posts.js';
import { makeTempDir, runBuild, readDist, FIXTURE_VAULT } from './helpers/run-build.js';

const FIXTURE = {
  data: [
    {
      id: '101',
      text: 'an original post about the site',
      created_at: '2026-10-14T15:00:00.000Z',
    },
    {
      id: '102',
      text: 'RT @someone this is a classic retweet body',
      created_at: '2026-10-14T14:00:00.000Z',
    },
    {
      id: '103',
      text: 'quoting someone else',
      created_at: '2026-10-14T13:00:00.000Z',
      referenced_tweets: [{ type: 'quoted', id: '999' }],
    },
    {
      id: '104',
      text: 'plain retweet wrapper',
      created_at: '2026-10-14T12:00:00.000Z',
      referenced_tweets: [{ type: 'retweeted', id: '998' }],
    },
    {
      id: '105',
      text: 'a reply that should not be a card',
      created_at: '2026-10-13T12:00:00.000Z',
      referenced_tweets: [{ type: 'replied_to', id: '997' }],
    },
    {
      id: '106',
      text: 'short text',
      note_tweet: { text: 'the long original note is what the card shows' },
      created_at: '2026-10-12T12:00:00.000Z',
    },
    {
      id: 'not-a-number',
      text: 'bad id must not become a link',
      created_at: '2026-10-11T12:00:00.000Z',
    },
  ],
};

test('selectOriginalPosts keeps originals and drops reposts, quotes, and replies', () => {
  const posts = selectOriginalPosts(FIXTURE, { handle: 'mattdoes', limit: 20 });
  assert.deepEqual(posts.map(post => post.id), ['101', '106']);
  assert.equal(posts[0].url, 'https://x.com/mattdoes/status/101');
  assert.equal(posts[1].text, 'the long original note is what the card shows');
  const blob = JSON.stringify(posts);
  assert.equal(blob.includes('RT @'), false);
  assert.equal(blob.includes('quoting someone'), false);
  assert.equal(blob.includes('plain retweet'), false);
  assert.equal(blob.includes('a reply'), false);
});

test('fetchPosts offline with no cache is empty and does not throw', async () => {
  const prev = process.env.X_OFFLINE;
  process.env.X_OFFLINE = '1';
  try {
    const posts = await fetchPosts({ cacheDir: makeTempDir('mattdoes-x-') });
    assert.deepEqual(posts, []);
  } finally {
    if (prev == null) delete process.env.X_OFFLINE;
    else process.env.X_OFFLINE = prev;
  }
});

test('a baked snapshot renders original posts and the homepage tile', () => {
  const posts = selectOriginalPosts(FIXTURE, { handle: 'mattdoes', limit: 20 });
  const cacheDir = makeTempDir('mattdoes-x-');
  fs.writeFileSync(path.join(cacheDir, 'x-posts.json'), JSON.stringify({
    fetchedAt: new Date().toISOString(),
    posts,
  }));
  const built = runBuild({ vaultDir: FIXTURE_VAULT, cacheDir });
  assert.equal(built.status, 0, built.stderr);

  const html = readDist(built.distDir, 'posts/index.html');
  const doc = new JSDOM(html).window.document;
  assert.equal(doc.querySelector('h1')?.textContent.trim(), 'posts');
  assert.match(html, /an original post about the site/);
  assert.match(html, /the long original note is what the card shows/);
  assert.doesNotMatch(html, /RT @someone/);
  assert.doesNotMatch(html, /quoting someone else/);
  assert.equal(doc.querySelector('.notebook'), null);
  assert.equal(doc.querySelector('iframe'), null);

  const home = new JSDOM(readDist(built.distDir, 'index.html')).window.document;
  const tile = home.querySelector('.home-shelves a[href="/posts/"]');
  assert.equal(tile?.querySelector('.label')?.textContent, 'posts');
  assert.equal(tile?.querySelector('.note')?.textContent, 'on x');
  const nav = [...home.querySelectorAll('nav[aria-label="primary"] a')].map(a => a.textContent.trim());
  assert.deepEqual(nav, ['writing', 'posts', 'listening', 'about']);
});
