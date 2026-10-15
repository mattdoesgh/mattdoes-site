import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadDigs, favoritePicks, embedUrl } from '../lib/digs.js';
import { loadRecommendations } from '../lib/recommendations.js';

const CONTENT = path.join(process.cwd(), 'content');

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'digs-'));
}

test('the committed sample week loads, newest first, with one favorite', () => {
  const weeks = loadDigs(path.join(CONTENT, 'digs'));
  assert.ok(weeks.length >= 1);
  assert.equal(weeks[0].sample, true);
  assert.equal(weeks[0].weekOf, '2026-10-12');
  const favs = favoritePicks(weeks);
  assert.equal(favs.length, 1);
  assert.equal(favs[0].artist, 'Hiroshi Yoshimura');
  assert.equal(favs[0].weekOf, '2026-10-12');
  assert.ok(favs[0].appleMusicEmbed.startsWith('https://embed.music.apple.com/'));
  const bandcamp = weeks[0].picks.find((pick) => pick.bandcampEmbed);
  assert.ok(bandcamp.bandcampEmbed.startsWith('https://bandcamp.com/EmbeddedPlayer/'));
});

test('weeks sort newest first', () => {
  const dir = tempDir();
  const week = (day, artist) => ({
    weekOf: day,
    sample: false,
    picks: [{ artist, blurb: 'note', starter: 'album', appleMusic: 'https://music.apple.com/us/album/x/1' }],
  });
  fs.writeFileSync(path.join(dir, '2026-01-01.json'), JSON.stringify(week('2026-01-01', 'older')));
  fs.writeFileSync(path.join(dir, '2026-06-01.json'), JSON.stringify(week('2026-06-01', 'newer')));
  const weeks = loadDigs(dir);
  assert.deepEqual(weeks.map((w) => w.weekOf), ['2026-06-01', '2026-01-01']);
});

test('a disallowed embed host fails the build', () => {
  const dir = tempDir();
  fs.writeFileSync(path.join(dir, '2026-02-02.json'), JSON.stringify({
    weekOf: '2026-02-02',
    picks: [{
      artist: 'nope',
      blurb: 'note',
      starter: 'album',
      appleMusic: 'https://music.apple.com/us/album/x/1',
      appleMusicEmbed: 'https://evil.example/player',
    }],
  }));
  assert.throws(() => loadDigs(dir), /not an allowed player/);
  assert.throws(() => embedUrl('https://www.youtube.com/embed/x', 'f', 'embed'), /not an allowed player/);
});

test('recommendations stay a separate list and can be empty', () => {
  assert.deepEqual(loadRecommendations(path.join(CONTENT, 'recommendations.json')), []);
  const file = path.join(tempDir(), 'recommendations.json');
  fs.writeFileSync(file, JSON.stringify({
    picks: [{ title: 'a book', detail: 'worth it', href: 'https://example.com/book', kind: 'read' }],
  }));
  const picks = loadRecommendations(file);
  assert.equal(picks[0].title, 'a book');
  assert.equal(picks[0].kind, 'read');
  assert.equal(picks[0].sample, false);
});
