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

  // Also re-tick on tab-visibility and bfcache restore so the pill
  // catches up immediately when Matt comes back to the tab.
  tick();
  setInterval(tick, POLL_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') tick();
  });
  window.addEventListener('pageshow', tick);
})();
