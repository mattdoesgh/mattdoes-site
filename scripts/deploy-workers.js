#!/usr/bin/env node
// Deploy listening, csp-report, and rebuild with the wrangler binary
// pinned in workers/package-lock.json. Run from the repo root:
// npm run deploy:workers

import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolveWranglerBin } from './wrangler-bin.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bin = resolveWranglerBin(root);
const workers = ['listening', 'csp-report', 'rebuild'];

for (const name of workers) {
  const res = spawnSync(process.execPath, [bin, 'deploy'], {
    cwd: path.join(root, 'workers', name),
    stdio: 'inherit',
    env: process.env,
  });
  if (res.status !== 0) process.exit(res.status ?? 1);
}
