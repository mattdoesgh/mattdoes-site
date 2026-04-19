// Listing — reverse-chrono index for /journal/, /making/, /listening/.
// One template, three call sites. Renders an empty-state when there are
// no entries so pages stay functional on a fresh vault.

import { base } from './base.js';
import { esc, fmtDate, tagList } from './_helpers.js';

function articleRow(entry) {
  const tags = tagList(entry.tags);
  return `
    <div class="row">
      <div class="gutter">
        <span class="kind">${esc(fmtDate(entry.date, 'day'))}</span>
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
    : esc(fmtDate(entry.date, 'day'));
  const linkOpen  = entry.link ? `<a href="${esc(entry.link)}" rel="noopener">` : '';
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

  // Tag index (only meaningful for article kinds).
  const tagCounts = new Map();
  if (kind !== 'listening') {
    for (const e of entries) for (const t of (e.tags || [])) tagCounts.set(t, (tagCounts.get(t) || 0) + 1);
  }
  const topTags = [...tagCounts.entries()].sort((a, b) => b[1] - a[1]);

  const body = `
<main class="page">
  <aside class="side-left" aria-label="page meta">
    <div class="ident">
      ${section.who ? `<div class="who">${esc(section.who)}</div>` : ''}
      ${section.bio ? `<div class="bio">${esc(section.bio)}</div>` : ''}
      <div class="stats">
        <span class="s"><span class="n">${statValue}</span>${statLabel}</span>
      </div>
    </div>

    ${showLastfm ? `
    <div class="group">
      <h3>source <span class="m">last.fm</span></h3>
      <ul>
        <li><a href="https://www.last.fm/user/${encodeURIComponent(siteConfig.lastfm.username)}" rel="noopener">last.fm/${esc(siteConfig.lastfm.username)}</a><span class="meta">↗</span></li>
      </ul>
    </div>` : ''}

    ${siteConfig.links && siteConfig.links.length ? `
    <div class="group">
      <h3>elsewhere</h3>
      <ul>
        ${siteConfig.links.filter(l => l.href).map(l => `<li><a href="${esc(l.href)}">${esc(l.label)}</a>${l.meta ? `<span class="meta">${esc(l.meta)}</span>` : ''}</li>`).join('\n        ')}
      </ul>
    </div>` : ''}
  </aside>

  <section class="timeline">
    ${section.intro ? `
    <div class="post-head">
      <div class="kicker"><span class="kind">${esc(kind)}</span></div>
      <p class="lede">${esc(section.intro)}</p>
    </div>` : ''}

    ${rows}
  </section>

  <aside class="side-right" aria-label="related">
    ${topTags.length ? `
    <div class="group">
      <h3>by tag</h3>
      <ul>
        ${topTags.map(([t, n]) => `<li><a class="tg" href="/tags/${encodeURIComponent(t)}/">${esc(t)}</a><span class="meta">${n}</span></li>`).join('\n        ')}
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
    },
    body,
  });
}
