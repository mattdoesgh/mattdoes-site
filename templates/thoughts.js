// Thoughts archive — microblog timeline with tag filters.

import { base } from './base.js';
import { esc, fmtDate, tagList } from './_helpers.js';
import { siteConfig } from '../site.config.js';

function pad2(n) { return String(n).padStart(2, '0'); }

function thoughtRow(t) {
  const d = new Date(t.date);
  const day  = `${['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'][d.getUTCMonth()]} ${pad2(d.getUTCDate())}`;
  const time = `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;
  const bodyClass = t.quote ? 'body q' : 'body';
  return `
    <div class="row" data-tags="${esc((t.tags || []).join(' '))}">
      <div class="gutter"><span class="kind">${day}</span><span class="when">${time}</span></div>
      <div>
        <div class="${bodyClass}">${t.html || esc(t.body || '')}${(t.tags && t.tags.length && !t.quote) ? ' ' + tagList(t.tags) : ''}</div>
        <div class="actions"><a class="permalink" href="#${esc(t.id)}" id="${esc(t.id)}">#${esc(t.id)}</a></div>
      </div>
    </div>`;
}

function groupByMonth(thoughts) {
  const groups = new Map();
  for (const t of thoughts) {
    const d = new Date(t.date);
    const key = `${d.getUTCFullYear()}-${pad2(d.getUTCMonth()+1)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(t);
  }
  return [...groups.entries()].sort((a, b) => b[0].localeCompare(a[0]));
}

export function thoughtsPage({ site, thoughts }) {
  const groups = groupByMonth(thoughts);
  const timeline = groups.map(([ym, rows]) => {
    const label = `${['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'][Number(ym.slice(5,7))-1]} · ${ym.slice(0,4)}`;
    return `
    <div class="tl-divider"><span>${label}</span><span>${rows.length}</span></div>
    ${rows.map(thoughtRow).join('\n')}`;
  }).join('\n');

  const tagCounts = new Map();
  for (const t of thoughts) for (const tag of (t.tags || [])) tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
  const topTags = [...tagCounts.entries()].sort((a, b) => b[1] - a[1]);

  const section = siteConfig.sections?.thoughts || {};
  const body = `
<main class="page">
  <aside class="side-left" aria-label="page meta">
    <div class="ident">
      <div class="who">${esc(section.who || 'thoughts')}</div>
      ${section.bio ? `<div class="bio">${esc(section.bio)}</div>` : ''}
      <div class="stats">
        <span class="s"><span class="n">${thoughts.length}</span>posts</span>
        <span class="s"><span class="n">${tagCounts.size}</span>tags</span>
      </div>
    </div>

    <div class="group">
      <h3>source <span class="m">obsidian</span></h3>
      <ul>
        <li style="font-family:var(--font-mono); font-size:11px; color:var(--mute); border-bottom:1px dashed var(--faint);">vault/daily/*.md</li>
        <li><span>publish:</span><span class="meta">thoughts</span></li>
        <li><a href="/colophon/">how it works →</a></li>
      </ul>
    </div>
  </aside>

  <section class="timeline">
    <div class="filter">
      <span class="label">filter</span>
      <a href="#" class="on all" data-filter="">all</a>
      ${topTags.slice(0, 6).map(([tag]) => `<a href="#" data-filter="${esc(tag)}">${esc(tag)}</a>`).join('\n      ')}
      <span class="cnt">${thoughts.length} posts</span>
    </div>

    ${timeline}
  </section>

  <aside class="side-right" aria-label="related">
    <div class="group">
      <h3>by tag</h3>
      <ul>
        ${topTags.map(([tag, n]) => `<li><a class="tg" href="/tags/${encodeURIComponent(tag)}/">${esc(tag)}</a><span class="meta">${n}</span></li>`).join('\n        ')}
      </ul>
    </div>

    <div class="group">
      <h3>subscribe</h3>
      <ul>
        <li><a href="/feed.xml">rss</a><span class="meta">.xml</span></li>
      </ul>
    </div>
  </aside>
</main>`;

  return base({
    page: {
      title: 'thoughts',
      navActive: 'thoughts',
      nowPlaying: site?.nowPlaying || '',
      footerText: siteConfig.footerText ?? '',
      bodyScripts: `<script>
(() => {
  const links = document.querySelectorAll('.filter a[data-filter]');
  const rows  = document.querySelectorAll('.row[data-tags]');
  links.forEach(a => a.addEventListener('click', e => {
    e.preventDefault();
    links.forEach(l => l.classList.toggle('on', l === a));
    const f = a.dataset.filter;
    rows.forEach(r => {
      r.style.display = (!f || (r.dataset.tags || '').split(' ').includes(f)) ? '' : 'none';
    });
  }));
})();
</script>`
    },
    body,
  });
}
