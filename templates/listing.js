// Listing — reverse-chrono index for /journal/, /making/, /listening/,
// /thoughts/. One template, four call sites. Renders an empty-state when
// there are no entries so pages stay functional on a fresh vault.

import { base } from './base.js';
import { asset } from './_assets.js';
import { esc, safeUrl, relFor } from './_helpers.js';
import { articleRow, thoughtRow, listeningRow, emptyState } from './rows.js';

// Pretty-name for the section we're listing — used in URLs and filter links.
const SECTION_PATH = {
  journal:   '/journal/',
  making:    '/making/',
  listening: '/listening/',
  thoughts:  '/thoughts/',
};

// Per-kind document description (finding C9).
const SECTION_DESCRIPTION = {
  journal:   'Journal entries — longer-form notes, reverse-chronological.',
  making:    'Building-in-public posts — projects, experiments, and dev notes.',
  listening: 'A live-updating log of recent listens, pulled from Last.fm.',
  thoughts:  'Micro-thoughts — short posts split out of the daily notes.',
};

export function listingPage({ siteConfig, kind, entries, nowPlaying, totalScrobbles }) {
  const section = (siteConfig.sections && siteConfig.sections[kind]) || {};
  const showLastfm = kind === 'listening' && siteConfig.lastfm?.showUser && siteConfig.lastfm?.username;
  // Pick the row renderer for this kind: listening → listeningRow,
  // thoughts → thoughtRow (microblog markup), everything else → articleRow.
  const rowRenderer = kind === 'listening' ? listeningRow
    : kind === 'thoughts' ? thoughtRow
    : articleRow;
  const rows = entries.length
    ? entries.map(e => rowRenderer(e)).join('\n')
    : emptyState(kind);
  const statLabel = kind === 'listening' ? 'scrobbles' : 'posts';
  const statValue = kind === 'listening'
    ? Number(totalScrobbles || 0).toLocaleString('en-US')
    : String(entries.length);
  // Live-update hooks: only on /listening/, give the count + rows stable IDs
  // so listening-live.js can re-render them without a full reload.
  const statIdAttr = kind === 'listening' ? ' id="scrobble-count"' : '';
  const rowsOpen   = kind === 'listening' ? '<div id="listening-rows">' : '';
  const rowsClose  = kind === 'listening' ? '</div>' : '';

  // Tag index (only meaningful for article kinds).
  const tagCounts = new Map();
  if (kind !== 'listening') {
    for (const e of entries) for (const t of (e.tags || [])) tagCounts.set(t, (tagCounts.get(t) || 0) + 1);
  }
  const topTags = [...tagCounts.entries()].sort((a, b) => b[1] - a[1]);
  const sectionPath = SECTION_PATH[kind] || '/';
  const filterBar = topTags.length ? `
    <div class="filter">
      <span class="label">filter</span>
      <a href="${sectionPath}" class="on all" data-filter="" aria-current="true">all</a>
      ${topTags.slice(0, 8).map(([tag]) => `<a href="${sectionPath}?tag=${encodeURIComponent(tag)}" data-filter="${esc(tag)}">${esc(tag)}</a>`).join('\n      ')}
      <span class="cnt">${entries.length} ${statLabel}</span>
    </div>` : '';

  const body = `
<main class="page" id="main">
  <h1 class="visually-hidden">${esc(kind)}</h1>
  <aside class="side-left" aria-label="page meta">
    <div class="ident">
      ${section.who ? `<div class="who">${esc(section.who)}</div>` : ''}
      ${section.bio ? `<div class="bio">${esc(section.bio)}</div>` : ''}
      <div class="stats">
        <span class="s"><span class="n"${statIdAttr}>${statValue}</span>${statLabel}</span>
      </div>
    </div>

    ${showLastfm ? `
    <div class="group">
      <h2>source <span class="m">last.fm</span></h2>
      <ul>
        <li><a href="https://www.last.fm/user/${encodeURIComponent(siteConfig.lastfm.username)}" rel="noopener noreferrer">last.fm/${esc(siteConfig.lastfm.username)}</a><span class="meta">↗</span></li>
      </ul>
    </div>` : ''}

    ${siteConfig.links && siteConfig.links.length ? `
    <div class="group">
      <h2>elsewhere</h2>
      <ul>
        ${siteConfig.links.filter(l => l.href).map(l => `<li><a href="${esc(safeUrl(l.href))}"${relFor(l.href)}>${esc(l.label)}</a>${l.meta ? `<span class="meta">${esc(l.meta)}</span>` : ''}</li>`).join('\n        ')}
      </ul>
    </div>` : ''}
  </aside>

  <section class="timeline">
    ${section.intro ? `
    <div class="post-head">
      <div class="kicker"><span class="kind">${esc(kind)}</span></div>
      <p class="lede">${esc(section.intro)}</p>
    </div>` : ''}

    ${filterBar}
    ${rowsOpen}${rows}${rowsClose}
  </section>

  <aside class="side-right" aria-label="related">
    ${topTags.length ? `
    <div class="group">
      <h2>by tag</h2>
      <ul>
        ${topTags.map(([t, n]) => `<li><a class="tg" href="${sectionPath}?tag=${encodeURIComponent(t)}" data-tag="${esc(t)}">${esc(t)}</a><span class="meta">${n}</span></li>`).join('\n        ')}
      </ul>
    </div>` : ''}
  </aside>
</main>`;

  // `listening` is its own nav surface; journal/making/thoughts all live
  // under the unified /blog/ timeline, so they highlight the blog nav item.
  const navActive = kind === 'listening' ? 'listening' : 'blog';

  return base({
    page: {
      title: kind,
      url: sectionPath,
      description: SECTION_DESCRIPTION[kind] || '',
      navActive,
      nowPlaying: nowPlaying || '',
      footerText: siteConfig.footerText ?? '',
      // Load the live-update poller only on /listening/. tag-filter.js wires
      // the ?tag= URL param + filter strip on article-kind listings
      // (journal/making/thoughts).
      bodyScripts: [
        kind === 'listening' ? `<script src="/${asset('listening-live.js')}" type="module"></script>` : '',
        kind !== 'listening' ? `<script src="/${asset('tag-filter.js')}" defer></script>` : '',
      ].filter(Boolean).join('\n'),
    },
    body,
  });
}
