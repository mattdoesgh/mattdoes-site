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
    assert.match(url, /\/api\/listening\/recent$/);
    return jsonResponse({ playcount: 117481, tracks: [SAMPLE_TRACK] });
  });
  try {
    const snap = await fetchListeningSnapshot({ siteUrl: 'https://example.test', cacheDir });
    assert.equal(snap.playcount, 117481);
    assert.deepEqual(snap.tracks, [SAMPLE_TRACK]);
    assert.equal(calls.length, 1, 'exactly one upstream call');
    const cached = JSON.parse(fs.readFileSync(path.join(cacheDir, 'lastfm.json'), 'utf8'));
    assert.equal(cached.playcount, 117481, 'successful Worker fetch must be cached');
    assert.equal(cached.tracks.length, 1);
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

function chartResponse(url) {
  const period = new URL(url).searchParams.get('period');
  if (url.includes('method=user.gettopartists')) {
    return jsonResponse({
      topartists: {
        artist: {
          name: `Artist ${period}`,
          playcount: '12',
          url: 'https://www.last.fm/user/djverism',
        },
        '@attr': { user: 'djverism' },
      },
    });
  }
  return jsonResponse({
    topalbums: {
      album: [{
        name: `Album ${period}`,
        playcount: '7',
        artist: { name: 'Album Artist' },
        url: 'https://www.last.fm/music/Album+Artist/Album',
      }],
    },
  });
}

test('snapshot: period charts are fetched with the key and a failure keeps the tracks', async () => {
  const restoreEnv = cleanEnv();
  process.env.LASTFM_API_KEY = 'secret-key';
  process.env.LASTFM_USERNAME = 'djverism';
  const cacheDir = makeTempDir('mattdoes-cache-');
  const { calls, restore } = installFetch((url) => {
    if (url.includes('/api/listening/recent')) {
      return jsonResponse({ playcount: 120022, tracks: [SAMPLE_TRACK] });
    }
    if (url.includes('period=3month') && url.includes('gettopartists')) {
      return jsonResponse({ error: 8, message: 'Operation failed' }, 200);
    }
    if (url.includes('method=user.gettop')) return chartResponse(url);
    throw new Error(`unexpected url ${url}`);
  });
  try {
    const snap = await fetchListeningSnapshot({ siteUrl: 'https://example.test', cacheDir });
    assert.equal(snap.playcount, 120022);
    assert.equal(snap.tracks.length, 1);
    assert.equal(snap.periods.overall.artists[0].name, 'Artist overall');
    assert.equal(snap.periods.overall.artists[0].url, '', 'profile urls are dropped');
    assert.equal(snap.periods['12month'].albums[0].name, 'Album 12month');
    assert.deepEqual(snap.periods['3month'].artists, []);
    assert.equal(snap.periods['3month'].albums[0].name, 'Album 3month');
    assert.ok(snap.periods['1month']);
    const workerCalls = calls.filter((url) => url.includes('/api/listening/recent'));
    const chartCalls = calls.filter((url) => url.includes('method=user.gettop'));
    assert.equal(workerCalls.length, 1, 'the worker is still one recent-tracks call');
    assert.equal(chartCalls.length, 8, 'four periods, artists and albums');
    assert.ok(chartCalls.every((url) => url.includes('api_key=secret-key')));
    const cached = JSON.parse(fs.readFileSync(path.join(cacheDir, 'lastfm.json'), 'utf8'));
    assert.equal(cached.periods.overall.artists[0].name, 'Artist overall');
    assert.equal(JSON.stringify(cached).includes('djverism'), false);
    assert.equal(JSON.stringify(cached).includes('secret-key'), false);
  } finally { restore(); restoreEnv(); }
});

test('snapshot: a total chart failure still bakes the recent tracks', async () => {
  const restoreEnv = cleanEnv();
  process.env.LASTFM_API_KEY = 'secret-key';
  process.env.LASTFM_USERNAME = 'djverism';
  const cacheDir = makeTempDir('mattdoes-cache-');
  const { restore } = installFetch((url) => {
    if (url.includes('/api/listening/recent')) {
      return jsonResponse({ playcount: 50, tracks: [SAMPLE_TRACK] });
    }
    return jsonResponse({ error: 29, message: 'Rate limit exceeded' }, 200);
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
    overall: { artists: [{ name: 'Cached', playcount: 3, url: '' }], albums: [] },
    '12month': { artists: [], albums: [] },
    '3month': { artists: [], albums: [] },
    '1month': { artists: [], albums: [] },
  };
  fs.writeFileSync(path.join(cacheDir, 'lastfm.json'), JSON.stringify({
    playcount: 9, tracks: [SAMPLE_TRACK], periods,
  }));
  const { calls, restore } = installFetch(() => { throw new Error('network'); });
  try {
    const snap = await fetchListeningSnapshot({ siteUrl: 'https://example.test', cacheDir });
    assert.equal(calls.length, 0);
    assert.equal(snap.periods.overall.artists[0].name, 'Cached');
    assert.equal(snap.playcount, 9);
  } finally { restore(); restoreEnv(); }
});
