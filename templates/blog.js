// Blog — unified reverse-chrono listing for journal + making + thoughts.
// Replaces the three separate kind-listing pages. Rows carry both
// `data-kind` and `data-tags` so tag-filter.js can filter by either or
// both via `?kind=` and `?tag=` URL params.

import { base } from './base.js';
import { asset } from './_assets.js';
import { esc, timeTag, tagList, safeUrl, relFor } from './_helpers.js';

function articleRow(entry) {
  const tags = tagList(entry.tags);
  const tagAttr = esc((entry.tags || []).join(' '));
  return `
    <div class="row" data-kind="${esc(entry.kind)}" data-tags="${tagAttr}">
      <div class="gutter">
        <span class="kind">${esc(entry.kind)}</span>
        <span class="when">${timeTag(entry.date, 'day')}</span>
      </div>
      <div>
        <div class="body">
          <a href="${entry.url}"><strong>${esc(entry.title)}</strong></a>${entry.summary ? ` — ${esc(entry.summary)}` : ''}
          ${tags}
        </div>
      </div>
    </div>`;
}

function thoughtRow(entry) {
  const tagAttr = esc((entry.tags || []).join(' '));
  const bodyClass = entry.quote ? 'body q' : 'body';
  // Permalink ids land on /blog/?kind=thought#t-NNN once the old
  // /thoughts/#t-NNN URLs follow the 301 chain.
  return `
    <div class="row" data-kind="thought" data-tags="${tagAttr}">
      <div class="gutter">
        <span class="kind">thought</span>
        <span class="when">${timeTag(entry.date, 'day')}</span>
      </div>
      <div>
        <div class="${bodyClass}">${entry.html || esc(entry.body || '')}${(entry.tags && entry.tags.length && !entry.quote) ? ' ' + tagList(entry.tags) : ''}</div>
        ${entry.id ? `<div class="actions"><a class="permalink" href="#${esc(entry.id)}" id="${esc(entry.id)}">#${esc(entry.id)}</a></div>` : ''}
      </div>
    </div>`;
}

function emptyRow() {
  return `
    <div class="row">
      <div class="gutter"><span class="kind">—</span><span class="when"></span></div>
      <div><div class="body" style="color:var(--mute);">Nothing published yet.</div></div>
    </div>`;
}

export function blogPage({ siteConfig, entries, nowPlaying }) {
  // Tally kinds + tags from the visible entry set so chips never show
  // a filter that wouldn't match anything.
  const kindCounts = new Map();
  const tagCounts  = new Map();
  for (const e of entries) {
    kindCounts.set(e.kind, (kindCounts.get(e.kind) || 0) + 1);
    for (const t of (e.tags || [])) tagCounts.set(t, (tagCounts.get(t) || 0) + 1);
  }
  const kinds   = [...kindCounts.entries()].sort((a, b) => b[1] - a[1]);
  const topTags = [...tagCounts.entries()].sort((a, b) => b[1] - a[1]);

  const rows = entries.length
    ? entries.map(e => e.kind === 'thought' ? thoughtRow(e) : articleRow(e)).join('\n')
    : emptyRow();

  const filterBar = `
    <div class="filter">
      <span class="label">filter</span>
      <a href="/blog/" class="on all" data-filter="" data-kind-filter="">all</a>
      ${kinds.map(([k]) => `<a href="/blog/?kind=${encodeURIComponent(k)}" data-kind-filter="${esc(k)}">${esc(k)}</a>`).join('\n      ')}
      ${topTags.slice(0, 8).map(([tag]) => `<a href="/blog/?tag=${encodeURIComponent(tag)}" data-filter="${esc(tag)}">${esc(tag)}</a>`).join('\n      ')}
      <span class="cnt">${entries.length} entries</span>
    </div>`;

  const body = `
<main class="page" id="main">
  <h1 class="visually-hidden">blog</h1>

  <aside class="side-left" aria-label="page meta">
    <div class="ident">
      <div class="who">blog</div>
      <div class="bio">posts, micro-thoughts, building-in-public — one timeline, reverse-chronological.</div>
      <div class="stats">
        <span class="s"><span class="n">${entries.length}</span>entries</span>
        <span class="s"><span class="n">${tagCounts.size}</span>tags</span>
      </div>
    </div>

    ${siteConfig.links && siteConfig.links.length ? `
    <div class="group">
      <h2>elsewhere</h2>
      <ul>
        ${siteConfig.links.filter(l => l.href).map(l => `<li><a href="${esc(safeUrl(l.href))}"${relFor(l.href)}>${esc(l.label)}</a>${l.meta ? `<span class="meta">${esc(l.meta)}</span>` : ''}</li>`).join('\n        ')}
      </ul>
    </div>` : ''}
  </aside>

  <section class="timeline">
    ${filterBar}
    ${rows}
  </section>

  <aside class="side-right" aria-label="related">
    ${topTags.length ? `
    <div class="group">
      <h2>by tag</h2>
      <ul>
        ${topTags.map(([t, n]) => `<li><a class="tg" href="/blog/?tag=${encodeURIComponent(t)}" data-tag="${esc(t)}">${esc(t)}</a><span class="meta">${n}</span></li>`).join('\n        ')}
      </ul>
    </div>` : ''}

    <div class="group">
      <h2>subscribe</h2>
      <ul>
        <li><a href="/feed.xml">rss</a><span class="meta">.xml</span></li>
      </ul>
    </div>
  </aside>
</main>`;

  return base({
    page: {
      title: 'blog',
      navActive: 'blog',
      nowPlaying: nowPlaying || '',
      footerText: siteConfig.footerText ?? '',
      bodyScripts: `<script src="/${asset('tag-filter.js')}" defer></script>`,
    },
    body,
  });
}
