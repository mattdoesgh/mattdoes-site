// build.js — mattdoes.online static site generator entrypoint.
//
// Wires the pipeline to the real filesystem and environment:
//
//   readNotes(CONTENT_DIR)  →  intake(records)  →  emit(model, opts)
//     (lib/intake.js — notes → Content model)      (lib/emit/ — model → dist/)
//
// plus the Listening snapshot (lib/listening.js), fetched here and passed
// into Emit as data.
//
// Usage:   npm run build
// Config:  CONTENT_DIR env var overrides the default notes directory
//          (content/, which holds content/about.md).
//          DIST_DIR env var overrides the output directory (default <repo>/dist;
//          tests build into per-test temp dirs).
//          CACHE_DIR env var overrides the Last.fm cache directory
//          (default <repo>/.cache; tests use temp dirs so runs are hermetic).
//          LISTENING_OFFLINE=1 skips the listening snapshot's network sources
//          (Worker + Last.fm), using only the disk cache — set by the test
//          fixture builds and CI so they never reach out (see lib/listening.js).
//          LETTERBOXD_OFFLINE=1 skips the Letterboxd RSS fetch the same way
//          (see lib/watches.js).
//          Digs and other recommendations are JSON in the same content
//          directory. The note walk reads markdown only.
//          MEDIA_BASE env var overrides where ![[image.jpg]] URLs point
//          (defaults to '/img'; set to 'https://media.mattdoes.online' for the R2 bucket).
//          SITE_URL env var overrides the canonical origin.

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { readNotes, intake } from './lib/intake.js';
import { emit } from './lib/emit/index.js';
import { fetchListeningSnapshot } from './lib/listening.js';
import { fetchWatches } from './lib/watches.js';
import { loadDigs, favoritePicks } from './lib/digs.js';
import { loadRecommendations } from './lib/recommendations.js';
import { siteConfig } from './site.config.js';
import { emitConceptPreview } from './scripts/emit-concept-preview.js';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = process.env.CONTENT_DIR || path.resolve(__dirname, 'content');
const DIST_DIR   = path.resolve(process.env.DIST_DIR || path.join(__dirname, 'dist'));
const CACHE_DIR  = path.resolve(process.env.CACHE_DIR || path.join(__dirname, '.cache'));
const MEDIA_BASE = process.env.MEDIA_BASE || '/img';
const MEDIA_MANIFEST = process.env.MEDIA_MANIFEST
  ? path.resolve(process.env.MEDIA_MANIFEST)
  : path.join(CACHE_DIR, 'media-manifest.json');
const SITE_URL   = process.env.SITE_URL || siteConfig.url || 'https://mattdoes.online';

const t0 = Date.now();

const model = intake(readNotes(CONTENT_DIR));

const { tracks: lastfmTracks, playcount: scrobbleTotal } =
  await fetchListeningSnapshot({ siteUrl: SITE_URL, cacheDir: CACHE_DIR });

const watches = await fetchWatches({ cacheDir: CACHE_DIR });
const digs = loadDigs(path.join(__dirname, 'content', 'digs'));
const recommendations = loadRecommendations(path.join(__dirname, 'content', 'recommendations.json'));

const { distSize } = await emit(model, {
  distDir: DIST_DIR,
  contentDir: CONTENT_DIR,
  mediaBase: MEDIA_BASE,
  siteUrl: SITE_URL,
  lastfmTracks,
  scrobbleTotal,
  startedAt: t0,
  mediaManifest: MEDIA_MANIFEST,
  digs,
  recommendations,
  watches,
});

// Branch previews only. Production (main) and local/CI builds leave dist/
// as the current site. See scripts/emit-concept-preview.js.
const concept = emitConceptPreview({ distDir: DIST_DIR });
if (concept.emitted) {
  console.log(`  concept preview: ${concept.urlPath}`);
}

console.log(`✓ built in ${((Date.now() - t0) / 1000).toFixed(2)}s`);
console.log(`  ${model.notes.length} notes read → ${model.about.length} about`);
console.log(`  ${digs.length} dig weeks (${favoritePicks(digs).length} favorites) · ${watches.length} recent watches · ${recommendations.length} other picks`);
console.log(`  dist: ${distSize}  ·  ${DIST_DIR}`);
