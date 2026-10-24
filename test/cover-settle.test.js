// The Pages build drops a blank or a 404 and re-encodes a real cover.

import test from 'node:test';
import assert, { AssertionError } from 'node:assert/strict';
import sharp from 'sharp';
import { settleChartCovers } from '../lib/cover-settle.js';

const LAST = 'https://lastfm.freetls.fastly.net/i/u/300x300/real.jpg';
const NEXT = 'https://lastfm-img.freetls.fastly.net/i/u/300x300/next.jpg';

function periods(albums) {
  return { '1month': { albums } };
}

async function solid(r, g, b) {
  return sharp({
    create: { width: 300, height: 300, channels: 3, background: { r, g, b } },
  }).jpeg({ progressive: true }).toBuffer();
}

async function marked() {
  const raw = Buffer.alloc(300 * 300 * 3, 245);
  for (let y = 40; y < 220; y += 1) {
    for (let x = 30; x < 190; x += 1) {
      const o = (y * 300 + x) * 3;
      raw[o] = 12;
      raw[o + 1] = 18;
      raw[o + 2] = 24;
    }
  }
  return sharp(raw, { raw: { width: 300, height: 300, channels: 3 } })
    .jpeg({ progressive: true, quality: 80 })
    .toBuffer();
}

function isProgressive(bytes) {
  const data = Buffer.from(bytes);
  for (let i = 0; i < data.length - 1; i += 1) {
    if (data[i] === 0xff && data[i + 1] === 0xc2) return true;
  }
  return false;
}

test('a blank cover is dropped and the next album fills the slot', async () => {
  const blank = await solid(12, 12, 12);
  const real = await marked();
  const settled = await settleChartCovers(periods([
    { name: 'Blank', artist: 'A', playcount: 2, url: '', image: LAST },
    { name: 'Next', artist: 'B', playcount: 1, url: '', image: NEXT },
  ]), {
    token: '',
    accountId: '',
    fetch: async (url) => {
      const body = String(url) === LAST ? blank : real;
      return new Response(body, { status: 200, headers: { 'content-type': 'image/jpeg' } });
    },
  });
  assert.deepEqual(settled['1month'].albums.map((row) => row.name), ['Next']);
  assert.equal(settled['1month'].albums[0].image, NEXT);
});

test('a missing cover is dropped and a network error keeps the Last.fm url', async () => {
  const real = await marked();
  const settled = await settleChartCovers(periods([
    { name: 'Missing', artist: 'A', playcount: 2, url: '', image: LAST },
    { name: 'Kept', artist: 'B', playcount: 1, url: '', image: NEXT },
  ]), {
    token: '',
    accountId: '',
    fetch: async (url) => {
      if (String(url) === LAST) return new Response(null, { status: 404 });
      if (String(url) === NEXT) throw new Error('timeout');
      return new Response(real, { status: 200, headers: { 'content-type': 'image/jpeg' } });
    },
  });
  assert.deepEqual(settled['1month'].albums.map((row) => row.name), ['Kept']);
  assert.equal(settled['1month'].albums[0].image, NEXT);
});

test('an assertion while fetching a cover is not swallowed', async () => {
  await assert.rejects(
    () => settleChartCovers(periods([
      { name: 'Real', artist: 'A', playcount: 1, url: '', image: LAST },
    ]), {
      token: '',
      fetch: () => { throw new AssertionError({ message: 'cover assert' }); },
    }),
    AssertionError,
  );
});

test('a real cover is re-encoded and mirrored', async () => {
  const real = await marked();
  assert.equal(isProgressive(real), true);
  let uploaded;
  const settled = await settleChartCovers(periods([
    { name: 'Real', artist: 'A', playcount: 1, url: '', image: LAST },
  ]), {
    token: 'token',
    accountId: 'account',
    fetch: async (url, init) => {
      const value = String(url);
      if (value === LAST) {
        return new Response(real, { status: 200, headers: { 'content-type': 'image/jpeg' } });
      }
      if (init?.method === 'PUT') {
        uploaded = Buffer.from(init.body);
        return new Response(null, { status: 200 });
      }
      return Response.json({ result: [] });
    },
  });
  assert.equal(isProgressive(uploaded), false);
  assert.match(
    settled['1month'].albums[0].image,
    /^https:\/\/media\.mattdoes\.online\/covers\/[a-f0-9]{64}\.jpg$/,
  );
});

test('a cover-art URL is not painted when it cannot be mirrored', async () => {
  const real = await marked();
  const caa = 'https://coverartarchive.org/release/12345678-1234-1234-1234-123456789abc/front-250';
  const settled = await settleChartCovers(periods([
    { name: 'Archive', artist: 'A', playcount: 1, url: '', image: caa },
    { name: 'Next', artist: 'B', playcount: 1, url: '', image: NEXT },
  ]), {
    token: '',
    accountId: '',
    fetch: async () => new Response(real, { status: 200, headers: { 'content-type': 'image/jpeg' } }),
  });
  assert.deepEqual(settled['1month'].albums.map((row) => row.name), ['Next']);
});
