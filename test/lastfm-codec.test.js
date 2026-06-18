// Pins lib/lastfm.js — the pure Last.fm wire-format codec shared by the
// build-time snapshot (lib/listening.js) and the listening Worker. The
// worker integration tests cover payload semantics end-to-end; these pins
// hold the decode rules themselves: field extraction fallbacks, the
// now-playing date stamp, the single-track quirk, and the KEY ORDER the
// Worker's JSON payload bytes depend on.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  decodeTrack, decodeTracks, decodePlaycount, recentTracksUrl, userInfoUrl,
} from '../lib/lastfm.js';

const RAW_TRACK = {
  name:   'Song A',
  artist: { '#text': 'Artist A' },
  album:  { '#text': 'Album A' },
  url:    'https://www.last.fm/music/a',
  image:  [{ '#text': 'small.jpg' }, { '#text': 'large.jpg' }],
  date:   { uts: '1700000000' },
};

test('lastfm: decodeTrack extracts every field with the Last.fm fallbacks', () => {
  assert.deepEqual(decodeTrack(RAW_TRACK), {
    artist: 'Artist A',
    track:  'Song A',
    album:  'Album A',
    link:   'https://www.last.fm/music/a',
    date:   '2023-11-14T22:13:20.000Z',
    nowPlaying: false,
  });
  // artist.name fallback (some endpoints send { name } instead of #text)
  assert.equal(decodeTrack({ ...RAW_TRACK, artist: { name: 'N' } }).artist, 'N');
  // missing fields decode to empty strings, not undefined
  assert.deepEqual(decodeTrack({}), {
    artist: '', track: '', album: '', link: '', date: '', nowPlaying: false,
  });
});

test('lastfm: decodeTrack key order is the Worker payload order', () => {
  // The Worker's JSON responses and KV entries serialize this object —
  // key order is part of its response bytes.
  assert.deepEqual(Object.keys(decodeTrack(RAW_TRACK)),
    ['artist', 'track', 'album', 'link', 'date', 'nowPlaying']);
  assert.deepEqual(Object.keys(decodeTrack(RAW_TRACK, { image: true })),
    ['artist', 'track', 'album', 'link', 'date', 'nowPlaying', 'image']);
});

test('lastfm: decodeTrack normalizes unsafe upstream track URLs', () => {
  assert.equal(decodeTrack({ ...RAW_TRACK, url: 'javascript:alert(1)' }).link, '');
  assert.equal(decodeTrack({ ...RAW_TRACK, url: 'data:text/html,<script>' }).link, '');
  assert.equal(decodeTrack({ ...RAW_TRACK, url: '//evil.example/x' }).link, '');
  assert.equal(decodeTrack({ ...RAW_TRACK, url: ' http://www.last.fm/music/a ' }).link,
    'http://www.last.fm/music/a');
});


test('lastfm: a now-playing track is stamped with the injected instant', () => {
  const nowTrack = { ...RAW_TRACK, date: undefined, '@attr': { nowplaying: 'true' } };
  const decoded = decodeTrack(nowTrack, { now: '2026-06-10T12:00:00.000Z' });
  assert.equal(decoded.nowPlaying, true);
  assert.equal(decoded.date, '2026-06-10T12:00:00.000Z');
  // Default stamp is "now" — just pin that it is a valid recent ISO string.
  const defaulted = decodeTrack(nowTrack);
  assert.ok(Math.abs(Date.now() - Date.parse(defaulted.date)) < 5000);
});

test('lastfm: image is opt-in and picks the largest (last) variant', () => {
  assert.equal('image' in decodeTrack(RAW_TRACK), false);
  assert.equal(decodeTrack(RAW_TRACK, { image: true }).image, 'large.jpg');
  assert.equal(decodeTrack({ ...RAW_TRACK, image: 'nope' }, { image: true }).image, '');
});

test('lastfm: decodeTracks handles the single-track-as-object quirk', () => {
  const body = { recenttracks: { track: RAW_TRACK, '@attr': { total: '7' } } };
  const { playcount, tracks } = decodeTracks(body);
  assert.equal(playcount, 7);
  assert.equal(tracks.length, 1);
  assert.equal(tracks[0].track, 'Song A');
});

test('lastfm: decodeTracks drops tracks missing an artist or title', () => {
  const body = { recenttracks: { track: [
    RAW_TRACK,
    { ...RAW_TRACK, name: '' },
    { ...RAW_TRACK, artist: undefined },
  ], '@attr': {} } };
  assert.equal(decodeTracks(body).tracks.length, 1);
});

test('lastfm: decodeTracks caps at limit only when one is given', () => {
  const body = { recenttracks: { track: [
    RAW_TRACK, { ...RAW_TRACK, name: 'Song B' }, { ...RAW_TRACK, name: 'Song C' },
  ], '@attr': { total: '3' } } };
  assert.equal(decodeTracks(body, { limit: 2 }).tracks.length, 2);
  // The build-time snapshot passes no limit and keeps the API's limit+1
  // now-playing overflow.
  assert.equal(decodeTracks(body).tracks.length, 3);
});

test('lastfm: decodeTracks and decodePlaycount survive empty bodies', () => {
  assert.deepEqual(decodeTracks(undefined), { playcount: 0, tracks: [] });
  assert.deepEqual(decodeTracks({}),        { playcount: 0, tracks: [] });
  assert.equal(decodePlaycount({ user: { playcount: '123' } }), 123);
  assert.equal(decodePlaycount({}), 0);
  assert.equal(decodePlaycount(undefined), 0);
});

test('lastfm: URL builders emit the exact pre-refactor query strings', () => {
  assert.equal(
    recentTracksUrl('a user', 'k&y', 25),
    'https://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks&user=a%20user&api_key=k%26y&format=json&limit=25');
  assert.equal(
    userInfoUrl('a user', 'k&y'),
    'https://ws.audioscrobbler.com/2.0/?method=user.getinfo&user=a%20user&api_key=k%26y&format=json');
});
