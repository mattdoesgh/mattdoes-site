#!/usr/bin/env node
// scripts/optimize-media.js
//
// Walks vault/attachments/ and produces derived assets (currently: .webp
// siblings for raster images) under .cache/media-build/. Idempotent:
// re-running only regenerates variants whose source has changed, keyed by
// sha256 in .cache/media-manifest.json.
//
// Designed to be safe to run with or without sharp installed and with or
// without vault/attachments/ present. Missing either → no-op with a note.
//
// Used by scripts/pages-prebuild.sh in Pages builds, and invokable locally
// via `npm run optimize-media`.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const VAULT_DIR = process.env.VAULT_DIR || path.resolve(REPO_ROOT, 'vault');
const ATTACH_DIR = path.join(VAULT_DIR, 'attachments');
const BUILD_DIR = path.resolve(REPO_ROOT, '.cache', 'media-build');
const MANIFEST  = path.resolve(REPO_ROOT, '.cache', 'media-manifest.json');

const RASTER_EXT = new Set(['.png', '.jpg', '.jpeg']);
const WEBP_QUALITY = 80;

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function loadManifest() {
  if (!fs.existsSync(MANIFEST)) return { version: 1, entries: {} };
  try {
    const data = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
    if (!data.entries) data.entries = {};
    return data;
  } catch (err) {
    console.warn(`  (note: manifest unreadable — starting fresh: ${err.message})`);
    return { version: 1, entries: {} };
  }
}

function saveManifest(m) {
  fs.mkdirSync(path.dirname(MANIFEST), { recursive: true });
  fs.writeFileSync(MANIFEST, JSON.stringify(m, null, 2));
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    if (name.startsWith('.')) continue;
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

async function main() {
  if (!fs.existsSync(ATTACH_DIR)) {
    console.log(`  optimize-media: no attachments dir at ${path.relative(REPO_ROOT, ATTACH_DIR)} — nothing to do.`);
    return;
  }

  // Load sharp lazily so a missing install just skips variant generation
  // rather than crashing the build. Originals still sync.
  let sharp;
  try {
    ({ default: sharp } = await import('sharp'));
  } catch {
    console.warn('  optimize-media: sharp not installed — skipping variant generation. (npm i -D sharp)');
    return;
  }

  const manifest = loadManifest();
  fs.mkdirSync(BUILD_DIR, { recursive: true });

  const files = walk(ATTACH_DIR);
  let generated = 0, skipped = 0, passed = 0;

  for (const src of files) {
    const rel  = path.relative(ATTACH_DIR, src);
    const ext  = path.extname(rel).toLowerCase();
    const buf  = fs.readFileSync(src);
    const hash = sha256(buf);

    if (!RASTER_EXT.has(ext)) { passed += 1; continue; }

    const variantRel = rel.replace(/\.(png|jpe?g)$/i, '.webp');
    const variantDest = path.join(BUILD_DIR, variantRel);
    const entry = manifest.entries[rel];

    if (entry && entry.sha256 === hash && fs.existsSync(variantDest)) {
      skipped += 1;
      continue;
    }

    fs.mkdirSync(path.dirname(variantDest), { recursive: true });
    await sharp(buf).webp({ quality: WEBP_QUALITY }).toFile(variantDest);
    generated += 1;

    manifest.entries[rel] = {
      sha256: hash,
      variants: [{ path: variantRel, type: 'image/webp' }],
      optimizedAt: new Date().toISOString(),
    };
  }

  // Prune manifest entries + build-dir files whose source is gone.
  const live = new Set(files.map(f => path.relative(ATTACH_DIR, f)));
  let pruned = 0;
  for (const key of Object.keys(manifest.entries)) {
    if (!live.has(key)) {
      for (const v of manifest.entries[key].variants || []) {
        const p = path.join(BUILD_DIR, v.path);
        try { fs.unlinkSync(p); } catch {}
      }
      delete manifest.entries[key];
      pruned += 1;
    }
  }

  saveManifest(manifest);
  console.log(`  optimize-media: ${generated} generated, ${skipped} cached, ${passed} passthrough, ${pruned} pruned`);
}

main().catch(err => {
  console.error('optimize-media failed:', err);
  process.exit(1);
});
