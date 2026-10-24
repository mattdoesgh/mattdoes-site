// The Pages build drops a blank or a 404 and re-encodes a real cover.

import test from 'node:test';
import assert, { AssertionError } from 'node:assert/strict';
import sharp from 'sharp';
import { publicCoverUrl } from '../lib/cover-mirror.js';
import { isProgressiveJpeg, settleChartCovers } from '../lib/cover-settle.js';

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

async function paint(progressive) {
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
    .jpeg({ progressive, quality: 80 })
    .toBuffer();
}

function marked(progressive = true) {
  return paint(progressive);
}

function isProgressive(bytes) {
  const data = Buffer.from(bytes);
  for (let i = 0; i < data.length - 1; i += 1) {
    if (data[i] === 0xff && data[i + 1] === 0xc2) return true;
  }
  return false;
}

function mediaMiss(url, bodyFor) {
  const value = String(url);
  if (value.startsWith('https://media.mattdoes.online/')) return new Response(null, { status: 404 });
  return new Response(bodyFor(value), { status: 200, headers: { 'content-type': 'image/jpeg' } });
}

test('a blank cover is dropped and the next album fills the slot', async () => {
  const blank = await solid(12, 12, 12);
  const real = await marked(false);
  assert.equal(isProgressiveJpeg(real), false);
  const settled = await settleChartCovers(periods([
    { name: 'Blank', artist: 'A', playcount: 2, url: '', image: LAST },
    { name: 'Next', artist: 'B', playcount: 1, url: '', image: NEXT },
  ]), {
    token: '',
    accountId: '',
    fetch: async (url) => mediaMiss(url, (value) => (value === LAST ? blank : real)),
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
  assert.equal(isProgressiveJpeg(real), true);
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
  assert.equal(isProgressiveJpeg(uploaded), false);
  assert.equal(isProgressive(uploaded), false);
  assert.equal(settled['1month'].albums[0].image, publicCoverUrl(uploaded));
});

test('a cover-art URL is not painted when it cannot be mirrored', async () => {
  const progressive = await marked(true);
  const baseline = await marked(false);
  const caa = 'https://coverartarchive.org/release/12345678-1234-1234-1234-123456789abc/front-250';
  const settled = await settleChartCovers(periods([
    { name: 'Archive', artist: 'A', playcount: 1, url: '', image: caa },
    { name: 'Next', artist: 'B', playcount: 1, url: '', image: NEXT },
  ]), {
    token: '',
    accountId: '',
    fetch: async (url) => mediaMiss(url, (value) => (value === NEXT ? baseline : progressive)),
  });
  assert.deepEqual(settled['1month'].albums.map((row) => row.name), ['Next']);
  assert.equal(settled['1month'].albums[0].image, NEXT);
});

test('a preview reuses a baseline cover already on the media host', async () => {
  const real = await marked(true);
  let head = '';
  const settled = await settleChartCovers(periods([
    { name: 'Lonesome', artist: 'Gustav Kemps', playcount: 1, url: '', image: LAST },
  ]), {
    token: '',
    accountId: '',
    fetch: async (url, init) => {
      const value = String(url);
      if (value === LAST) {
        return new Response(real, { status: 200, headers: { 'content-type': 'image/jpeg' } });
      }
      if (value.startsWith('https://media.mattdoes.online/covers/') && init?.method === 'HEAD') {
        head = value;
        return new Response(null, { status: 200 });
      }
      return new Response(null, { status: 404 });
    },
  });
  assert.match(head, /^https:\/\/media\.mattdoes\.online\/covers\/[a-f0-9]{64}\.jpg$/);
  assert.equal(settled['1month'].albums[0].image, head);
  assert.equal(settled['1month'].albums[0].image.includes('freetls.fastly.net'), false);
});

test('a progressive JPEG with no baseline copy is replaced by the next album', async () => {
  const progressive = await marked(true);
  const baseline = await marked(false);
  const settled = await settleChartCovers(periods([
    { name: 'Lonesome', artist: 'Gustav Kemps', playcount: 2, url: '', image: LAST },
    { name: 'Next', artist: 'B', playcount: 1, url: '', image: NEXT },
  ]), {
    token: '',
    accountId: '',
    fetch: async (url) => mediaMiss(url, (value) => (value === LAST ? progressive : baseline)),
  });
  assert.deepEqual(settled['1month'].albums.map((row) => row.name), ['Next']);
  assert.equal(settled['1month'].albums[0].image, NEXT);
  assert.equal(isProgressiveJpeg(progressive), true);
  assert.equal(isProgressiveJpeg(baseline), false);
});
