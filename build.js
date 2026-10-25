// build.js — mattdoes.online static site generator entrypoint.
//
//   fetchListeningSnapshot + fetchWatches + fetchFilmCount → mirrorPosters → emit
//
// Pages come from site/verbs.ts. Listening is the /api/listening/* worker
// (lib/listening.js). Watches are the Letterboxd RSS. The films-watched
// count is the public films page. Both are lib/watches.js. A missing count
// hides the line and does not fail the build. Poster uploads need
// CLOUDFLARE_API_TOKEN. Without it, a poster already on the media host is
// reused. A failed poster never fails the build (lib/posters.js).
//
// LISTENING_OFFLINE=1 and LETTERBOXD_OFFLINE=1 skip the network (tests, CI).

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { emit } from './lib/emit/index.js';
import { unsharedEnabled } from './site/verbs.ts';
import { fetchListeningSnapshot } from './lib/listening.js';
import { fetchFilmCount, fetchWatches } from './lib/watches.js';
import { mirrorPosters } from './lib/posters.js';
import { siteConfig } from './site.config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.resolve(process.env.DIST_DIR || path.join(__dirname, 'dist'));
const CACHE_DIR = path.resolve(process.env.CACHE_DIR || path.join(__dirname, '.cache'));
const CONTENT_DIR = process.env.CONTENT_DIR || path.resolve(__dirname, 'content');
const SITE_URL = process.env.SITE_URL || siteConfig.url || 'https://mattdoes.online';

const t0 = Date.now();

const { tracks: lastfmTracks, playcount: scrobbleTotal, periods } =
  await fetchListeningSnapshot({ siteUrl: SITE_URL, cacheDir: CACHE_DIR });

const [rawWatches, filmCount] = await Promise.all([
  fetchWatches({ cacheDir: CACHE_DIR }),
  fetchFilmCount({ cacheDir: CACHE_DIR }),
]);
const watches = await mirrorPosters(rawWatches);

const { distSize } = await emit({
  distDir: DIST_DIR,
  contentDir: CONTENT_DIR,
  siteUrl: SITE_URL,
  lastfmTracks,
  scrobbleTotal,
  periods,
  watches,
  filmCount,
});

console.log(`✓ built in ${((Date.now() - t0) / 1000).toFixed(2)}s`);
console.log(`  ${watches.length} recent watches · ${lastfmTracks.length} listening rows`);
console.log(`  dist: ${distSize}  ·  ${DIST_DIR}`);
if (unsharedEnabled) console.log('  unshared: published');
