// Emit: verb registry → dist/.
//
// Hashes the station shell, writes the pages the registry names, plus `/`
// and `/404`. `/frequency/` is the secret page: written here, noindex, and
// left out of the sitemap by feeds.js.

import fs from 'node:fs';
import path from 'node:path';

import { siteConfig } from '../../site.config.js';
import { assertRegistry, verbs, verbPath } from '../../site/verbs.ts';
import {
  renderers, renderHome, renderFrequency, renderNotFound,
} from '../../site/render.js';
import {
  REPO_ROOT, writePage, copyStatic,
  listShippedAssets, processAsset, emitEarlyHintLinks, emitImmutableAssetHeaders,
} from './assets.js';
import { injectInlineScriptCsp } from './csp.js';
import { sitemapXml, robotsTxt } from './feeds.js';

const STATIC_DIR = path.join(REPO_ROOT, 'static');

/**
 * @param {object} opts
 * @param {string} opts.distDir
 * @param {string} [opts.contentDir]
 * @param {string} opts.siteUrl
 * @param {object[]} [opts.lastfmTracks]
 * @param {number} [opts.scrobbleTotal]
 * @param {object[]} [opts.watches]
 * @returns {Promise<{ distSize: string }>}
 */
export async function emit({
  distDir,
  contentDir,
  siteUrl,
  lastfmTracks = [],
  scrobbleTotal = 0,
  watches = [],
}) {
  assertRegistry(Object.keys(renderers));

  const DIST_DIR = path.resolve(distDir);
  siteUrl = String(siteUrl || siteConfig.url || 'https://mattdoes.online').replace(/[\r\n]/g, '').replace(/\/$/, '');

  try { fs.rmSync(DIST_DIR, { recursive: true, force: true }); } catch (err) {
    console.warn(`  (note: couldn't fully clean dist — ${err.code || err.message}; overwriting in place)`);
  }
  fs.mkdirSync(DIST_DIR, { recursive: true });
  copyStatic(STATIC_DIR, DIST_DIR);

  const assetMap = {};
  const pairs = await Promise.all(
    listShippedAssets(STATIC_DIR).map(([filename, kind]) => processAsset(DIST_DIR, filename, kind)),
  );
  for (const pair of pairs) if (pair) assetMap[pair[0]] = pair[1];
  emitEarlyHintLinks(DIST_DIR, assetMap);
  // No inline scripts. An empty list leaves script-src unchanged, so the
  // Email Obfuscation decoder and the analytics beacon stay on 'self'.
  injectInlineScriptCsp(DIST_DIR, []);
  emitImmutableAssetHeaders(DIST_DIR);

  if (contentDir) {
    const attachDir = path.join(contentDir, 'attachments');
    if (fs.existsSync(attachDir)) {
      fs.mkdirSync(path.join(DIST_DIR, 'img'), { recursive: true });
      copyStatic(attachDir, path.join(DIST_DIR, 'img'));
    }
  }

  const ctx = {
    siteUrl,
    assets: assetMap,
    watches,
    tracks: lastfmTracks,
    playcount: scrobbleTotal,
    builtAt: new Date().toISOString(),
  };

  fs.writeFileSync(path.join(DIST_DIR, 'index.html'), renderHome(ctx));
  for (const verb of verbs) {
    const render = renderers[verb.renderer];
    if (typeof render !== 'function') {
      throw new Error(`verb registry: missing renderer "${verb.renderer}" for ${verb.slug}`);
    }
    writePage(DIST_DIR, verbPath(verb.slug), render(ctx));
  }
  writePage(DIST_DIR, '/frequency/', renderFrequency(ctx));
  fs.writeFileSync(path.join(DIST_DIR, '404.html'), renderNotFound(ctx));

  fs.writeFileSync(path.join(DIST_DIR, 'sitemap.xml'), sitemapXml({ siteUrl }));
  fs.writeFileSync(path.join(DIST_DIR, 'robots.txt'), robotsTxt(siteUrl));

  const distSizeKb = (() => {
    let total = 0;
    const walkSize = (dir) => fs.readdirSync(dir).forEach((name) => {
      const file = path.join(dir, name);
      const stat = fs.statSync(file);
      if (stat.isDirectory()) walkSize(file);
      else total += stat.size;
    });
    walkSize(DIST_DIR);
    return `${Math.round(total / 1024)} KB`;
  })();

  return { distSize: distSizeKb };
}
