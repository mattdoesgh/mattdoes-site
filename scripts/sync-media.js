#!/usr/bin/env node
// scripts/sync-media.js
//
// Pushes vault/attachments/ (originals) and .cache/media-build/ (optimized
// variants) into the R2 bucket `mattdoes-media`, which is served at
// https://media.mattdoes.online.
//
// Change detection: .cache/media-manifest.json holds a sha256 per source
// file + an `uploaded` section keyed by R2 object key. We PUT only when
// the hash is new or changed, and DELETE objects whose source is gone.
//
// Transport: `npx wrangler r2 object put/delete --remote`. Keeping the
// dependency surface to tools already in the Cloudflare stack; no AWS
// SDK needed.
//
// Required env: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID.
// Missing either → no-op with a note (local dev / PRs from forks).

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT  = path.resolve(__dirname, '..');
const VAULT_DIR  = process.env.VAULT_DIR || path.resolve(REPO_ROOT, 'vault');
const ATTACH_DIR = path.join(VAULT_DIR, 'attachments');
const BUILD_DIR  = path.resolve(REPO_ROOT, '.cache', 'media-build');
const MANIFEST   = path.resolve(REPO_ROOT, '.cache', 'media-manifest.json');
const BUCKET     = process.env.MEDIA_BUCKET || 'mattdoes-media';

const MIME = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.avif': 'image/avif',
  '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav',
  '.m4a': 'audio/mp4', '.flac': 'audio/flac',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime',
  '.pdf': 'application/pdf',
};

function sha256File(p) {
  return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}

function loadManifest() {
  if (!fs.existsSync(MANIFEST)) return { version: 1, entries: {}, uploaded: {} };
  try {
    const data = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
    if (!data.entries)  data.entries  = {};
    if (!data.uploaded) data.uploaded = {};
    return data;
  } catch { return { version: 1, entries: {}, uploaded: {} }; }
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

function wrangler(args) {
  const res = spawnSync('npx', ['--yes', 'wrangler', ...args], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
    encoding: 'utf8',
  });
  if (res.status !== 0) {
    const msg = (res.stderr || res.stdout || '').trim();
    throw new Error(`wrangler ${args[0]} ${args[1]} failed: ${msg}`);
  }
  return res.stdout;
}

function putObject(key, filePath) {
  const ext = path.extname(key).toLowerCase();
  const mime = MIME[ext] || 'application/octet-stream';
  wrangler([
    'r2', 'object', 'put',
    `${BUCKET}/${key}`,
    '--file', filePath,
    '--content-type', mime,
    '--remote',
  ]);
}

function deleteObject(key) {
  try {
    wrangler(['r2', 'object', 'delete', `${BUCKET}/${key}`, '--remote']);
  } catch (err) {
    // A missing-object delete is not fatal — manifest can drift from bucket.
    console.warn(`  (note: delete ${key} — ${err.message.split('\n')[0]})`);
  }
}

function main() {
  if (!process.env.CLOUDFLARE_API_TOKEN || !process.env.CLOUDFLARE_ACCOUNT_ID) {
    console.log('  sync-media: CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID not set — skipping R2 sync.');
    return;
  }
  if (!fs.existsSync(ATTACH_DIR)) {
    console.log(`  sync-media: no attachments dir at ${path.relative(REPO_ROOT, ATTACH_DIR)} — nothing to sync.`);
    return;
  }

  const manifest = loadManifest();

  // Build the set of (key, sourcePath, sha) we want present in R2.
  const want = new Map();
  for (const f of walk(ATTACH_DIR)) {
    const key = path.relative(ATTACH_DIR, f).split(path.sep).join('/');
    want.set(key, { file: f, sha: sha256File(f) });
  }
  for (const f of walk(BUILD_DIR)) {
    const key = path.relative(BUILD_DIR, f).split(path.sep).join('/');
    want.set(key, { file: f, sha: sha256File(f) });
  }

  let uploaded = 0, unchanged = 0, deleted = 0;
  for (const [key, { file, sha }] of want) {
    const prior = manifest.uploaded[key];
    if (prior && prior.sha256 === sha) { unchanged += 1; continue; }
    putObject(key, file);
    manifest.uploaded[key] = { sha256: sha, uploadedAt: new Date().toISOString() };
    uploaded += 1;
  }

  for (const key of Object.keys(manifest.uploaded)) {
    if (!want.has(key)) {
      deleteObject(key);
      delete manifest.uploaded[key];
      deleted += 1;
    }
  }

  saveManifest(manifest);
  console.log(`  sync-media: ${uploaded} uploaded, ${unchanged} unchanged, ${deleted} deleted → r2://${BUCKET}`);
}

try { main(); } catch (err) { console.error('sync-media failed:', err.message); process.exit(1); }
