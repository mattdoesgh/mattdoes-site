// The 5×5 stays full when some chart rows have no real art. A worker that
// only stored 25 albums is deepened from Last.fm at build time. A worker
// that already stored a deep pool is not asked again.

import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { JSDOM } from 'jsdom';
import { fetchListeningSnapshot } from '../lib/listening.js';
import { CHART_POOL, TOP_LIMIT } from '../lib/lastfm.js';
import { renderListen } from '../site/render.js';
import { makeTempDir } from './helpers/run-build.js';
import { installFetch, jsonResponse } from './helpers/worker-env.js';

const STAR = 'https://lastfm.freetls.fastly.net/i/u/300x300/2a96cbd8b46e442fc41c2b86b821562f.png';
const BROKEN = 'https://lastfm.freetls.fastly.net/i/u/300x300/broken.jpg';
const BLANK = 'https://lastfm.freetls.fastly.net/i/u/300x300/blank.jpg';
const USER = 'chart-secret-user';
const KEY = 'chart-secret-key';

function cleanEnv() {
  const saved = {
    LISTENING_OFFLINE: process.env.LISTENING_OFFLINE,
    LASTFM_API_KEY: process.env.LASTFM_API_KEY,
    LASTFM_USERNAME: process.env.LASTFM_USERNAME,
    CLOUDFLARE_API_TOKEN: process.env.CLOUDFLARE_API_TOKEN,
    CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID,
  };
  delete process.env.LISTENING_OFFLINE;
  delete process.env.LASTFM_API_KEY;
  delete process.env.LASTFM_USERNAME;
  delete process.env.CLOUDFLARE_API_TOKEN;
  delete process.env.CLOUDFLARE_ACCOUNT_ID;
  return () => {
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  };
}

function realUrl(n) {
  return `https://lastfm.freetls.fastly.net/i/u/300x300/real${n}.jpg`;
}

function workerAlbum(name, image) {
  return {
    name,
    artist: 'Chart Artist',
    playcount: 4,
    url: `https://www.last.fm/music/Chart+Artist/${encodeURIComponent(name)}`,
    image,
  };
}

function lastfmAlbum(name, image) {
  return {
    name,
    playcount: '4',
    artist: { name: 'Chart Artist' },
    url: `https://www.last.fm/music/Chart+Artist/${encodeURIComponent(name)}`,
    image: [{ size: 'extralarge', '#text': image }],
  };
}

function realAlbum(n, shape) {
  const name = `Real ${n}`;
  return shape === 'lastfm' ? lastfmAlbum(name, realUrl(n)) : workerAlbum(name, realUrl(n));
}

async function pixels() {
  const blank = await sharp({
    create: { width: 300, height: 300, channels: 3, background: { r: 12, g: 12, b: 12 } },
  }).jpeg().toBuffer();
  const raw = Buffer.alloc(300 * 300 * 3, 245);
  for (let y = 40; y < 220; y += 1) {
    for (let x = 30; x < 190; x += 1) {
      const offset = (y * 300 + x) * 3;
      raw[offset] = 12;
      raw[offset + 1] = 18;
      raw[offset + 2] = 24;
    }
  }
  const real = await sharp(raw, { raw: { width: 300, height: 300, channels: 3 } })
    .jpeg({ quality: 80 })
    .toBuffer();
  return { blank, real };
}

function imageResponse(bytes) {
  return new Response(bytes, { status: 200, headers: { 'content-type': 'image/jpeg' } });
}

function renderTiles(periods) {
  const html = renderListen({
    siteUrl: 'https://mattdoes.online',
    assets: { 'station.css': 'station.css', 'station.js': 'station.js' },
    tracks: [],
    playcount: 120022,
    periods,
  });
  const doc = new JSDOM(html).window.document;
  const tiles = [...doc.querySelectorAll('.album-tile')];
  return {
    html,
    tiles,
    visible: tiles.filter((tile) => !tile.hasAttribute('hidden')),
    hidden: tiles.filter((tile) => tile.hasAttribute('hidden')),
  };
}

function names(tiles) {
  return tiles.map((tile) => tile.querySelector('.album-name')?.textContent);
}

test('25 tiles render when placeholders, black files, and broken urls are skipped', async () => {
  assert.ok(CHART_POOL >= 40 && CHART_POOL <= 50);
  const { blank, real } = await pixels();
  const restoreEnv = cleanEnv();
  process.env.LASTFM_API_KEY = KEY;
  process.env.LASTFM_USERNAME = USER;
  const cacheDir = makeTempDir('mattdoes-cache-');
  const workerAlbums = [
    workerAlbum('Placeholder', STAR),
    workerAlbum('Broken', BROKEN),
    workerAlbum('Blank', BLANK),
    ...Array.from({ length: 22 }, (_, i) => realAlbum(i + 1, 'worker')),
  ];
  const lastfmAlbums = [
    lastfmAlbum('Placeholder', STAR),
    lastfmAlbum('Broken', BROKEN),
    lastfmAlbum('Blank', BLANK),
    ...Array.from({ length: 22 }, (_, i) => realAlbum(i + 1, 'lastfm')),
    ...Array.from({ length: CHART_POOL - 25 }, (_, i) => realAlbum(i + 23, 'lastfm')),
  ];
  assert.equal(workerAlbums.length, 25);
  assert.equal(lastfmAlbums.length, CHART_POOL);

  const { calls, restore } = installFetch((url) => {
    const value = String(url);
    if (value.endsWith('/api/listening/recent')) {
      return jsonResponse({ playcount: 120022, tracks: [] });
    }
    if (value.endsWith('/api/listening/charts')) {
      return jsonResponse({ periods: { '1month': { albums: workerAlbums } } });
    }
    if (value.includes('method=user.gettopalbums')) {
      const parsed = new URL(value);
      assert.equal(parsed.searchParams.get('period'), '1month');
      assert.equal(parsed.searchParams.get('limit'), String(CHART_POOL));
      assert.equal(parsed.searchParams.get('user'), USER);
      return jsonResponse({ topalbums: { album: lastfmAlbums } });
    }
    if (value === BROKEN) return new Response(null, { status: 404 });
    if (value === BLANK) return imageResponse(blank);
    if (/\/real\d+\.jpg$/.test(value)) return imageResponse(real);
    if (value.includes('api.cloudflare.com')) throw new Error('mirror offline');
    throw new Error(`unexpected url ${value.split('?')[0]}`);
  });

  try {
    const snap = await fetchListeningSnapshot({ siteUrl: 'https://example.test', cacheDir });
    const { html, visible, hidden } = renderTiles(snap.periods);
    assert.equal(visible.length, TOP_LIMIT);
    assert.deepEqual(names(visible), Array.from({ length: TOP_LIMIT }, (_, i) => `Real ${i + 1}`));
    assert.deepEqual(names(hidden), ['Real 26', 'Real 27', 'Real 28', 'Real 29', 'Real 30']);
    assert.equal(html.includes('Placeholder'), false);
    assert.equal(html.includes('Broken'), false);
    assert.equal(html.includes('>Blank<'), false);
    assert.equal(html.includes(USER), false);
    assert.equal(html.includes(KEY), false);
    const charts = calls.filter((url) => url.includes('method=user.gettopalbums'));
    assert.equal(charts.length, 1);
    assert.equal(calls.some((url) => url.includes('2a96cbd8b46e442fc41c2b86b821562f')), false);
  } finally {
    restore();
    restoreEnv();
  }
});

test('a deep worker chart already at 25 does not call Last.fm', async () => {
  const { blank, real } = await pixels();
  const restoreEnv = cleanEnv();
  process.env.LASTFM_API_KEY = KEY;
  process.env.LASTFM_USERNAME = USER;
  const cacheDir = makeTempDir('mattdoes-cache-');
  const workerAlbums = [
    workerAlbum('Placeholder', STAR),
    workerAlbum('Broken', BROKEN),
    workerAlbum('Blank', BLANK),
    ...Array.from({ length: TOP_LIMIT }, (_, i) => realAlbum(i + 1, 'worker')),
  ];
  const { calls, restore } = installFetch((url) => {
    const value = String(url);
    if (value.endsWith('/api/listening/recent')) {
      return jsonResponse({ playcount: 10, tracks: [] });
    }
    if (value.endsWith('/api/listening/charts')) {
      return jsonResponse({ periods: { '1month': { albums: workerAlbums } } });
    }
    if (value === BROKEN) return new Response(null, { status: 404 });
    if (value === BLANK) return imageResponse(blank);
    if (/\/real\d+\.jpg$/.test(value)) return imageResponse(real);
    if (value.includes('api.cloudflare.com')) throw new Error('mirror offline');
    throw new Error(`unexpected url ${value.split('?')[0]}`);
  });
  try {
    const snap = await fetchListeningSnapshot({ siteUrl: 'https://example.test', cacheDir });
    const { visible } = renderTiles(snap.periods);
    assert.equal(visible.length, TOP_LIMIT);
    assert.deepEqual(names(visible), Array.from({ length: TOP_LIMIT }, (_, i) => `Real ${i + 1}`));
    assert.equal(calls.some((url) => url.includes('gettopalbums') || url.includes('audioscrobbler')), false);
  } finally {
    restore();
    restoreEnv();
  }
});
