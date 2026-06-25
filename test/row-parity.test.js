// Row module parity (see CONTEXT.md: Row, docs/adr/0001).
//
// listening-live.js swaps #listening-rows innerHTML with rows it renders
// from the shared Row module, deduping against what the server rendered —
// so the server page's row markup must byte-equal the module's output for
// the same data. Since both sides now call the same functions, what's left
// to test is the WIRING:
//   1. the server-rendered /listening/ page contains exactly
//      listeningRow(entry) over the snapshot data (templates/listing.js
//      didn't add wrappers/whitespace the client swap wouldn't reproduce);
//   2. the empty case renders emptyState('listening') verbatim;
//   3. dist ships the module graph: hashed rows.js/_helpers.js exist, the
//      importmap remaps their clean URLs, and listening-live.js is loaded
//      as type="module".

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { listeningRow, emptyState } from '../templates/rows.js';
import { safeUrl } from '../templates/_helpers.js';
import {
  buildFixtureVault, readDist, seedLastfmCache, makeTempDir, REPO_ROOT,
} from './helpers/run-build.js';
import { parseHeadersFile, headerValues } from './helpers/parse-headers.js';

const fixtureCache = path.join(REPO_ROOT, 'test', 'fixtures', 'lastfm-cache', 'lastfm.json');

let distDir;
test.before(() => { ({ distDir } = buildFixtureVault({ cacheDir: seedLastfmCache(fixtureCache) })); });

test('server-rendered listening rows byte-equal the Row module output', () => {
  const html = readDist(distDir, 'listening/index.html');

  // Mirror Emit's snapshot→entry mapping (lib/emit.js `listening`): keep
  // dated tracks, normalize the link through safeUrl, newest first.
  const cached = JSON.parse(fs.readFileSync(fixtureCache, 'utf8')).tracks;
  const entries = cached
    .filter(t => t.date)
    .map(t => ({ ...t, link: safeUrl(t.link), date: new Date(t.date) }))
    .sort((a, b) => b.date - a.date)
    .slice(0, 25);
  assert.ok(entries.length >= 2, 'seeded cache should yield listening entries');

  const expected = entries.map(e => listeningRow(e)).join('\n');
  assert.ok(html.includes(expected),
    'the /listening/ page must contain the Row module output verbatim — ' +
    'any wrapper or whitespace drift breaks the live-update innerHTML dedupe');
});

test('an empty snapshot renders emptyState("listening") verbatim', () => {
  // Build with an empty (but present and fresh) cache → no listening rows.
  const cacheDir = makeTempDir('mattdoes-cache-');
  fs.writeFileSync(path.join(cacheDir, 'lastfm.json'),
    JSON.stringify({ fetchedAt: new Date().toISOString(), tracks: [] }));
  const res = buildFixtureVault({ cacheDir });

  const html = readDist(res.distDir, 'listening/index.html');
  assert.ok(html.includes(emptyState('listening')),
    'an empty listening page must render the shared empty state verbatim');
});

test('dist ships the Row module graph the importmap promises', () => {
  const html = readDist(distDir, 'listening/index.html');

  // listening-live.js is a module now (modules defer by default).
  const live = html.match(/<script src="\/(listening-live\.[0-9a-f]{8}\.js)" type="module"><\/script>/);
  assert.ok(live, '/listening/ must load hashed listening-live.js as type="module"');
  assert.ok(fs.existsSync(path.join(distDir, live[1])),
    `hashed ${live[1]} must exist in dist`);

  // The importmap must remap both clean module URLs to on-disk hashed files.
  const im = html.match(/<script type="importmap">(.*?)<\/script>/s);
  assert.ok(im, 'every page must carry the importmap');
  const imports = JSON.parse(im[1]).imports;
  for (const clean of ['/rows.js', '/_helpers.js']) {
    const hashed = imports[clean];
    assert.match(hashed || '', /^\/[\w-]+\.[0-9a-f]{8}\.js$/,
      `importmap must remap ${clean} to a hashed filename (got ${hashed})`);
    assert.ok(fs.existsSync(path.join(distDir, hashed.slice(1))),
      `importmap target ${hashed} must exist in dist`);
  }

  // The unhashed originals are deleted by processAsset — the clean URLs
  // exist only as importmap keys, so nothing can bypass immutable caching.
  assert.ok(!fs.existsSync(path.join(distDir, 'rows.js')),
    'unhashed rows.js must not ship');
  assert.ok(!fs.existsSync(path.join(distDir, '_helpers.js')),
    'unhashed _helpers.js must not ship');
});

test('the strict CSP admits EVERY inline script by hash (the prod regression)', () => {
  // script-src has no 'unsafe-inline', and a hash source disables keyword inline
  // allowances ('inline-speculation-rules' included) — so the build must carry a
  // sha256 for *every* inline <script> the page emits, not just the importmap.
  // Miss one and the browser silently drops it: an unhashed importmap kills
  // listening-live.js (its `./rows.js` 404s as text/html → MIME failure → no
  // live scrobble updates, only the import-free now-playing pill survives);
  // unhashed speculation rules kill prerender/prefetch (ADR 0007). Extracting
  // ALL inline scripts (not a hardcoded list) means a future inline <script>
  // added without a matching hash fails this test instead of shipping broken.
  const html = readDist(distDir, 'listening/index.html');
  // Inline <script>…</script> = no src attribute (theme-boot etc. are external).
  const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)]
    .map(m => m[1]);
  assert.ok(inline.length >= 2,
    'the page must carry the inline importmap + speculation rules');
  const hashes = inline.map(
    body => "'sha256-" + crypto.createHash('sha256').update(body).digest('base64') + "'");

  const routes = parseHeadersFile(readDist(distDir, '_headers'));
  for (const header of ['content-security-policy', 'content-security-policy-report-only']) {
    const csp = headerValues(routes, '/*', header)[0];
    assert.ok(csp, `/* must set ${header}`);
    const scriptSrc = csp.split(';').find(d => d.trim().startsWith('script-src'));
    assert.ok(scriptSrc, `${header} must declare a script-src`);
    for (const hash of hashes) {
      assert.ok(scriptSrc.includes(hash),
        `${header} script-src must carry inline-script hash ${hash} or the browser drops it`);
    }
    assert.ok(!scriptSrc.includes("'unsafe-inline'"),
      `${header} must admit inline scripts by hash, not by weakening to 'unsafe-inline'`);
  }
});
