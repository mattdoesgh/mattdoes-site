// listening-live.js — keeps /listening/ fresh between deploys by polling
// /api/listening/recent and re-rendering the scrobble counter + the 25-row
// track list in place. Loaded as type="module" only where wired in
// (the ListingPage / IndexPage in the design system); the Row module import
// below resolves through the importmap emitted by renderDocument
// (design-system/ssg/document.tsx), so the
// markup we swap in comes from the exact same code that rendered the page
// (see CONTEXT.md: Row, docs/adr/0001). Fails silent on network hiccups.

import { listeningRow, emptyState } from './rows.js';

const COUNT_ID   = 'scrobble-count';
const LIST_ID    = 'listening-rows';
const ENDPOINT   = '/api/listening/recent';
const POLL_MS    = 60_000;            // one minute — matches now-playing.js
const MAX_ROWS   = 25;                // keep in sync with site.config.js lastfm.limit

const countEl = document.getElementById(COUNT_ID);
const listEl  = document.getElementById(LIST_ID);

// Only wire up polling when there's something to update — if neither
// element exists the page shape changed and this script should no-op.
function start() {
if (countEl || listEl) {
  // Polling lifecycle. We only run the interval while the tab is
  // visible — a backgrounded tab does no useful work and shouldn't
  // burn network/CPU. startPolling()/stopPolling() are idempotent.
  let pollId = 0;
  const startPolling = () => {
    if (pollId) return;
    pollId = setInterval(tick, POLL_MS);
  };
  const stopPolling = () => {
    if (!pollId) return;
    clearInterval(pollId);
    pollId = 0;
  };

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
}
}

// Defer network work until a prerendered page is activated (ADR 0007).
if (document.prerendering) {
  document.addEventListener('prerenderingchange', () => { if (!document.prerendering) start(); }, { once: true });
} else {
  start();
}

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
  // empty array renders the same muted empty-state row the server emits.
  // listeningRow/emptyState are the shared Row module — byte-for-byte the
  // markup the server rendered — so the dedupe below can skip the swap
  // when nothing changed.
  if (listEl && Array.isArray(data.tracks)) {
    const html = data.tracks.length
      ? data.tracks.slice(0, MAX_ROWS).map(listeningRow).join('\n')
      : emptyState('listening');
    // Cheap dedupe: skip swap if markup is byte-identical to what's already there.
    if (listEl.innerHTML.trim() !== html.trim()) listEl.innerHTML = html;
  }
}
