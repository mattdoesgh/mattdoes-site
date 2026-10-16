// Listening row module. Shared verbatim by the build (ListingPage's rowsHtml)
// and the in-browser live updates (static/listening-live.js).
//
// This file runs in Node AND in the browser: it may import only
// ./_helpers.js (itself environment-agnostic) and must never touch node
// builtins, the DOM, or the network. Emit ships both files as hashed static
// assets; in the browser the relative import resolves via the importmap
// emitted by renderDocument (design-system/ssg/document.tsx).

import { esc, fmtDate, timeTag, safeUrl, relFor } from './_helpers.js';

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
 * @param {string} kind section key; only `listening` is a public section
 * @returns {string}
 */
export function emptyState(kind) {
  const copy = {
    listening: 'No scrobbles yet — check back after a listen.',
  }[kind] || 'Nothing here yet.';
  return `
    <div class="row">
      <div class="gutter"><span class="kind">—</span><span class="when"></span></div>
      <div><div class="body muted">${esc(copy)}</div></div>
    </div>`;
}
