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
    if (countEl && typeof data?.playcount === 'number' && data.playcount > 0) {
      // Match the server-side format: comma-grouped US locale.
      const next = Number(data.playcount).toLocaleString('en-US');
      if (countEl.textContent !== next) countEl.textContent = next;
    }

    if (listEl && Array.isArray(data?.tracks) && data.tracks.length) {
      const html = data.tracks.slice(0, MAX_ROWS).map(renderRow).join('\n');
      // Cheap dedupe: skip swap if markup is byte-identical to what's already there.
      if (listEl.innerHTML.trim() !== html.trim()) listEl.innerHTML = html;
    }
  }

  // Mirrors listeningRow() in templates/listing.js so client-side swaps match
  // the server-rendered markup exactly.
  function renderRow(t) {
    const title  = t.track  || '(untitled)';
    const artist = t.artist || '';
    const album  = t.album  ? ` <span class="meta">· ${esc(t.album)}</span>` : '';
    const when   = t.nowPlaying
      ? '<span class="dot" style="display:inline-block;width:.5rem;height:.5rem;border-radius:50%;background:var(--accent,#f77bc9);margin-right:.25rem;"></span>now'
      : esc(fmtDay(t.date));
    const year = esc(yearOf(t.date));
    const linkOpen  = t.link ? `<a href="${esc(t.link)}" rel="noopener">` : '';
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
  function fmtDay(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d)) return '';
    return `${MONTHS[d.getUTCMonth()]} ${String(d.getUTCDate()).padStart(2, '0')}`;
  }
  function yearOf(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d)) return '';
    return String(d.getUTCFullYear());
  }

  // Kick off immediately so the page reflects current state on load,
  // then poll for as long as the tab is open. Also re-tick when the tab
  // regains visibility or the page is restored from bfcache, so coming
  // back to a long-idle tab doesn't wait up to a full POLL_MS for fresh
  // scrobbles.
  tick();
  setInterval(tick, POLL_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') tick();
  });
  window.addEventListener('pageshow', tick);
})();
