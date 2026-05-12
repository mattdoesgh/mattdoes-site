// Homepage — summary block + three-thought highlight grid + recent
// listening section. Replaces the day-grouped timeline; the full mixed
// feed lives at /blog/. The listening rows here share the #listening-rows
// id with the /listening/ page so the live poller keeps both fresh, but
// the homepage caps the visible count at 3 via `data-max="3"`.

import { base } from './base.js';
import { asset } from './_assets.js';
import { esc, fmtDate, timeTag, safeUrl, relFor } from './_helpers.js';

function thoughtCard(t) {
  // timeTag() returns a `<time class="ts">…</time>` — drop it inside the
  // anchor as the only child so local-time.js still attaches its tooltip
  // without nesting two `<time>` elements.
  const day = timeTag(t.date, 'day');
  const bodyClass = t.quote ? 'body q' : 'body';
  return `
    <article class="thought-card" data-id="${esc(t.id)}">
      <a class="card-link" href="/blog/#${esc(t.id)}">${day}</a>
      <div class="${bodyClass}">${t.html || esc(t.body || '')}</div>
    </article>`;
}

// Mirrors listening-live.js renderRow() and listing.js listeningRow() so
// the initial server render and the polled swap produce identical markup.
function trackRow(t) {
  const title  = t.track  || t.title || '(untitled)';
  const artist = t.artist || '';
  const album  = t.album  ? ` <span class="meta">· ${esc(t.album)}</span>` : '';
  const when = t.nowPlaying
    ? '<span class="dot" style="display:inline-block;width:.5rem;height:.5rem;border-radius:50%;background:var(--accent,#f77bc9);margin-right:.25rem;"></span>now'
    : timeTag(t.date, 'day');
  const year = esc(fmtDate(t.date, 'iso').slice(0, 4));
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

export function indexPage({ site, recentThoughts, recentTracks, topArtistRecent, scrobbles7d }) {
  const counts = site.counts || { journal: 0, thoughts: 0, making: 0, listening: 0, scrobbles: 0 };
  const scrobblesFmt = Number(counts.scrobbles || 0).toLocaleString('en-US');
  const postsCount   = (counts.journal || 0) + (counts.making || 0);
  const identity = site.identity || {};
  const identityLine = [identity.name, identity.handle].filter(Boolean).join(' · ');
  const bio = identity.bio || site.bio || '';
  const links = site.links || [];
  const config = site.config || {};

  const thoughtCards = (recentThoughts || []).length
    ? recentThoughts.map(thoughtCard).join('\n')
    : `<div class="thought-card empty">No thoughts yet.</div>`;

  const trackRows = (recentTracks || []).length
    ? recentTracks.map(trackRow).join('\n')
    : `<div class="row"><div class="gutter"><span class="kind">—</span><span class="when"></span></div><div><div class="body" style="color:var(--mute);">No tracks yet.</div></div></div>`;

  const listeningHeader = topArtistRecent
    ? `<div class="listening-summary">
        <span>top this week: <strong>${esc(topArtistRecent.name)}</strong></span>
        ${scrobbles7d ? `<span>${scrobbles7d} scrobble${scrobbles7d === 1 ? '' : 's'} · last 7 days</span>` : ''}
      </div>`
    : '';

  const body = `
<main class="page" id="main">
  <h1 class="visually-hidden">home</h1>

  <aside class="side-left" aria-label="page meta">
    <div class="ident">
      ${identityLine ? `<div class="who">${esc(identityLine)}</div>` : ''}
    </div>

    ${links.length ? `
    <div class="group">
      <h2>elsewhere</h2>
      <ul>
        ${links.filter(l => l.href).map(l => `<li><a href="${esc(safeUrl(l.href))}"${relFor(l.href)}>${esc(l.label)}</a>${l.meta ? `<span class="meta">${esc(l.meta)}</span>` : ''}</li>`).join('\n        ')}
      </ul>
    </div>` : ''}
  </aside>

  <section class="timeline">
    <div class="summary">
      ${bio ? `<p class="lede">${esc(bio)}</p>` : ''}
      <div class="counts">
        <span><b>${postsCount}</b> posts</span>
        <span><b>${counts.thoughts || 0}</b> thoughts</span>
        <span><b id="scrobble-count">${scrobblesFmt}</b> scrobbles</span>
      </div>
    </div>

    <section class="thought-highlights" aria-label="recent thoughts">
      <h2>recent thoughts</h2>
      <div class="thought-grid">
        ${thoughtCards}
      </div>
      <a class="see-more" href="/blog/?kind=thought">all thoughts →</a>
    </section>

    <section class="recent-listening" aria-label="recently listened">
      <h2>recent listening</h2>
      ${listeningHeader}
      <div id="listening-rows" data-max="3">
        ${trackRows}
      </div>
      <a class="see-more" href="/listening/">all listening →</a>
    </section>
  </section>
</main>`;

  return base({
    page: {
      title: '',
      navActive: 'home',
      nowPlaying: site.nowPlaying || '',
      footerText: config.footerText ?? '',
      // Share the /listening/ poller for live scrobble + recent-tracks
      // updates. tag-filter.js is no longer loaded here — the homepage
      // has no filter strip after the redesign.
      bodyScripts: `<script src="/${asset('listening-live.js')}" defer></script>`,
    },
    body,
  });
}
