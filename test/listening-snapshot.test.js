// fetchListeningSnapshot — the build-time source resolution (lib/listening.js).
// These run in-process with a stubbed global fetch so they can
// exercise the Worker / Last.fm / cache fall-through without real network.
//
// Source order under test:
//   1. fresh cache → 2. Worker → 3. Last.fm direct → 4. stale cache → 5. empty
// (and LISTENING_OFFLINE=1 skips 2 + 3).

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fetchListeningSnapshot } from '../lib/listening.js';
import { makeTempDir } from './helpers/run-build.js';
import { installFetch, jsonResponse } from './helpers/worker-env.js';

// Ensure no ambient creds/offline flag leak in from the runner's environment.
function cleanEnv() {
  const saved = {
    LISTENING_OFFLINE: process.env.LISTENING_OFFLINE,
    LASTFM_API_KEY: process.env.LASTFM_API_KEY,
    LASTFM_USERNAME: process.env.LASTFM_USERNAME,
  };
  delete process.env.LISTENING_OFFLINE;
  delete process.env.LASTFM_API_KEY;
  delete process.env.LASTFM_USERNAME;
  return () => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
  };
}

function writeStaleCache(cacheDir, obj) {
  const file = path.join(cacheDir, 'lastfm.json');
  fs.writeFileSync(file, JSON.stringify(obj));
  const old = Date.now() / 1000 - 99_999; // well past any cacheTtl
  fs.utimesSync(file, old, old);
  return file;
}

const SAMPLE_TRACK = {
  artist: 'Tim Hecker', track: 'In mother earth phase', album: 'Konoyo',
  link: 'https://www.last.fm/music/Tim+Hecker', date: '2026-06-19T04:17:48.000Z',
  nowPlaying: false,
};

test('snapshot: uses the Worker payload and writes it to the cache', async () => {
  const restoreEnv = cleanEnv();
  const cacheDir = makeTempDir('mattdoes-cache-');
  const { calls, restore } = installFetch((url) => {
    if (url.endsWith('/api/listening/recent')) {
      return jsonResponse({ playcount: 117481, tracks: [SAMPLE_TRACK] });
    }
    if (url.endsWith('/api/listening/charts')) {
      return jsonResponse({ periods: {}, reason: 'unavailable' });
    }
    throw new Error(`unexpected url ${url}`);
  });
  try {
    const snap = await fetchListeningSnapshot({ siteUrl: 'https://example.test', cacheDir });
    assert.equal(snap.playcount, 117481);
    assert.deepEqual(snap.tracks, [SAMPLE_TRACK]);
    assert.equal(snap.periods, null, 'a reason-tagged charts payload is not baked');
    assert.equal(calls.filter((url) => url.endsWith('/api/listening/recent')).length, 1);
    assert.equal(calls.filter((url) => url.endsWith('/api/listening/charts')).length, 1);
    assert.equal(calls.some((url) => url.includes('gettop')), false);
    const cached = JSON.parse(fs.readFileSync(path.join(cacheDir, 'lastfm.json'), 'utf8'));
    assert.equal(cached.playcount, 117481, 'successful Worker fetch must be cached');
    assert.equal(cached.tracks.length, 1);
    assert.equal(cached.periods, undefined);
  } finally { restore(); restoreEnv(); }
});

test('snapshot: a reason-tagged Worker payload is rejected (falls through to empty)', async () => {
  const restoreEnv = cleanEnv();
  const cacheDir = makeTempDir('mattdoes-cache-');
  const { restore } = installFetch(() =>
    jsonResponse({ playcount: 0, tracks: [], reason: 'upstream_failed' }));
  try {
    // No creds and no cache → nothing trustworthy remains.
    const snap = await fetchListeningSnapshot({ siteUrl: 'https://example.test', cacheDir });
    assert.deepEqual(snap, { tracks: [], playcount: 0, periods: null });
  } finally { restore(); restoreEnv(); }
});

test('snapshot: Worker tracks with a zero playcount are rejected as corrupt', async () => {
  const restoreEnv = cleanEnv();
  const cacheDir = makeTempDir('mattdoes-cache-');
  // Populated rows but a 0 playcount and NO `reason` — must not bake a
  // self-contradictory "0 scrobbles" stat over real tracks.
  const { restore } = installFetch(() => jsonResponse({ playcount: 0, tracks: [SAMPLE_TRACK] }));
  try {
    const snap = await fetchListeningSnapshot({ siteUrl: 'https://example.test', cacheDir });
    assert.deepEqual(snap, { tracks: [], playcount: 0, periods: null });
  } finally { restore(); restoreEnv(); }
});

test('snapshot: a stale cache is served when the Worker is unreachable', async () => {
  const restoreEnv = cleanEnv();
  const cacheDir = makeTempDir('mattdoes-cache-');
  writeStaleCache(cacheDir, { playcount: 42, tracks: [SAMPLE_TRACK] });
  const { restore } = installFetch(() => { throw new Error('network down'); });
  try {
    const snap = await fetchListeningSnapshot({ siteUrl: 'https://example.test', cacheDir });
    assert.equal(snap.playcount, 42, 'stale cache must back-stop a Worker failure');
    assert.equal(snap.tracks.length, 1);
  } finally { restore(); restoreEnv(); }
});

test('snapshot: LISTENING_OFFLINE skips all network sources', async () => {
  const restoreEnv = cleanEnv();
  process.env.LISTENING_OFFLINE = '1';
  const cacheDir = makeTempDir('mattdoes-cache-');
  const { calls, restore } = installFetch(() => jsonResponse({}));
  try {
    const snap = await fetchListeningSnapshot({ siteUrl: 'https://example.test', cacheDir });
    assert.equal(calls.length, 0, 'offline build must not call fetch');
    assert.deepEqual(snap, { tracks: [], playcount: 0, periods: null });
  } finally { restore(); restoreEnv(); }
});

function jpegCover() {
  const bytes = new Uint8Array(32);
  bytes[0] = 0xff;
  bytes[1] = 0xd8;
  bytes[30] = 0xff;
  bytes[31] = 0xd9;
  return new Response(bytes, { status: 200, headers: { 'content-type': 'image/jpeg' } });
}

function chartOrCover(url, recent) {
  if (url.endsWith('/api/listening/recent')) return recent;
  if (url.endsWith('/api/listening/charts')) return jsonResponse(workerChartPayload());
  if (url.includes('/dead.jpg')) return new Response('missing', { status: 404 });
  if (url.includes('/i/u/')) return jpegCover();
  throw new Error(`unexpected url ${url}`);
}

function workerChartPayload() {
  return {
    periods: {
      overall: {
        artists: [{ name: 'Retired Artist', playcount: 1, url: '' }],
        albums: [{
          name: 'Retired Album',
          artist: 'Retired',
          playcount: 1,
          url: '',
          image: 'https://lastfm.freetls.fastly.net/i/u/300x300/retired.jpg',
        }],
      },
      '1month': {
        artists: [{
          name: 'Artist 1month',
          playcount: 12,
          url: 'https://www.last.fm/user/djverism',
          user: 'djverism',
        }],
        albums: [
          {
            name: 'Plain Album',
            artist: 'Plain',
            playcount: 9,
            url: '',
            image: '',
          },
          {
            name: 'Album 1month',
            artist: 'Album Artist',
            playcount: 7,
            url: 'https://www.last.fm/music/Album+Artist/Album',
            image: 'https://lastfm.freetls.fastly.net/i/u/300x300/abc.jpg',
            user: 'djverism',
          },
          {
            name: 'Broken Cover',
            artist: 'Broken',
            playcount: 4,
            url: 'https://www.last.fm/music/Broken/Broken+Cover',
            image: 'https://lastfm.freetls.fastly.net/i/u/300x300/dead.jpg',
          },
          {
            name: 'Default Album',
            artist: 'Default',
            playcount: 3,
            url: '',
            image: 'https://lastfm.freetls.fastly.net/i/u/300x300/default_album.png',
          },
          {
            name: 'Foreign Album',
            artist: 'Foreign',
            playcount: 2,
            url: '',
            image: 'https://evil.example/cover.jpg',
          },
          {
            name: 'Backfill Album',
            artist: 'Backfill',
            playcount: 1,
            url: '',
            image: 'https://lastfm-img.freetls.fastly.net/i/u/300x300/back.jpg',
          },
        ],
      },
    },
  };
}

test('snapshot: period charts come from the worker and a failure keeps the tracks', async () => {
  const restoreEnv = cleanEnv();
  process.env.LASTFM_API_KEY = 'secret-key';
  process.env.LASTFM_USERNAME = 'djverism';
  const cacheDir = makeTempDir('mattdoes-cache-');
  const { calls, restore } = installFetch((url) => chartOrCover(
    url,
    jsonResponse({ playcount: 120022, tracks: [SAMPLE_TRACK] }),
  ));
  try {
    const snap = await fetchListeningSnapshot({ siteUrl: 'https://example.test', cacheDir });
    assert.equal(snap.playcount, 120022);
    assert.equal(snap.tracks.length, 1);
    assert.equal(snap.periods.overall, undefined, 'retired periods are not kept');
    assert.equal(snap.periods['1month'].artists[0].name, 'Artist 1month');
    assert.equal(snap.periods['1month'].artists[0].url, '', 'profile urls are dropped');
    assert.equal(snap.periods['1month'].artists[0].user, undefined, 'extra fields are dropped');
    assert.deepEqual(
      snap.periods['1month'].albums.map((row) => row.name),
      ['Album 1month', 'Backfill Album'],
    );
    assert.equal(snap.periods['1month'].albums.some((row) => row.name === 'Broken Cover'), false);
    assert.equal(snap.periods['1month'].albums.some((row) => row.name === 'Default Album'), false);
    assert.equal(snap.periods['1month'].albums[0].image, 'https://lastfm.freetls.fastly.net/i/u/300x300/abc.jpg');
    assert.equal(
      snap.periods['1month'].albums[1].image,
      'https://lastfm-img.freetls.fastly.net/i/u/300x300/back.jpg',
    );
    assert.equal(calls.filter((url) => url.endsWith('/api/listening/recent')).length, 1);
    assert.equal(calls.filter((url) => url.endsWith('/api/listening/charts')).length, 1);
    assert.equal(calls.some((url) => url.includes('/dead.jpg')), true);
    assert.equal(calls.some((url) => url.includes('default_album')), false);
    assert.equal(calls.some((url) => url.includes('audioscrobbler') || url.includes('gettop')), false,
      'the build does not call Last.fm chart methods, even when a key is set');
    const cached = JSON.parse(fs.readFileSync(path.join(cacheDir, 'lastfm.json'), 'utf8'));
    assert.equal(cached.periods['1month'].artists[0].name, 'Artist 1month');
    assert.equal(cached.periods.overall, undefined);
    assert.equal(JSON.stringify(cached).includes('djverism'), false);
    assert.equal(JSON.stringify(cached).includes('secret-key'), false);
  } finally { restore(); restoreEnv(); }
});

test('snapshot: a total chart failure still bakes the recent tracks', async () => {
  const restoreEnv = cleanEnv();
  const cacheDir = makeTempDir('mattdoes-cache-');
  const { restore } = installFetch((url) => {
    if (url.endsWith('/api/listening/recent')) {
      return jsonResponse({ playcount: 50, tracks: [SAMPLE_TRACK] });
    }
    return jsonResponse({ periods: {}, reason: 'unavailable' });
  });
  try {
    const snap = await fetchListeningSnapshot({ siteUrl: 'https://example.test', cacheDir });
    assert.equal(snap.playcount, 50);
    assert.equal(snap.tracks.length, 1);
    assert.equal(snap.periods, null);
    const cached = JSON.parse(fs.readFileSync(path.join(cacheDir, 'lastfm.json'), 'utf8'));
    assert.equal(cached.periods, undefined);
  } finally { restore(); restoreEnv(); }
});

test('snapshot: a fresh cache with charts does not call the network', async () => {
  const restoreEnv = cleanEnv();
  process.env.LASTFM_API_KEY = 'secret-key';
  process.env.LASTFM_USERNAME = 'djverism';
  const cacheDir = makeTempDir('mattdoes-cache-');
  const periods = {
    '1month': { artists: [{ name: 'Cached', playcount: 3, url: '' }], albums: [] },
  };
  fs.writeFileSync(path.join(cacheDir, 'lastfm.json'), JSON.stringify({
    playcount: 9, tracks: [SAMPLE_TRACK], periods,
  }));
  const { calls, restore } = installFetch(() => { throw new Error('network'); });
  try {
    const snap = await fetchListeningSnapshot({ siteUrl: 'https://example.test', cacheDir });
    assert.equal(calls.length, 0);
    assert.equal(snap.periods['1month'].artists[0].name, 'Cached');
    assert.equal(snap.playcount, 9);
  } finally { restore(); restoreEnv(); }
});

test('snapshot: a fresh cache without charts fetches only the charts endpoint', async () => {
  const restoreEnv = cleanEnv();
  process.env.LASTFM_API_KEY = 'secret-key';
  const cacheDir = makeTempDir('mattdoes-cache-');
  fs.writeFileSync(path.join(cacheDir, 'lastfm.json'), JSON.stringify({
    playcount: 9, tracks: [SAMPLE_TRACK],
  }));
  const { calls, restore } = installFetch((url) => chartOrCover(url));
  try {
    const snap = await fetchListeningSnapshot({ siteUrl: 'https://example.test', cacheDir });
    assert.equal(calls.filter((url) => url.endsWith('/api/listening/charts')).length, 1);
    assert.equal(calls.some((url) => url.endsWith('/api/listening/recent')), false);
    assert.equal(snap.playcount, 9);
    assert.equal(snap.periods['1month'].artists[0].name, 'Artist 1month');
    assert.equal(snap.periods['1month'].albums.some((row) => row.name === 'Broken Cover'), false);
    assert.equal(calls.some((url) => url.includes('audioscrobbler') || url.includes('gettop')), false);
  } finally { restore(); restoreEnv(); }
});
