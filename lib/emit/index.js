// lib/emit/index.js — Emit: Content model → dist/.
//
// Owns everything downstream of the Content model: markdown rendering
// (Shiki, wikilinks, embeds against the model's slug index), templates,
// static-asset minify+hash, feeds, sitemap, robots. Deterministic given its
// inputs — the Listening snapshot is passed in by the entrypoint
// (lib/listening.js), never fetched here. (See CONTEXT.md: Emit, Listening.)
//
// This module orchestrates one emit() pass; the mechanics live in its
// siblings (ADR 0009):
//   render.js — markdown → HTML (wikilinks/embeds, marked + Shiki, callouts)
//   assets.js — file plumbing, minify + content-hash, Early Hints
//   csp.js    — inline <head> script hashes appended to the dist _headers
//   feeds.js  — Atom feed, sitemap, robots
//   search.js — the build-time search index (/search-index.json)
//   ../topic-index.js — cross-kind Topic paths + related-writing ranking
//   listening-entries.js — Listening snapshot rows → page entries

import fs from 'node:fs';
import path from 'node:path';

// Presentation layer: React components in design-system/ render every page
// (ADR 0003). Emit stays plain Node — it imports string-returning render*
// functions from the built SSG bundle (design-system/dist-ssg/ssg.js);
// renderToStaticMarkup runs inside that bundle, and react/react-dom resolve
// from design-system/node_modules. Build the bundle with `npm run build:ssg`
// (in design-system/) before running this — the Pages prebuild + CI do so.
import {
  renderIndex, renderArticle, renderBlog, renderListing, renderThoughts, renderTopic,
  renderAbout, renderColophon, renderSearch,
  renderDigs, renderMovies, renderGrok,
  renderDesignIndex, renderDesignDirection,
  buildImportmap, buildSpeculationRules, DOCUMENT_ASSET_NAMES,
} from '../../design-system/dist-ssg/ssg.js';
// The /listening/ rows must byte-equal the browser Row module for the
// live-update innerHTML swap + dedupe (ADR 0001, test/row-parity.test.js), so
// they are still server-rendered by templates/rows.js and injected into the
// React listing frame as a raw HTML string.
import { listeningRow, emptyState } from '../../templates/rows.js';
import { siteConfig }   from '../../site.config.js';
import { writeOgImage, ogImagePath } from '../og-image.js';
import { resetShikiClasses, shikiClassCss } from '../shiki-csp.js';
import { configureRender, initHighlighter, renderBody } from './render.js';
import {
  REPO_ROOT, writePage, copyStatic, copyTimelineControlsBundle,
  listShippedAssets, processAsset, emitEarlyHintLinks, emitImmutableAssetHeaders,
} from './assets.js';
import { injectInlineScriptCsp } from './csp.js';
import { atomFeed, sitemapXml, robotsTxt, DESIGN_BAKEOFF_ROUTES } from './feeds.js';
import { buildSearchIndex } from './search.js';
import { toListeningEntries } from './listening-entries.js';
import { favoritePicks } from '../digs.js';
import { SECTIONS } from '../sections.js';
import { projectNotebookDays } from '../notebook.js';
import { buildTopicIndex } from '../topic-index.js';
import { projectEditorialHome } from '../editorial-home.js';

const STATIC_DIR = path.join(REPO_ROOT, 'static');
const MEDIA_BUILD_DIR = path.join(REPO_ROOT, '.cache', 'media-build');
const DEFAULT_MEDIA_MANIFEST = path.join(REPO_ROOT, '.cache', 'media-manifest.json');

// ── emit ─────────────────────────────────────────────────────────────────
/**
 * Write the Content model to `distDir`. Everything the site ships — pages,
 * hashed assets, feeds, sitemap — comes out of this one call. Deterministic
 * given its inputs; the only reads outside `distDir` are the static/ tree,
 * vault attachments, the optimize-media manifest, and the lib/ sources
 * (for the colophon line-count stat).
 *
 * @param {import('../intake.js').ContentModel} model
 * @param {object}   opts
 * @param {string}   opts.distDir       output root (created/cleaned)
 * @param {string}   opts.vaultDir      vault root (for attachments/)
 * @param {string}  [opts.mediaBase]    URL prefix for ![[embeds]] (default '/img')
 * @param {string}   opts.siteUrl       canonical origin, no trailing slash
 * @param {object[]} [opts.lastfmTracks]  Listening snapshot rows (see lib/listening.js)
 * @param {number}  [opts.scrobbleTotal]  Last.fm total playcount
 * @param {number}  [opts.startedAt]    build-start ms timestamp (colophon stat)
 * @param {string}  [opts.mediaManifest] path to optimize-media manifest
 *   (defaults to <repo>/.cache/media-manifest.json; tests pass a fixture path)
 * @param {object[]} [opts.digs] weekly digs (lib/digs.js)
 * @param {object[]} [opts.recommendations] non-dig picks (lib/recommendations.js)
 * @param {object[]} [opts.watches] recent Letterboxd watches (lib/watches.js)
 * @returns {Promise<{ distSize: string }>}
 */
export async function emit(model, {
  distDir,
  vaultDir,
  mediaBase = '/img',
  siteUrl,
  lastfmTracks = [],
  scrobbleTotal = 0,
  startedAt = Date.now(),
  mediaManifest,
  digs = [],
  recommendations = [],
  watches = [],
}) {
  const DIST_DIR = path.resolve(distDir);
  siteUrl = String(siteUrl || '').replace(/[\r\n]/g, '');
  configureRender({
    mediaBase,
    slugIndex: model.slugIndex,
    mediaManifest: mediaManifest || DEFAULT_MEDIA_MANIFEST,
  });
  resetShikiClasses();
  await initHighlighter();

  // ── render markdown → HTML ────────────────────────────────────────────
  const renderedArticles = model.articles.map(a => ({ ...a, html: renderBody(a.body) }));
  const renderedThoughts = model.thoughts.map(t => ({ ...t, html: renderBody(t.body) }));
  const about    = model.about.map(n => ({ ...n, html: renderBody(n.body) }));

  // Cross-kind Topic paths are derived once from the rendered Content model.
  // Pages consume their stable projection instead of recalculating tag counts
  // or limiting relationships to one publish kind.
  const topicIndex = buildTopicIndex(renderedArticles, renderedThoughts, {
    representativeLimit: renderedArticles.length + renderedThoughts.length || 1,
  });
  const tagPaths = Object.fromEntries(topicIndex.topics.map(topic => [topic.name, topic.path]));
  const articles = renderedArticles.map(article => ({ ...article, tagPaths }));
  const thoughts = renderedThoughts.map(thought => ({ ...thought, tagPaths }));
  const notebookDays = projectNotebookDays(thoughts);
  const editorial = projectEditorialHome({ articles, notebookDays, topics: topicIndex.topics });

  // Listening: pulled from Last.fm by the entrypoint. Kept separate from
  // vault content. The snapshot→entry mapping lives in listening-entries.js
  // (shared with test/row-parity.test.js).
  const listening = toListeningEntries(lastfmTracks);

  // ── homepage entry aggregation ────────────────────────────────────────
  const nowPlayingTrack = listening.find(l => l.nowPlaying) || null;
  const nowPlayingStatus = nowPlayingTrack
    ? `now: ${[nowPlayingTrack.artist, nowPlayingTrack.track].filter(Boolean).join(' — ')}`
    : '';

  const siteMeta = {
    config: siteConfig,
    bio: siteConfig.identity?.bio || '',
    identity: siteConfig.identity || {},
    links: siteConfig.links || [],
    nowPlaying: nowPlayingStatus,   // empty string when nothing is playing
    counts: {
      journal:   articles.filter(a => a.kind === 'journal').length,
      making:    articles.filter(a => a.kind === 'making').length,
      thoughts:  thoughts.length,
      listening: listening.length,
      scrobbles: scrobbleTotal,
    },
  };

  const feedEntries = [
    ...articles.map(a => ({
      kind: a.kind,
      title: a.title,
      date: a.date,
      url: a.url,
      summary: a.summary,
      tags: a.tags,
      tagPaths,
      readTime: a.readTime,
    })),
    ...thoughts.map(t => ({
      kind: 'thought',
      id: t.id,
      body: t.body,
      html: t.html,
      date: t.date,
      url: `/thoughts/#${t.id}`,
      permalinkLabel: 'note link',
      tags: t.tags,
      tagPaths,
      quote: t.quote,
    })),
    // Listening is deliberately NOT a feed kind. Scrobbles are high-frequency,
    // low-signal, and would drown out writing in both the feed and the
    // homepage/blog timelines; they live solely on the /listening/ page (which
    // reads the separate `listening` array below).
  ].sort((a, b) => b.date - a.date);

  // ── write dist/ ───────────────────────────────────────────────────────
  // Clean dist (tolerant of mounted-FS quirks that may not allow unlink)
  try { fs.rmSync(DIST_DIR, { recursive: true, force: true }); } catch (e) {
    console.warn(`  (note: couldn't fully clean dist — ${e.code || e.message}; overwriting in place)`);
  }
  fs.mkdirSync(DIST_DIR, { recursive: true });

  // Copy static assets (css, fonts, js) to dist root
  copyStatic(STATIC_DIR, DIST_DIR);

  // The Row module and its helpers are templates first (imported by Node at
  // render time) but also ship to the browser: copy them next to the static
  // assets so they get the same minify+hash treatment. listening-live.js
  // imports them by clean URL through the importmap emitted by renderDocument
  // (design-system/ssg/document.tsx; docs/adr/0001).
  const TEMPLATES_DIR = path.join(REPO_ROOT, 'templates');
  fs.copyFileSync(path.join(TEMPLATES_DIR, 'rows.js'),     path.join(DIST_DIR, 'rows.js'));
  fs.copyFileSync(path.join(TEMPLATES_DIR, '_helpers.js'), path.join(DIST_DIR, '_helpers.js'));

  const timelineControlsAsset = copyTimelineControlsBundle(DIST_DIR);

  // Append CSP-safe Shiki token classes collected during markdown render.
  const shikiCss = shikiClassCss();
  if (shikiCss) {
    const cssPath = path.join(DIST_DIR, '_shared.css');
    fs.appendFileSync(cssPath, shikiCss);
  }

  // Minify + content-hash CSS/JS so they can be cached immutably. Runs
  // against the copies already in dist/; leaves /fonts/ and /img/ alone.
  // The list of what to process is derived from disk (static/*.{css,js} plus
  // the two templates/ browser modules copied above), so a new asset can't
  // ship unhashed because a hand-written name list went stale.
  const assetMap = {};
  const pairs = await Promise.all(
    listShippedAssets(STATIC_DIR, TEMPLATES_DIR)
      .map(([filename, kind]) => processAsset(DIST_DIR, filename, kind)),
  );
  for (const p of pairs) if (p) assetMap[p[0]] = p[1];
  assetMap[timelineControlsAsset[0]] = timelineControlsAsset[1];
  // Every asset name the document shell references (its url() lookups + the
  // importmap targets) must have resolved to a hashed filename — an
  // unresolved name would ship as its clean URL and 404 silently under the
  // immutable-asset routing, so fail the build loudly instead.
  const unresolved = DOCUMENT_ASSET_NAMES.filter((name) => !assetMap[name]);
  if (unresolved.length) {
    throw new Error(`Document shell references assets missing from the asset map: ${unresolved.join(', ')}.`);
  }
  emitEarlyHintLinks(DIST_DIR, assetMap);
  // Every inline <script> the document shell emits (document.tsx), built by
  // the same build*() helpers renderDocument uses. Keep this in lockstep with
  // what renderDocument inlines — a new inline script added there without a
  // hash is silently blocked by the strict CSP.
  injectInlineScriptCsp(DIST_DIR, [buildImportmap(assetMap), buildSpeculationRules()]);
  // Last _headers edit. Pins immutable cache + Content-Type to real CSS/JS
  // files only, and rejects /*.css / /*.js wildcards (ADR 0013). Must run
  // after processAsset so the hashed names exist.
  emitImmutableAssetHeaders(DIST_DIR);

  // Open Graph cards — default site card + one per article.
  const ogDir = path.join(DIST_DIR, 'og');
  await writeOgImage(path.join(ogDir, 'default.png'), {
    title: siteConfig.title,
    siteTitle: siteConfig.title,
  });
  for (const a of articles) {
    const rel = ogImagePath(a).replace(/^\//, '');
    await writeOgImage(path.join(DIST_DIR, rel), {
      title: a.title,
      kind: a.kind,
      date: a.date,
      siteTitle: siteConfig.title,
    });
  }

  // Build-time search index (client filter in static/search.js).
  fs.writeFileSync(
    path.join(DIST_DIR, 'search-index.json'),
    JSON.stringify(buildSearchIndex(articles, thoughts)),
  );

  // Copy vault attachments + optimized variants to dist/img for the default
  // mediaBase='/img'. In production mediaBase points at media.mattdoes.online
  // and sync-media has already pushed the same files to R2, so these on-disk
  // copies are only consulted when the build is served locally. Variants are
  // merged in after originals so the .webp sits next to its source.
  const attachDir = path.join(vaultDir, 'attachments');
  if (fs.existsSync(attachDir)) {
    fs.mkdirSync(path.join(DIST_DIR, 'img'), { recursive: true });
    copyStatic(attachDir, path.join(DIST_DIR, 'img'));
  }
  if (fs.existsSync(MEDIA_BUILD_DIR)) {
    fs.mkdirSync(path.join(DIST_DIR, 'img'), { recursive: true });
    copyStatic(MEDIA_BUILD_DIR, path.join(DIST_DIR, 'img'));
  }

  // Homepage. The editorial projection carries selected long-form writing,
  // Notebook days, and Topic paths. Listening activity stays on /listening/;
  // only the lightweight now-playing status remains in shared page chrome.
  const firstDig = digs[0]?.picks?.[0] || null;
  const firstWatch = watches[0] || null;
  fs.writeFileSync(path.join(DIST_DIR, 'index.html'), renderIndex({
    site: { ...siteMeta, place: siteConfig.geo?.home?.label || '' },
    editorial,
    shelf: {
      dig: firstDig
        ? { artist: firstDig.artist, starter: firstDig.starter, favorite: !!firstDig.favorite }
        : null,
      watch: firstWatch
        ? { title: firstWatch.title, year: firstWatch.year || '' }
        : null,
    },
    siteConfig,
    assets: assetMap,
  }));

  // Articles (journal + making)
  const journalArticles = articles.filter(a => a.kind === 'journal');
  const makingArticles  = articles.filter(a => a.kind === 'making');
  const recentJournal   = journalArticles.slice(0, 5);
  for (let i = 0; i < articles.length; i++) {
    const a = articles[i];
    const sameKind = a.kind === 'journal' ? journalArticles : makingArticles;
    const idx = sameKind.indexOf(a);
    const prev = sameKind[idx + 1]; // older
    const next = sameKind[idx - 1]; // newer
    writePage(DIST_DIR, a.url, renderArticle({
      site: siteMeta,
      note: a,
      recent: a.kind === 'journal' ? recentJournal : sameKind.slice(0, 5),
      related: topicIndex.relatedTo(a),
      prev,
      next,
      siteConfig,
      assets: assetMap,
      ogImage: ogImagePath(a),
    }));
  }

  // Blog — unified journal + making + thoughts listing. Kept as the single
  // combined view with client-side kind chips. Individual post URLs unchanged.
  writePage(DIST_DIR, '/blog/', renderBlog({
    siteConfig,
    entries: feedEntries,
    nowPlaying: nowPlayingStatus,
    assets: assetMap,
  }));

  // Listening is a distinct surface (live-polled tracklist, not a blog
  // kind). Its rows are server-rendered by templates/rows.js (not React) so
  // they byte-equal the browser live-update output (ADR 0001,
  // test/row-parity.test.js); they're passed to renderListing as rowsHtml.
  const listeningEntries = listening.slice(0, siteConfig.lastfm?.limit || 25);
  const listeningRowsHtml = listeningEntries.length
    ? listeningEntries.map(e => listeningRow(e)).join('\n')
    : emptyState('listening');

  // Real per-section archive index pages (F12 / contract C5), one per
  // Section descriptor entry (lib/sections.js). These server-rendered pages
  // make each section meaningful without JavaScript; /blog/ remains the
  // unified, chip-filterable view. Thoughts entries are the thought objects
  // themselves (they carry .html, .date, .tags, .id, .quote), already
  // newest-first from intake.
  const sectionEntries = {
    journal: journalArticles,
    making: makingArticles,
    listening: listeningEntries,
  };
  for (const [kind, section] of Object.entries(SECTIONS)) {
    if (kind === 'thoughts') {
      writePage(DIST_DIR, section.route, renderThoughts({
        siteConfig,
        days: notebookDays,
        topics: topicIndex.topics,
        nowPlaying: nowPlayingStatus,
        assets: assetMap,
      }));
      continue;
    }
    writePage(DIST_DIR, section.route, renderListing({
      siteConfig, kind, entries: sectionEntries[kind], nowPlaying: nowPlayingStatus, assets: assetMap,
      ...(kind === 'listening'
        ? { totalScrobbles: scrobbleTotal, rowsHtml: listeningRowsHtml }
        : {}),
    }));
  }

  // One durable page per Topic path. All pages use the same Topic projection
  // that powers homepage themes and cross-kind related writing.
  for (const topic of topicIndex.topics) {
    writePage(DIST_DIR, topic.path, renderTopic({
      siteConfig,
      topic,
      allTopics: topicIndex.topics,
      nowPlaying: nowPlayingStatus,
      assets: assetMap,
    }));
  }

  writePage(DIST_DIR, '/search/', renderSearch({ siteConfig, assets: assetMap }));

  // Digs, movies, and the recommendations hub. Digs are the only copy of
  // weekly music; /grok/ reads favoritePicks from that same list. Watches
  // are the Letterboxd snapshot from the entrypoint — not fetched here.
  const digFavorites = favoritePicks(digs);
  writePage(DIST_DIR, '/digs/', renderDigs({
    siteConfig,
    weeks: digs,
    nowPlaying: nowPlayingStatus,
    assets: assetMap,
  }));
  writePage(DIST_DIR, '/movies/', renderMovies({
    siteConfig,
    watches,
    profileHref: siteConfig.letterboxd?.profile,
    nowPlaying: nowPlayingStatus,
    assets: assetMap,
  }));
  writePage(DIST_DIR, '/grok/', renderGrok({
    siteConfig,
    favorites: digFavorites,
    picks: recommendations,
    nowPlaying: nowPlayingStatus,
    assets: assetMap,
  }));

  // Comparison sketches. Direction B is already the live homepage; these
  // routes stay up beside it. The same route list is the sitemap's, so a
  // sketch can't be written without being listed (or listed without being written).
  const designArgs = {
    site: { ...siteMeta, place: siteConfig.geo?.home?.label || '' },
    featured: editorial.featured,
    recent: editorial.recentWriting,
    shelf: {
      dig: firstDig
        ? { artist: firstDig.artist, starter: firstDig.starter, favorite: !!firstDig.favorite }
        : null,
      watch: firstWatch
        ? { title: firstWatch.title, year: firstWatch.year || '' }
        : null,
    },
    siteConfig,
    assets: assetMap,
  };
  const designHtml = {
    '/design/': renderDesignIndex(designArgs),
    '/design/a/': renderDesignDirection({ ...designArgs, id: 'a' }),
    '/design/b/': renderDesignDirection({ ...designArgs, id: 'b' }),
    '/design/c/': renderDesignDirection({ ...designArgs, id: 'c' }),
  };
  for (const route of DESIGN_BAKEOFF_ROUTES) {
    if (!designHtml[route]) throw new Error(`Missing design bake-off page for ${route}`);
    writePage(DIST_DIR, route, designHtml[route]);
  }

  // About — singleton. Rendered from whichever vault note has `publish: about`.
  // A duplicate is already rejected at intake time, so here we only need the
  // present/absent branch.
  const aboutWritten = about.length > 0;
  if (aboutWritten) {
    writePage(DIST_DIR, '/about/', renderAbout({ site: siteMeta, note: about[0], siteConfig, assets: assetMap }));
  }

  // Colophon stats: the vanity line count covers the whole pipeline now that
  // it spans build.js + lib/ (subdirectories like emit/ included, hence the
  // recursive walk) — counting only the entrypoint would understate it
  // dishonestly.
  const LIB_DIR = path.join(REPO_ROOT, 'lib');
  const codeFiles = [
    path.join(REPO_ROOT, 'build.js'),
    ...fs.readdirSync(LIB_DIR, { recursive: true })
      .filter(n => n.endsWith('.js')).map(n => path.join(LIB_DIR, n)),
  ];
  const buildLines = codeFiles.reduce(
    (sum, f) => sum + fs.readFileSync(f, 'utf8').split('\n').length, 0);
  const distSizeKb = (() => {
    let total = 0;
    const walkSize = d => fs.readdirSync(d).forEach(n => {
      const p = path.join(d, n); const s = fs.statSync(p);
      if (s.isDirectory()) walkSize(p); else total += s.size;
    });
    walkSize(DIST_DIR);
    return `${Math.round(total / 1024)} KB`;
  })();

  // Feeds
  fs.writeFileSync(path.join(DIST_DIR, 'feed.xml'), atomFeed(feedEntries, siteUrl));

  // Render colophon last (so stats are current)
  writePage(DIST_DIR, '/colophon/', renderColophon({
    siteConfig,
    updated: new Date(),
    nowPlaying: nowPlayingStatus,
    assets: assetMap,
    stats: {
      notesRead: model.notes.length,
      pagesWritten: articles.length + thoughts.length > 0 ? articles.length + 3 : articles.length,
      buildTime: `${((Date.now() - startedAt) / 1000).toFixed(1)}s`,
      distSize: distSizeKb,
      buildLines,
    },
  }));

  // Sitemap + robots (F16 / contract C9) — the crawlable route set, built in
  // feeds.js next to the Atom feed.
  fs.writeFileSync(path.join(DIST_DIR, 'sitemap.xml'), sitemapXml({
    siteUrl,
    articles,
    aboutWritten,
    topicPaths: topicIndex.topics.map(topic => topic.path),
  }));
  fs.writeFileSync(path.join(DIST_DIR, 'robots.txt'), robotsTxt(siteUrl));

  return { distSize: distSizeKb };
}
