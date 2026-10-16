// poller.js — the shared polling lifecycle for live-update enhancement
// scripts (now-playing.js, listening-live.js). Owns the whole machine:
// idempotent start/stop interval, visibility handling, bfcache restore, and
// prerender deferral. Consumers supply only their tick + interval;
// imported through the importmap like rows.js/_helpers.js so the hashed copy
// is fetched while the clean URL stays stable.

/**
 * Wire the full polling lifecycle around `tick`. Ticks once immediately,
 * then polls every `intervalMs` while the tab is visible. On a prerendered
 * document, everything is deferred until activation.
 */
export function createPoller({ tick, intervalMs }) {
  function start() {
    // Polling lifecycle. The interval only runs while the tab is visible
    // — a hidden tab does no useful work and shouldn't keep polling.
    // startPolling()/stopPolling() are idempotent.
    let pollId = 0;
    const startPolling = () => {
      if (pollId) return;
      pollId = setInterval(tick, intervalMs);
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

    // pageshow fires on the initial load too (right after the startup
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

  // Defer network work until a prerendered page is activated.
  if (document.prerendering) {
    document.addEventListener('prerenderingchange', () => { if (!document.prerendering) start(); }, { once: true });
  } else {
    start();
  }
}
