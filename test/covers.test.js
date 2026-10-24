// Placeholder detection and chart backfill. The worker probes covers and
// only then asks album.getinfo or the Cover Art Archive.

import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveChartAlbums, sourceCoverUrl } from '../lib/covers.js';
import { CHART_CANDIDATES, CHART_POOL } from '../lib/lastfm.js';

const STAR = 'https://lastfm.freetls.fastly.net/i/u/300x300/2a96cbd8b46e442fc41c2b86b821562f.png';
const GREY = 'https://lastfm.freetls.fastly.net/i/u/300x300/4128a6eb29f94943c9d206c08e625904.png';
const LEGACY = 'https://lastfm.freetls.fastly.net/i/u/300x300/c6f59c1e5e7240a4c0d427abd71f3dbb.jpg';

function jpeg() {
  return new Response(Uint8Array.of(0xff, 0xd8, 0xff, 0xd9), {
    status: 200,
    headers: { 'content-type': 'image/jpeg' },
  });
}

function row(name, image, artist = 'Artist') {
  return {
    name,
    artist,
    playcount: 1,
    url: `https://www.last.fm/music/${encodeURIComponent(artist)}/${encodeURIComponent(name)}`,
    image,
  };
}

test('source urls allow fetch hosts and reject placeholders', () => {
  assert.equal(sourceCoverUrl(STAR), '');
  assert.equal(sourceCoverUrl(GREY), '');
  assert.equal(sourceCoverUrl(LEGACY), '');
  assert.equal(sourceCoverUrl('https://evil.example/a.jpg'), '');
  assert.equal(
    sourceCoverUrl('https://lastfm.freetls.fastly.net/i/u/300x300/abc.jpg'),
    'https://lastfm.freetls.fastly.net/i/u/300x300/abc.jpg',
  );
  const caa = 'https://coverartarchive.org/release/12345678-1234-1234-1234-123456789abc/front-250';
  assert.equal(sourceCoverUrl(caa), caa);
  assert.equal(sourceCoverUrl('https://ia800.us.archive.org/0/items/x/cover.jpg'), 'https://ia800.us.archive.org/0/items/x/cover.jpg');
  assert.equal(sourceCoverUrl('https://archive.org.evil.example/cover.jpg'), '');
});

test('known placeholders are not fetched and the next row fills the slot', async () => {
  const calls = [];
  const albums = await resolveChartAlbums([
    row('Star', STAR, 'A'),
    row('Grey', GREY, 'B'),
    row('Legacy', LEGACY, 'C'),
    row('Next', 'https://lastfm.freetls.fastly.net/i/u/300x300/next.jpg', 'D'),
  ], {
    key: 'secret-key',
    fetch: async (url) => {
      calls.push(String(url));
      if (String(url).includes('album.getinfo')) {
        return Response.json({ error: 6, message: 'Album not found' });
      }
      if (String(url).includes('musicbrainz.org')) return Response.json({ releases: [] });
      if (String(url).includes('next.jpg')) return jpeg();
      return new Response(null, { status: 404 });
    },
  });
  assert.deepEqual(albums.map((album) => album.name), ['Next']);
  assert.equal(calls.some((url) => url.includes('2a96cbd8b46e442fc41c2b86b821562f')), false);
  assert.equal(calls.some((url) => url.includes('4128a6eb29f94943c9d206c08e625904')), false);
  assert.equal(calls.some((url) => url.includes('c6f59c1e5e7240a4c0d427abd71f3dbb')), false);
  assert.equal(JSON.stringify(albums).includes('secret-key'), false);
});

test('a dead cover is replaced from album.getinfo and a miss falls through to the next row', async () => {
  const calls = [];
  const albums = await resolveChartAlbums([
    row('Dead', 'https://lastfm.freetls.fastly.net/i/u/300x300/dead.jpg', 'Dead Artist'),
    row('Gone', 'https://lastfm.freetls.fastly.net/i/u/300x300/gone.jpg', 'Gone Artist'),
    row('Next', 'https://lastfm-img.freetls.fastly.net/i/u/300x300/next.jpg', 'Next Artist'),
  ], {
    key: 'secret-key',
    fetch: async (url) => {
      const value = String(url);
      calls.push(value);
      if (value.includes('dead.jpg') || value.includes('gone.jpg')) return new Response(null, { status: 404 });
      if (value.includes('method=album.getinfo') && value.includes('Dead')) {
        return Response.json({
          album: {
            image: [{ '#text': 'https://lastfm.freetls.fastly.net/i/u/300x300/from-info.jpg' }],
          },
        });
      }
      if (value.includes('from-info.jpg')) return jpeg();
      if (value.includes('method=album.getinfo')) {
        return Response.json({ error: 6, message: 'Album not found' });
      }
      if (value.includes('musicbrainz.org')) return Response.json({ releases: [] });
      if (value.includes('next.jpg')) return jpeg();
      return new Response(null, { status: 500 });
    },
  });
  assert.deepEqual(albums.map((album) => album.name), ['Dead', 'Next']);
  assert.equal(albums[0].image, 'https://lastfm.freetls.fastly.net/i/u/300x300/from-info.jpg');
  assert.equal(albums[1].image, 'https://lastfm-img.freetls.fastly.net/i/u/300x300/next.jpg');
  assert.equal(calls.some((url) => url.includes('musicbrainz.org') && url.includes('Dead')), false);
});

test('MusicBrainz cover art fills a row when Last.fm has no image', async () => {
  const mbid = '12345678-1234-1234-1234-123456789abc';
  const albums = await resolveChartAlbums([
    row('Archive', '', 'Archive Artist'),
  ], {
    key: 'secret-key',
    fetch: async (url) => {
      const value = String(url);
      if (value.includes('method=album.getinfo')) {
        return Response.json({ error: 6, message: 'Album not found' });
      }
      if (value.includes('musicbrainz.org')) {
        assert.match(value, /release%3A%22Archive%22/);
        return Response.json({ releases: [{ id: mbid }] });
      }
      if (value === `https://coverartarchive.org/release/${mbid}/front-250`) return jpeg();
      return new Response(null, { status: 404 });
    },
  });
  assert.equal(albums.length, 1);
  assert.equal(albums[0].name, 'Archive');
  assert.equal(albums[0].image, `https://coverartarchive.org/release/${mbid}/front-250`);
});

test('fallback lookups stop once the grid is full and respect the lookup budget', async () => {
  const calls = [];
  const albums = [];
  for (let i = 1; i <= 25; i += 1) {
    albums.push(row(`Keep ${i}`, `https://lastfm.freetls.fastly.net/i/u/300x300/keep${i}.jpg`));
  }
  albums.push(row('Needs Fallback', ''));
  for (let i = 1; i <= 5; i += 1) {
    albums.push(row(`Spare ${i}`, `https://lastfm.freetls.fastly.net/i/u/300x300/spare${i}.jpg`));
  }
  const kept = await resolveChartAlbums(albums, {
    key: 'secret-key',
    fetch: async (url) => {
      calls.push(String(url));
      return jpeg();
    },
  });
  assert.equal(kept.length, 30);
  assert.equal(kept[24].name, 'Keep 25');
  assert.equal(kept[25].name, 'Spare 1');
  assert.equal(calls.some((url) => url.includes('album.getinfo')), false);
  assert.equal(calls.some((url) => url.includes('Needs')), false);

  const empty = Array.from({ length: 8 }, (_, i) => row(`Empty ${i + 1}`, '', `Empty ${i + 1}`));
  const infoCalls = [];
  await resolveChartAlbums(empty, {
    key: 'secret-key',
    fetch: async (url) => {
      const value = String(url);
      if (value.includes('album.getinfo')) infoCalls.push(value);
      if (value.includes('musicbrainz.org')) infoCalls.push(value);
      if (value.includes('album.getinfo')) return Response.json({ error: 6, message: 'Album not found' });
      return Response.json({ releases: [] });
    },
  });
  assert.equal(infoCalls.filter((url) => url.includes('album.getinfo')).length, 6);
  assert.equal(infoCalls.filter((url) => url.includes('musicbrainz.org')).length, 4);
});

test('the worker stores a deep pool past the visible grid', async () => {
  assert.ok(CHART_POOL >= 40 && CHART_POOL <= 50);
  assert.ok(CHART_CANDIDATES >= 40);
  assert.ok(CHART_CANDIDATES <= CHART_POOL);
  const albums = Array.from({ length: CHART_CANDIDATES }, (_, i) => (
    row(`Cover ${i + 1}`, `https://lastfm.freetls.fastly.net/i/u/300x300/c${i + 1}.jpg`)
  ));
  const kept = await resolveChartAlbums(albums, {
    fetch: async () => jpeg(),
  });
  assert.equal(kept.length, CHART_CANDIDATES);
  assert.equal(kept[0].name, 'Cover 1');
  assert.equal(kept[CHART_CANDIDATES - 1].name, `Cover ${CHART_CANDIDATES}`);
});
