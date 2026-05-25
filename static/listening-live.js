// listening-live.js — keeps /listening/ fresh between deploys by polling
// /api/listening/recent and re-rendering the scrobble counter + the 25-row
// track list in place. Loaded only on the listening page (wired in
// templates/listing.js via page.bodyScripts). Fails silent on network hiccups.

(() => {
  const COUNT_ID   = 'scrobble-count';
  const LIST_ID    = 'listening-rows';
  const ENDPOINT   = '/api/listening/recent';
  const POLL_MS    = 60_000;            // one minute — matches now-playing.js
  const MAX_ROWS   = 25;                // keep in sync with site.config.js lastfm.limit
  const MONTHS     = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
  const SITE_TZ    = 'America/Chicago'; // must match templates/_helpers.js

  const countEl = document.getElementById(COUNT_ID);
  const listEl  = document.getElementById(LIST_ID);
  if (!countEl && !listEl) return;      // nothing to update — page shape changed

  async function tick() {
    try {
      const res = await fetch(ENDPOINT, { headers: { accept: 'application/json' }});
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      render(data);
    } catch {
      // Leave the last-rendered state in place on any failure.
    }
  }

  function render(data) {
    // The listening Worker tags every error/fallback payload with a
    // truthy `reason`; authoritative success payloads carry none. On a
    // marked failure, keep whatever is already on screen rather than
    // wiping it with a stale or empty fallback.
    if (!data || data.reason) return;

    // Authoritative update: trust ANY numeric playcount, including 0.
    if (countEl && typeof data.playcount === 'number') {
      // Match the server-side format: comma-grouped US locale.
      const next = Number(data.playcount).toLocaleString('en-US');
      if (countEl.textContent !== next) countEl.textContent = next;
    }

    // Authoritative update: trust ANY array of tracks, including []. An
    // empty array renders the same muted empty-state row the server
    // emits via emptyState('listening') in templates/listing.js.
    if (listEl && Array.isArray(data.tracks)) {
      const html = data.tracks.length
        ? data.tracks.slice(0, MAX_ROWS).map(renderRow).join('\n')
        : emptyRow();
      // Cheap dedupe: skip swap if markup is byte-identical to what's already there.
      if (listEl.innerHTML.trim() !== html.trim()) listEl.innerHTML = html;
    }
  }

  // Mirrors emptyState('listening') in templates/listing.js so a valid
  // empty result renders the same muted row the server would.
  function emptyRow() {
    return `
    <div class="row">
      <div class="gutter"><span class="kind">—</span><span class="when"></span></div>
      <div><div class="body muted">No scrobbles yet — check back after a listen.</div></div>
    </div>`;
  }

  // Mirrors listeningRow() in templates/listing.js so client-side swaps match
  // the server-rendered markup exactly — including the <time class="ts">
  // wrapper that local-time.js uses to attach a visitor-local tooltip.
  function renderRow(t) {
    const title  = t.track  || '(untitled)';
    const artist = t.artist || '';
    const album  = t.album  ? ` <span class="meta">· ${esc(t.album)}</span>` : '';
    const when   = t.nowPlaying
      ? '<span class="dot now-dot"></span>now'
      : timeTag(t.date, 'day');
    const year = esc(yearOf(t.date));
    const linkOpen  = t.link ? `<a href="${esc(safeUrl(t.link))}" rel="noopener noreferrer">` : '';
    const linkClose = t.link ? `</a>` : '';
    return `
    <div class="row">
      <div class="gutter">
        <span class="kind">${when}</span>
        <span class="when">${year}</span>
      </div>
      <div>
        <div class="body">
          ${linkOpen}<strong>${esc(title)}</strong>${linkClose}
          ${artist ? ` — ${esc(artist)}` : ''}${album}
        </div>
      </div>
    </div>`;
  }

  function esc(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  // Mirror templates/_helpers.js safeUrl() — refuse anything that isn't
  // an http(s)/mailto/anchor/relative URL so a poisoned Last.fm payload
  // (or a future API change) can't slip a `javascript:` href through.
  function safeUrl(url) {
    if (url == null) return '';
    const s = String(url).trim();
    if (s === '') return '';
    if (/^(https?:|mailto:|tel:|#|\/|\.\/|\.\.\/)/i.test(s)) return s;
    return '#';
  }
  // Wall-clock parts in SITE_TZ. Matches tzParts() in templates/_helpers.js.
  function ctParts(iso) {
    const d = iso instanceof Date ? iso : new Date(iso);
    if (isNaN(d)) return null;
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: SITE_TZ,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
      hour12: false,
    }).formatToParts(d);
    const o = {};
    for (const p of parts) if (p.type !== 'literal') o[p.type] = p.value;
    if (o.hour === '24') o.hour = '00';
    return o;
  }
  function fmtDay(iso) {
    const p = ctParts(iso);
    if (!p) return '';
    return `${MONTHS[Number(p.month) - 1]} ${p.day}`;
  }
  function yearOf(iso) {
    const p = ctParts(iso);
    return p ? p.year : '';
  }
  // Emit a <time class="ts"> wrapper matching the server-rendered markup;
  // local-time.js (loaded globally from base.js) will fill in the tooltip
  // when the element is inserted into the DOM.
  function timeTag(iso, fmt) {
    const d = iso instanceof Date ? iso : new Date(iso);
    if (isNaN(d)) return '';
    const text = fmt === 'day' ? fmtDay(d) : fmtDay(d);
    return `<time class="ts" datetime="${esc(d.toISOString())}">${esc(text)}</time>`;
  }

  // Polling lifecycle. We only run the interval while the tab is
  // visible — a backgrounded tab does no useful work and shouldn't
  // burn network/CPU. startPolling()/stopPolling() are idempotent.
  let pollId = 0;
  function startPolling() {
    if (pollId) return;
    pollId = setInterval(tick, POLL_MS);
  }
  function stopPolling() {
    if (!pollId) return;
    clearInterval(pollId);
    pollId = 0;
  }

  // Kick off immediately so the page reflects current state on load,
  // then poll for as long as the tab stays visible.
  tick();
  if (document.visibilityState === 'visible') startPolling();

  // On tab-hide, stop the interval entirely; on regaining visibility,
  // tick once to catch up immediately and resume the interval.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      tick();
      startPolling();
    } else {
      stopPolling();
    }
  });

  // pageshow fires on the initial load too (right after our startup
  // tick above), which would double-fire an identical request. Only
  // re-tick when the page is genuinely restored from the bfcache
  // (event.persisted) — the case that actually needs a refresh.
  window.addEventListener('pageshow', (e) => {
    if (e.persisted) {
      tick();
      if (document.visibilityState === 'visible') startPolling();
    }
  });
})();
