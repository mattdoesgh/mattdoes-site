// Listing — reverse-chrono index for /journal/, /making/, /listening/.
// One template, three call sites. Renders an empty-state when there are
// no entries so pages stay functional on a fresh vault.

import { base } from './base.js';
import { asset } from './_assets.js';
import { esc, fmtDate, timeTag, tagList, safeUrl, relFor } from './_helpers.js';

// Pretty-name for the section we're listing — used in URLs and filter links.
const SECTION_PATH = { journal: '/journal/', making: '/making/', listening: '/listening/' };

function articleRow(entry) {
  const tags = tagList(entry.tags);
  const tagAttr = esc((entry.tags || []).join(' '));
  return `
    <div class="row" data-tags="${tagAttr}">
      <div class="gutter">
        <span class="kind">${timeTag(entry.date, 'day')}</span>
        <span class="when">${entry.readTime ? esc(entry.readTime) : ''}</span>
      </div>
      <div>
        <div class="body">
          <a href="${entry.url}"><strong>${esc(entry.title)}</strong></a>${entry.summary ? ` — ${esc(entry.summary)}` : ''}
          ${tags}
        </div>
      </div>
    </div>`;
}

function listeningRow(entry) {
  const title  = entry.track || '(untitled)';
  const artist = entry.artist || '';
  const album  = entry.album ? ` <span class="meta">· ${esc(entry.album)}</span>` : '';
  const when = entry.nowPlaying
    ? '<span class="dot" style="display:inline-block;width:.5rem;height:.5rem;border-radius:50%;background:var(--accent,#f77bc9);margin-right:.25rem;"></span>now'
    : timeTag(entry.date, 'day');
  const linkOpen  = entry.link ? `<a href="${esc(safeUrl(entry.link))}"${relFor(entry.link) || ' rel="noopener"'}>` : '';
  const linkClose = entry.link ? `</a>` : '';
  return `
    <div class="row">
      <div class="gutter">
        <span class="kind">${when}</span>
        <span class="when">${esc(fmtDate(entry.date, 'iso').slice(0, 4))}</span>
      </div>
      <div>
        <div class="body">
          ${linkOpen}<strong>${esc(title)}</strong>${linkClose}
          ${artist ? ` — ${esc(artist)}` : ''}${album}
        </div>
      </div>
    </div>`;
}

function emptyState(kind) {
  const copy = {
    journal:   'No journal entries yet.',
    making:    'Nothing posted to making yet.',
    listening: 'No scrobbles yet — check back after a listen.',
  }[kind] || 'Nothing here yet.';
  return `
    <div class="row">
      <div class="gutter"><span class="kind">—</span><span class="when"></span></div>
      <div><div class="body" style="color:var(--mute);">${esc(copy)}</div></div>
    </div>`;
}

export function listingPage({ siteConfig, kind, entries, nowPlaying, totalScrobbles }) {
  const section = (siteConfig.sections && siteConfig.sections[kind]) || {};
  const showLastfm = kind === 'listening' && siteConfig.lastfm?.showUser && siteConfig.lastfm?.username;
  const rows = entries.length
    ? entries.map(kind === 'listening' ? listeningRow : articleRow).join('\n')
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
      <a href="${sectionPath}" class="on all" data-filter="">all</a>
      ${topTags.slice(0, 8).map(([tag]) => `<a href="${sectionPath}?tag=${encodeURIComponent(tag)}" data-filter="${esc(tag)}">${esc(tag)}</a>`).join('\n      ')}
      <span class="cnt">${entries.length} ${statLabel}</span>
    </div>` : '';

  const body = `
<main class="page">
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
      <h3>source <span class="m">last.fm</span></h3>
      <ul>
        <li><a href="https://www.last.fm/user/${encodeURIComponent(siteConfig.lastfm.username)}" rel="noopener noreferrer">last.fm/${esc(siteConfig.lastfm.username)}</a><span class="meta">↗</span></li>
      </ul>
    </div>` : ''}

    ${siteConfig.links && siteConfig.links.length ? `
    <div class="group">
      <h3>elsewhere</h3>
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
      <h3>by tag</h3>
      <ul>
        ${topTags.map(([t, n]) => `<li><a class="tg" href="${sectionPath}?tag=${encodeURIComponent(t)}" data-tag="${esc(t)}">${esc(t)}</a><span class="meta">${n}</span></li>`).join('\n        ')}
      </ul>
    </div>` : ''}
  </aside>
</main>`;

  return base({
    page: {
      title: kind,
      navActive: kind,
      nowPlaying: nowPlaying || '',
      footerText: siteConfig.footerText ?? '',
      // Load the live-update poller only on /listening/. tag-filter.js wires
      // the ?tag= URL param + filter strip on article-kind listings.
      bodyScripts: [
        kind === 'listening' ? `<script src="/${asset('listening-live.js')}" defer></script>` : '',
        kind !== 'listening' ? `<script src="/${asset('tag-filter.js')}" defer></script>` : '',
      ].filter(Boolean).join('\n'),
    },
    body,
  });
}
