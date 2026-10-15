import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseLetterboxdRss, selectRecentWatches, ratingStars, letterboxdUrl,
} from '../lib/letterboxd.js';
import { fetchWatches } from '../lib/watches.js';

const fixture = fs.readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'letterboxd-rss.xml'),
  'utf8',
);

test('parseLetterboxdRss keeps films, drops lists, and strips watch stubs', () => {
  const items = parseLetterboxdRss(fixture);
  assert.equal(items.length, 3);
  assert.equal(items[0].title, 'Real & Review');
  assert.equal(items[0].year, '1974');
  assert.equal(items[0].rating, 5);
  assert.equal(items[0].stars, '★★★★★');
  assert.equal(items[0].rewatch, false);
  assert.equal(items[0].review, 'the third act holds.');
  assert.equal(items[0].link, 'https://letterboxd.com/mattdoes/film/real-review/');

  assert.equal(items[1].review, '');
  assert.equal(items[1].rewatch, true);
  assert.equal(items[1].stars, '★★★½');

  assert.equal(items[2].title, 'Bad Link');
  assert.equal(items[2].link, '');
});

test('selectRecentWatches caps the recent window and sorts by watched date', () => {
  const items = [
    { title: 'older', watchedDate: '2026-01-01' },
    { title: 'newer', watchedDate: '2026-02-01' },
    ...Array.from({ length: 30 }, (_, i) => ({ title: `w${i}`, watchedDate: '2026-03-01' })),
  ];
  const recent = selectRecentWatches(items, 25);
  assert.equal(recent.length, 25);
  assert.equal(recent[0].watchedDate, '2026-03-01');
  assert.equal(recent.at(-1).watchedDate, '2026-03-01');
  assert.ok(!recent.some((item) => item.title === 'older' || item.title === 'newer'));
});

test('rating and link helpers stay strict', () => {
  assert.equal(ratingStars('4.5'), '★★★★½');
  assert.equal(ratingStars(0), '');
  assert.equal(ratingStars('nope'), '');
  assert.equal(letterboxdUrl('https://evil.example/film'), '');
  assert.equal(letterboxdUrl('https://letterboxd.com/mattdoes/film/x/'), 'https://letterboxd.com/mattdoes/film/x/');
});

test('fetchWatches stays empty when offline and uncached', async () => {
  const prev = process.env.LETTERBOXD_OFFLINE;
  process.env.LETTERBOXD_OFFLINE = '1';
  try {
    const watches = await fetchWatches({ cacheDir: path.join(process.cwd(), 'test', 'fixtures', 'missing-cache') });
    assert.deepEqual(watches, []);
  } finally {
    if (prev == null) delete process.env.LETTERBOXD_OFFLINE;
    else process.env.LETTERBOXD_OFFLINE = prev;
  }
});
