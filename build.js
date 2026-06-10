// build.js — mattdoes.online static site generator entrypoint.
//
// Wires the pipeline to the real filesystem and environment:
//
//   readVault(VAULT_DIR)  →  intake(records)  →  emit(model, opts)
//     (lib/intake.js — Vault → Content model)     (lib/emit.js — model → dist/)
//
// plus the Listening snapshot (lib/listening.js), fetched here and passed
// into Emit as data. See CONTEXT.md for the vocabulary.
//
// Usage:   npm run build
// Config:  VAULT_DIR env var overrides the default vault path.
//          MEDIA_BASE env var overrides where ![[image.jpg]] URLs point
//          (defaults to '/img'; set to 'https://media.mattdoes.online' for the R2 bucket).
//          SITE_URL env var overrides the canonical origin.

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { readVault, intake } from './lib/intake.js';
import { emit } from './lib/emit.js';
import { fetchLastfmTracks, fetchLastfmPlaycount } from './lib/listening.js';
import { siteConfig } from './site.config.js';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const VAULT_DIR  = process.env.VAULT_DIR || path.resolve(__dirname, 'vault');
const DIST_DIR   = path.resolve(__dirname, 'dist');
const MEDIA_BASE = process.env.MEDIA_BASE || '/img';
const SITE_URL   = process.env.SITE_URL || siteConfig.url || 'https://mattdoes.online';

const t0 = Date.now();

const model = intake(readVault(VAULT_DIR));

const lastfmTracks  = await fetchLastfmTracks();
const scrobbleTotal = await fetchLastfmPlaycount();

const { distSize } = await emit(model, {
  distDir: DIST_DIR,
  vaultDir: VAULT_DIR,
  mediaBase: MEDIA_BASE,
  siteUrl: SITE_URL,
  lastfmTracks,
  scrobbleTotal,
  startedAt: t0,
});

console.log(`✓ built in ${((Date.now() - t0) / 1000).toFixed(2)}s`);
console.log(`  ${model.notes.length} notes read → ${model.articles.length} articles, ${model.thoughts.length} thoughts`);
console.log(`  dist: ${distSize}  ·  ${DIST_DIR}`);
