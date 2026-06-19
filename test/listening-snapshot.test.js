// fetchListeningSnapshot — the build-time source resolution (lib/listening.js,
// ADR 0006). These run in-process with a stubbed global fetch so they can
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
    assert.deepEqual(snap, { tracks: [], playcount: 0 });
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
    assert.deepEqual(snap, { tracks: [], playcount: 0 });
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
    assert.deepEqual(snap, { tracks: [], playcount: 0 });
  } finally { restore(); restoreEnv(); }
});
