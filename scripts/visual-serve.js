// Build the site from the visual fixtures and serve that dist.
// LISTENING_OFFLINE and LETTERBOXD_OFFLINE keep the server off the network.
// VISUAL_FIXTURE keeps the poster URLs that already point at our media host.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'test', 'visual', '.dist');
const port = Number(process.env.VISUAL_PORT || 4173);

const fixtures = path.join(root, 'test', 'fixtures', 'visual');
const cache = fs.mkdtempSync(path.join(fs.realpathSync('/tmp'), 'mattdoes-visual-'));
fs.copyFileSync(path.join(fixtures, 'letterboxd.json'), path.join(cache, 'letterboxd.json'));
fs.copyFileSync(path.join(fixtures, 'lastfm.json'), path.join(cache, 'lastfm.json'));
fs.rmSync(dist, { recursive: true, force: true });

const built = spawnSync(process.execPath, ['build.js'], {
  cwd: root,
  env: {
    ...process.env,
    DIST_DIR: dist,
    CACHE_DIR: cache,
    SITE_URL: 'https://mattdoes.online',
    NODE_ENV: 'production',
    LISTENING_OFFLINE: '1',
    LETTERBOXD_OFFLINE: '1',
    VISUAL_FIXTURE: '1',
  },
  encoding: 'utf8',
});
if (built.status !== 0) {
  console.error(built.stdout);
  console.error(built.stderr);
  process.exit(built.status || 1);
}

const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.json': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml',
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', 'http://127.0.0.1');
  let rel = decodeURIComponent(url.pathname);
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.resolve(dist, `.${rel}`);
  if (!file.startsWith(dist + path.sep) && file !== dist) {
    res.writeHead(403);
    res.end();
    return;
  }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    const missing = path.join(dist, '404.html');
    res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' });
    res.end(fs.existsSync(missing) ? fs.readFileSync(missing) : 'not found');
    return;
  }
  const ext = path.extname(file);
  res.writeHead(200, { 'content-type': types[ext] || 'application/octet-stream' });
  res.end(fs.readFileSync(file));
});

server.listen(port, '127.0.0.1', () => {
  console.log(`visual fixture server http://127.0.0.1:${port}`);
});
