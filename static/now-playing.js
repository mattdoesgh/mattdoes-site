// now-playing.js — keeps the topbar status pill in sync with Last.fm
// between deploys. Polls /api/listening/now, updates in place, fails silent.

(() => {
  const EL_ID     = 'now-playing';
  const ENDPOINT  = '/api/listening/now';
  const POLL_MS   = 60_000;      // one minute
  const MAX_LEN   = 60;          // truncate very long "artist — track" strings

  const el = document.getElementById(EL_ID);
  if (!el) return;

  async function tick() {
    try {
      const res = await fetch(ENDPOINT, { headers: { accept: 'application/json' }});
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      render(data);
    } catch {
      // Network or Worker hiccup — leave the last rendered state in place.
    }
  }

  function render(data) {
    if (data && data.nowPlaying) {
      const line = `now: ${[data.artist, data.track].filter(Boolean).join(' — ')}`;
      const text = line.length > MAX_LEN ? line.slice(0, MAX_LEN - 1) + '…' : line;
      el.textContent = text;
      el.hidden      = false;
      el.dataset.state = 'playing';
    } else {
      el.textContent = '';
      el.hidden      = true;
      el.dataset.state = 'idle';
    }
  }

  // Polling lifecycle. The interval only runs while the tab is visible
  // — a hidden tab does no useful work and shouldn't keep polling.
  // startPolling()/stopPolling() are idempotent.
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

  // Kick off immediately, then poll while the tab stays visible.
  tick();
  if (document.visibilityState === 'visible') startPolling();

  // On tab-hide, stop the interval; on regaining visibility, tick once
  // to catch up and resume the interval.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      tick();
      startPolling();
    } else {
      stopPolling();
    }
  });

  // pageshow fires on the initial load too (right after the startup
  // tick), which would double-fire an identical request. Only re-tick
  // when the page is genuinely restored from the bfcache.
  window.addEventListener('pageshow', (e) => {
    if (e.persisted) {
      tick();
      if (document.visibilityState === 'visible') startPolling();
    }
  });
})();
