// #scrobble-count parity.
//
// The stat is emitted on /listening/ and re-stamped in the
// browser by static/listening-live.js, which dedupes by text equality. Both render
// through the ONE shared formatter, formatScrobbleCount
// (templates/_helpers.js); this test pins both server-rendered stats to that
// formatter's output for the fixture playcount, so a format drift in either
// emitter fails the build instead of breaking the live update.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { formatScrobbleCount } from '../lib/format.js';
import {
  buildFixtureVault, readDist, seedLastfmCache, REPO_ROOT,
} from './helpers/run-build.js';

const fixtureCache = path.join(REPO_ROOT, 'test', 'fixtures', 'lastfm-cache', 'lastfm.json');

let distDir;
test.before(() => { ({ distDir } = buildFixtureVault({ cacheDir: seedLastfmCache(fixtureCache) })); });

// The rendered text of the #scrobble-count span (first match — the id is
// unique per page, a precondition listening-live.js also relies on).
function scrobbleText(html) {
  const m = html.match(/id="scrobble-count"[^>]*>([^<]*)</);
  assert.ok(m, 'page must contain a #scrobble-count span');
  return m[1];
}

test('server-rendered scrobble counts equal the shared formatter output', () => {
  const { playcount } = JSON.parse(fs.readFileSync(fixtureCache, 'utf8'));
  const expected = formatScrobbleCount(playcount);
  // Guard the fixture: a count without a group separator wouldn't prove
  // the locale formatting actually happened.
  assert.ok(expected.includes(','), 'fixture playcount should exercise comma grouping');

  assert.equal(scrobbleText(readDist(distDir, 'listen/index.html')), expected,
    '/listen/ scrobble count must match formatScrobbleCount');
  assert.doesNotMatch(readDist(distDir, 'index.html'), /id="scrobble-count"/,
    'the editorial homepage must not emit an activity counter');
});
