// Pins lib/lastfm.js — the pure Last.fm wire-format codec shared by the
// build-time snapshot (lib/listening.js) and the listening Worker. The
// worker integration tests cover payload semantics end-to-end; these pins
// hold the decode rules themselves: field extraction fallbacks, the
// now-playing date stamp, the single-track quirk, and the KEY ORDER the
// Worker's JSON payload bytes depend on.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  decodeTopAlbums, decodeTopArtists, decodeTrack, decodeTracks, lastfmError,
  musicUrl, recentTracksUrl, topAlbumsUrl, topArtistsUrl,
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

test('lastfm: lastfmError detects API error bodies', () => {
  assert.equal(lastfmError({ error: 10, message: 'Invalid API key' }), true);
  assert.equal(lastfmError({ user: { playcount: '1' } }), false);
  assert.equal(lastfmError(undefined), false);
});

test('lastfm: decodeTracks survives empty bodies', () => {
  assert.deepEqual(decodeTracks(undefined), { playcount: 0, tracks: [] });
  assert.deepEqual(decodeTracks({}),        { playcount: 0, tracks: [] });
});

test('lastfm: the recent-tracks URL builder emits the exact query string', () => {
  assert.equal(
    recentTracksUrl('a user', 'k&y', 25),
    'https://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks&user=a%20user&api_key=k%26y&format=json&limit=25');
});

test('lastfm: chart URL builders pin the period and drop nothing into the path', () => {
  assert.equal(
    topArtistsUrl('dj verism', 'k&y', '12month', 5),
    'https://ws.audioscrobbler.com/2.0/?method=user.gettopartists&user=dj%20verism&api_key=k%26y&period=12month&limit=5&format=json');
  assert.equal(
    topAlbumsUrl('dj verism', 'k&y', 'overall', 5),
    'https://ws.audioscrobbler.com/2.0/?method=user.gettopalbums&user=dj%20verism&api_key=k%26y&period=overall&limit=5&format=json');
});

test('lastfm: chart decode keeps names and drops profile urls', () => {
  assert.equal(musicUrl('https://www.last.fm/user/djverism'), '');
  assert.equal(musicUrl('javascript:alert(1)'), '');
  assert.equal(musicUrl('https://www.last.fm/music/Artist'), 'https://www.last.fm/music/Artist');
  const artists = decodeTopArtists({
    topartists: {
      artist: [
        { name: 'One', playcount: '8', url: 'https://www.last.fm/user/djverism' },
        { name: '  ', playcount: '1', url: '' },
      ],
      '@attr': { user: 'djverism' },
    },
  });
  assert.deepEqual(artists, [{ name: 'One', playcount: 8, url: '' }]);
  const albums = decodeTopAlbums({
    topalbums: {
      album: {
        name: 'Album',
        playcount: '3',
        artist: { '#text': 'Via Text' },
        url: 'https://www.last.fm/music/Via+Text/Album',
      },
    },
  });
  assert.deepEqual(albums, [{
    name: 'Album', artist: 'Via Text', playcount: 3,
    url: 'https://www.last.fm/music/Via+Text/Album',
  }]);
  assert.deepEqual(decodeTopArtists(undefined), []);
  assert.deepEqual(decodeTopAlbums({}), []);
});
