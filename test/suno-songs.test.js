// The hub's song list is the committed public snapshot. Drafts stay out.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

import { renderHomeSuno, renderSunoSongs, selectPublicSongs, songsFromSnapshot } from '../lib/suno-songs.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const COVERS = path.join(ROOT, 'concepts', 'suno', 'covers');

test('a draft, a hidden clip, and a duplicate stay out of the list', () => {
  const clip = (extra) => ({
    id: '77e2f911-595d-416a-9e5a-f14beea308ff',
    title: 'Funerally Yours',
    status: 'complete',
    is_public: true,
    is_hidden: false,
    is_trashed: false,
    image_large_url: 'https://cdn2.suno.ai/image_large_x.jpeg',
    ...extra,
  });
  const { included, excluded } = selectPublicSongs([
    clip({}),
    clip({ title: 'again' }),
    clip({ id: '163ac26c-7035-4f88-a815-9ef5022b2610', is_public: false, title: 'Draft' }),
    clip({ id: '129d19dc-00fb-4466-aa36-d347917d978a', is_hidden: true, title: 'Hidden' }),
    clip({ id: '660b317f-da6e-4674-8b6b-7046fbb676bc', status: 'streaming', title: 'Working' }),
    clip({ id: '9deac5b9-be0f-4a96-920a-a32e7dfece45', image_large_url: 'https://evil.example/a.jpg', image_url: '', title: 'Elsewhere' }),
  ]);
  assert.deepEqual(included.map((song) => song.title), ['funerally yours']);
  assert.deepEqual(excluded.map((song) => song.reason), [
    'duplicate',
    'not public',
    'hidden',
    'status streaming',
    'no artwork',
  ]);
});

test('the committed snapshot is public songs with local covers', () => {
  const snapshot = JSON.parse(fs.readFileSync(path.join(ROOT, 'concepts', 'suno', 'songs.json'), 'utf8'));
  const songs = songsFromSnapshot(snapshot);
  assert.equal(songs.length, 24);
  assert.equal(songs.length, snapshot.songs.length);
  assert.equal(songs[0].title, 'funerally yours');
  assert.equal(songs.at(-1).title, 'zen');
  assert.equal(new Set(songs.map((song) => song.id)).size, songs.length);
  for (const song of songs) {
    assert.equal(song.href, `https://suno.com/song/${song.id}`);
    assert.equal(song.title, song.title.toLocaleLowerCase('en-US'));
    assert.equal(song.image.startsWith('/unshared/songs/'), true);
    assert.equal(fs.existsSync(path.join(COVERS, path.basename(song.image))), true);
    for (const item of song.imageSet) {
      assert.equal(fs.existsSync(path.join(COVERS, path.basename(item.url))), true, item.url);
    }
    assert.ok(song.imageSet.some((item) => item.type === 'image/avif' && item.width === 300));
    assert.ok(song.imageSet.some((item) => item.type === 'image/webp' && item.width === 300));
    assert.ok(song.imageSet.some((item) => item.type === 'image/jpeg' && item.width === 240));
  }
});

test('a title waves in hidden letters and keeps its accessible name', () => {
  const songs = songsFromSnapshot(JSON.parse(fs.readFileSync(path.join(ROOT, 'concepts', 'suno', 'songs.json'), 'utf8')));
  const html = renderSunoSongs(songs.slice(0, 1));
  const doc = new JSDOM(`<body>${html}</body>`).window.document;
  const link = doc.querySelector('.tracks a');
  assert.equal(link?.getAttribute('aria-label'), 'funerally yours');
  const wave = link?.querySelector('.song-wave');
  assert.equal(wave?.getAttribute('aria-hidden'), 'true');
  assert.equal(wave?.textContent, 'funerally yours');
  assert.deepEqual([...wave.querySelectorAll('.song-word')].map((word) => word.textContent), ['funerally', 'yours']);
  assert.equal(link?.querySelector('[style]'), null);
  const home = renderHomeSuno();
  const homeDoc = new JSDOM(`<body>${home}</body>`).window.document;
  assert.equal(homeDoc.querySelector('.home-suno-titles'), null);
  assert.equal(homeDoc.querySelector('.home-suno-sign a')?.textContent, 'unshared');
  assert.equal(homeDoc.querySelector('.home-suno-sign a')?.getAttribute('href'), '/unshared/');
});
