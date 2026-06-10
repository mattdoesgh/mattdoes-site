// Row module — the rendered form of one timeline entry (see CONTEXT.md:
// Row). One renderer per content kind plus a per-kind empty state, shared
// verbatim by every timeline surface: /blog/, the section listings
// (templates/listing.js), and the in-browser listening live updates
// (static/listening-live.js). The homepage's compact feed is deliberately
// not a Row consumer.
//
// This file runs in Node AND in the browser: it may import only
// ./_helpers.js (itself environment-agnostic) and must never touch node
// builtins, the DOM, or the network. Emit ships both files as hashed static
// assets; in the browser the relative import resolves via the importmap
// emitted by templates/base.js (see docs/adr/0001).

import { esc, fmtDate, timeTag, tagList, safeUrl, relFor } from './_helpers.js';

/**
 * Article row (journal/making). `showKind` marks a mixed-kind timeline
 * (/blog/): the gutter leads with the kind label and the row carries a
 * `data-kind` attribute for kind filtering; single-kind listings lead with
 * the date and show the read time instead.
 *
 * @param {object} entry article entry (url, title, date, summary?, readTime?, tags?, kind)
 * @param {{ showKind?: boolean }} [opts]
 * @returns {string}
 */
export function articleRow(entry, { showKind = false } = {}) {
  const tags = tagList(entry.tags);
  const tagAttr = esc((entry.tags || []).join(' '));
  const kindAttr = showKind ? ` data-kind="${esc(entry.kind)}"` : '';
  const kindCell = showKind ? esc(entry.kind) : timeTag(entry.date, 'day');
  const whenCell = showKind
    ? timeTag(entry.date, 'day')
    : (entry.readTime ? esc(entry.readTime) : '');
  // entry.url is a build-generated route string; esc() it anyway so any
  // future entry-derived URL stays attribute-safe (finding C1).
  return `
    <div class="row"${kindAttr} data-tags="${tagAttr}">
      <div class="gutter">
        <span class="kind">${kindCell}</span>
        <span class="when">${whenCell}</span>
      </div>
      <div>
        <div class="body">
          <a href="${esc(entry.url)}"><strong>${esc(entry.title)}</strong></a>${entry.summary ? ` — ${esc(entry.summary)}` : ''}
          ${tags}
        </div>
      </div>
    </div>`;
}

/**
 * Microblog row. A thought has no `.url`/`.title` — just rendered `.html`,
 * an `.id` fragment anchor, and optional `.tags`. The permalink doubles as
 * the fragment target so #t-<id> deep-links straight to the entry — on
 * /thoughts/ directly, and on /blog/?kind=thought once the old
 * /thoughts/#t-NNN URLs follow the 301 chain.
 *
 * @param {object} entry thought entry (html|body, date, id?, tags?, quote?)
 * @returns {string}
 */
export function thoughtRow(entry) {
  const tagAttr = esc((entry.tags || []).join(' '));
  const bodyClass = entry.quote ? 'body q' : 'body';
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

/**
 * Scrobble row. Works on both the build-time Listening snapshot and the
 * worker's live payload (same field names); `safeUrl`/`relFor` run here so
 * an untrusted Last.fm link is neutralized on either path. The markup is
 * the dedupe contract for listening-live.js's innerHTML swap — server and
 * client output come from this one function.
 *
 * @param {object} entry track (track?, artist?, album?, link?, date, nowPlaying?)
 * @returns {string}
 */
export function listeningRow(entry) {
  const title  = entry.track || '(untitled)';
  const artist = entry.artist || '';
  const album  = entry.album ? ` <span class="meta">· ${esc(entry.album)}</span>` : '';
  const when = entry.nowPlaying
    ? '<span class="dot now-dot"></span>now'
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

/**
 * Muted empty-state row with the section's copy, so pages stay functional
 * (and identical between server render and a valid-but-empty live update)
 * when a timeline has no entries.
 *
 * @param {string} kind 'journal' | 'making' | 'listening' | 'thoughts' | 'blog'
 * @returns {string}
 */
export function emptyState(kind) {
  const copy = {
    journal:   'No journal entries yet.',
    making:    'Nothing posted to making yet.',
    listening: 'No scrobbles yet — check back after a listen.',
    thoughts:  'No thoughts yet — check back soon.',
    blog:      'Nothing published yet.',
  }[kind] || 'Nothing here yet.';
  return `
    <div class="row">
      <div class="gutter"><span class="kind">—</span><span class="when"></span></div>
      <div><div class="body muted">${esc(copy)}</div></div>
    </div>`;
}
