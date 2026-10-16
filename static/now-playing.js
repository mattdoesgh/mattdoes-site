// now-playing.js — keeps the topbar status pill in sync with Last.fm
// between deploys. Polls /api/listening/now, updates in place, fails silent.
// Loaded as type="module" so the poller import resolves through the importmap.

import { createPoller } from './poller.js';

const EL_ID     = 'now-playing';
const ENDPOINT  = '/api/listening/now';
const POLL_MS   = 60_000;      // one minute
const MAX_LEN   = 60;          // truncate very long "artist — track" strings

const el = document.getElementById(EL_ID);

// createPoller owns the whole lifecycle: visibility, bfcache restore,
// and prerender deferral.
if (el) createPoller({ tick, intervalMs: POLL_MS });

async function tick() {
  try {
    // no-store: the Worker sends max-age=0, but Cloudflare's Browser Cache
    // TTL can rewrite that to a long max-age on edge HITs, which would
    // freeze the pill behind a stale browser cache. Force a fresh poll each
    // time; the request path is a cheap KV read.
    const res = await fetch(ENDPOINT, { headers: { accept: 'application/json' }, cache: 'no-store' });
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
    // Rebuild the pill's SSG structure (dot + .status-text) rather than
    // flattening it to a text node — the dot would vanish and the CSS
    // ellipsis clamp lives on .status-text.
    el.replaceChildren();
    const dot = document.createElement('span');
    dot.className = 'dot';
    dot.setAttribute('aria-hidden', 'true');
    const label = document.createElement('span');
    label.className = 'status-text';
    label.textContent = text;
    el.append(dot, label);
    el.hidden      = false;
    el.dataset.state = 'playing';
  } else {
    el.replaceChildren();
    el.hidden      = true;
    el.dataset.state = 'idle';
  }
}
