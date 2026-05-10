// Homepage — three-column feed mixing every content type in reverse-chrono.

import { base } from './base.js';
import { asset } from './_assets.js';
import { esc, fmtDate, fmtIsoDay, relTime, tagList, safeUrl, relFor } from './_helpers.js';

function row(entry) {
  const kind = entry.kind; // journal | thought | making | listening
  // Homepage shows a compact "2h"/"3d"/"apr 17" label; wrap in <time> so
  // the tooltip script can surface the full CT timestamp + visitor-local
  // equivalent on hover.
  const iso  = entry.date instanceof Date ? entry.date.toISOString() : new Date(entry.date).toISOString();
  const when = `<time class="ts" datetime="${iso}">${esc(relTime(entry.date))}</time>`;
  const permalinkLabel = kind === 'thought'
    ? (entry.permalinkLabel || '#')
    : kind === 'listening'
      ? '↗ listening'
      : (entry.readTime || '');
  const permalink = entry.url
    ? `<a class="permalink" href="${entry.url}">${esc(permalinkLabel)}</a>`
    : '';
  const actions = `<div class="actions">${permalink}</div>`;
  let body;
  if (entry.quote) {
    body = `<div class="body q">${entry.html || esc(entry.body || '')}</div>`;
  } else if (kind === 'listening') {
    const title = entry.track ? esc(entry.track) : (entry.title ? esc(entry.title) : '(untitled)');
    const artist = entry.artist ? ` — ${esc(entry.artist)}` : '';
    const album = entry.album ? ` <span class="meta">· ${esc(entry.album)}</span>` : '';
    body = `<div class="body"><strong>${title}</strong>${artist}${album}${entry.nowPlaying ? ' <span class="meta">· now</span>' : ''}</div>`;
  } else if ((kind === 'journal' || kind === 'making') && entry.url) {
    body = `<div class="body"><a href="${entry.url}"><strong>${esc(entry.title)}</strong></a>${entry.summary ? ` — ${esc(entry.summary)}` : ''} ${tagList(entry.tags)}</div>`;
  } else {
    body = `<div class="body">${entry.html || esc(entry.body || '')} ${tagList(entry.tags)}</div>`;
  }
  const tagAttr = esc((entry.tags || []).join(' '));
  return `
    <div class="row" data-tags="${tagAttr}">
      <div class="gutter"><span class="kind">${esc(kind)}</span><span class="when">${when}</span></div>
      <div>
        ${body}
        ${actions}
      </div>
    </div>`;
}

function groupByDay(entries) {
  const groups = new Map();
  for (const e of entries) {
    const key = fmtDate(e.date, 'iso');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(e);
  }
  return [...groups.entries()].sort((a, b) => b[0].localeCompare(a[0]));
}

export function indexPage({ site, entries }) {
  const groups = groupByDay(entries).slice(0, 6); // most recent ~6 days
  const today = fmtDate(new Date(), 'iso');
  const timeline = groups.length ? groups.map(([day, rows]) => {
    const label = day === today ? `today · ${fmtIsoDay(day)}` : `${fmtIsoDay(day)} · ${day.slice(0, 4)}`;
    return `
    <div class="tl-divider"><span>${label}</span><span>${rows.length}</span></div>
    ${rows.map(row).join('\n')}`;
  }).join('\n') : `
    <div class="row">
      <div class="gutter"><span class="kind">—</span><span class="when"></span></div>
      <div><div class="body muted">Nothing published yet.</div></div>
    </div>`;

  // Filter strip — built from the tags actually present in the visible feed.
  // tag-filter.js (loaded below) reads `?tag=` from the URL on load and toggles
  // rows by data-tags, so a /?tag=foo URL is a deep-linkable filtered view.
  const visibleEntries = groups.flatMap(([, rows]) => rows);
  const tagCounts = new Map();
  for (const e of visibleEntries) {
    for (const t of (e.tags || [])) tagCounts.set(t, (tagCounts.get(t) || 0) + 1);
  }
  const topTags = [...tagCounts.entries()].sort((a, b) => b[1] - a[1]);
  const filterBar = topTags.length ? `
    <div class="filter">
      <span class="label">filter</span>
      <a href="/" class="on all" data-filter="">all</a>
      ${topTags.slice(0, 6).map(([tag]) => `<a href="/?tag=${encodeURIComponent(tag)}" data-filter="${esc(tag)}">${esc(tag)}</a>`).join('\n      ')}
      <span class="cnt">${visibleEntries.length} entries</span>
    </div>` : '';

  const counts = site.counts || { journal: 0, thoughts: 0, making: 0, listening: 0, scrobbles: 0 };
  const scrobbles = Number(counts.scrobbles || 0).toLocaleString('en-US');
  const identity = site.identity || {};
  const identityLine = [identity.name, identity.handle].filter(Boolean).join(' · ');
  const links = site.links || [];
  const config = site.config || {};

  const body = `
<main class="page">

  <aside class="side-left" aria-label="page meta">
    <div class="ident">
      ${identityLine ? `<div class="who">${esc(identityLine)}</div>` : ''}
      ${site.bio ? `<div class="bio">${esc(site.bio)}</div>` : ''}
      <div class="stats">
        <span class="s"><span class="n">${counts.journal}</span>journal</span>
        <span class="s"><span class="n">${counts.thoughts}</span>thoughts</span>
        <span class="s"><span class="n">${counts.making}</span>making</span>
        <span class="s"><span class="n" id="scrobble-count">${scrobbles}</span>scrobbles</span>
      </div>
    </div>

    ${links.length ? `
    <div class="group">
      <h3>elsewhere</h3>
      <ul>
        ${links.filter(l => l.href).map(l => `<li><a href="${esc(safeUrl(l.href))}"${relFor(l.href)}>${esc(l.label)}</a>${l.meta ? `<span class="meta">${esc(l.meta)}</span>` : ''}</li>`).join('\n        ')}
      </ul>
    </div>` : ''}
  </aside>

  <section class="timeline">
    ${filterBar}
    ${timeline}
    ${entries.length ? `<div class="loadmore"><a href="/thoughts/">load older →</a></div>` : ''}
  </section>

  <aside class="side-right" aria-label="related">
    ${topTags.length ? `
    <div class="group">
      <h3>trending tags</h3>
      <ul>
        ${topTags.slice(0, 12).map(([tag, count]) => `<li><a class="tg" href="/?tag=${encodeURIComponent(tag)}" data-tag="${esc(tag)}">${esc(tag)}</a><span class="meta">${count}</span></li>`).join('\n        ')}
      </ul>
    </div>` : ''}
  </aside>

</main>`;

  return base({
    page: {
      title: '',
      navActive: 'all',
      nowPlaying: site.nowPlaying || '',
      footerText: config.footerText ?? '',
      // Share the /listening/ poller to keep the scrobble counter fresh
      // between deploys. It no-ops if #listening-rows isn't on the page.
      // tag-filter.js wires the ?tag= URL param + filter strip to in-place
      // row hiding.
      bodyScripts: `<script src="/${asset('listening-live.js')}" defer></script>
<script src="/${asset('tag-filter.js')}" defer></script>`,
    },
    body,
  });
}
