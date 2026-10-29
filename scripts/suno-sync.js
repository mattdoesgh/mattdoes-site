// Refresh the committed Unshared song snapshot.
// The public profile API is unauthenticated. The page does not call it.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { encodeCoverFiles } from '../lib/cover-settle.js';
import { selectPublicSongs } from '../lib/suno-songs.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const COVER_DIR = path.join(ROOT, 'concepts', 'suno', 'covers');
const SNAPSHOT = path.join(ROOT, 'concepts', 'suno', 'songs.json');
const PROFILE = 'https://studio-api.prod.suno.com/api/profiles/unshared';
const USER_AGENT = 'mattdoes-site/1.0 (+https://mattdoes.online)';

/**
 * @param {number} page
 * @returns {Promise<{ clips: object[], total: number }>}
 */
async function fetchPage(page) {
  const url = `${PROFILE}?playlists_sort_by=created_at&clips_sort_by=created_at&page=${page}`;
  const res = await fetch(url, {
    headers: {
      accept: 'application/json',
      'user-agent': USER_AGENT,
      origin: 'https://suno.com',
      referer: 'https://suno.com/@unshared',
    },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`suno profile ${res.status} on page ${page}`);
  const data = await res.json();
  return {
    clips: Array.isArray(data.clips) ? data.clips : [],
    total: Number(data.num_total_clips) || 0,
  };
}

/**
 * @param {string} url
 * @returns {Promise<Buffer>}
 */
async function download(url) {
  const res = await fetch(url, {
    headers: { 'user-agent': USER_AGENT, accept: 'image/*' },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`cover ${res.status}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  if (!bytes.length) throw new Error('cover empty');
  return bytes;
}

/**
 * @param {string} id
 * @param {{ ext: string, width: number }} file
 * @returns {string}
 */
function fileName(id, file) {
  if (file.ext === 'jpg' && file.width === 300) return `${id}.jpg`;
  return `${id}-${file.width}.${file.ext}`;
}

const clips = [];
let total = Infinity;
for (let page = 1; page <= 10 && clips.length < total; page += 1) {
  const batch = await fetchPage(page);
  total = batch.total || total;
  if (!batch.clips.length) break;
  clips.push(...batch.clips);
  if (batch.clips.length < 20) break;
}

const { included, excluded } = selectPublicSongs(clips);
fs.mkdirSync(COVER_DIR, { recursive: true });
const kept = new Set();
const songs = [];
for (const song of included) {
  let bytes;
  try {
    bytes = await download(song.image);
  } catch (err) {
    excluded.push({ id: song.id, title: song.title, reason: `artwork fetch failed (${err.message})` });
    continue;
  }
  const files = await encodeCoverFiles(bytes);
  if (!files.some((file) => file.ext === 'jpg' && file.width === 300)) {
    excluded.push({ id: song.id, title: song.title, reason: 'encode produced no baseline jpeg' });
    continue;
  }
  const imageSet = [];
  for (const file of files) {
    const name = fileName(song.id, file);
    fs.writeFileSync(path.join(COVER_DIR, name), file.bytes);
    kept.add(name);
    imageSet.push({
      url: `/unshared/songs/${name}`,
      width: file.width,
      type: file.type,
    });
  }
  songs.push({
    id: song.id,
    title: song.title,
    image: `/unshared/songs/${song.id}.jpg`,
    imageSet,
  });
}

for (const name of fs.readdirSync(COVER_DIR)) {
  if (!kept.has(name)) fs.unlinkSync(path.join(COVER_DIR, name));
}

fs.writeFileSync(SNAPSHOT, `${JSON.stringify({ songs }, null, 2)}\n`);
console.log(`suno: ${songs.length} songs, ${excluded.length} excluded`);
for (const row of excluded) console.log(`  exclude ${row.id || '(no id)'} ${row.title}: ${row.reason}`);
