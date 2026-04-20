// Single article — journal post or making post. Same layout, different labels.

import { base } from './base.js';
import { esc, fmtDate, timeTag, tagList } from './_helpers.js';

export function articlePage({ site, note, recent, prev, next }) {
  const kind = note.kind || 'journal';
  const section = (site.config?.sections && site.config.sections[kind]) || {};
  const meta = {
    who:    section.who    || kind,
    bio:    section.bio    || '',
    kicker: section.kicker || kind,
  };
  const tags = (note.tags || []).map(t => `<a class="tg" href="/tags/${encodeURIComponent(t)}/">${esc(t)}</a>`).join(' ');

  const body = `
<main class="page">
  <aside class="side-left" aria-label="page meta">
    <div class="ident">
      ${meta.who ? `<div class="who">${esc(meta.who)}</div>` : ''}
      ${meta.bio ? `<div class="bio">${esc(meta.bio)}</div>` : ''}
      <div class="stats">
        <span class="s"><span class="n">${(site.counts?.[kind === 'making' ? 'making' : 'journal']) || 0}</span>posts</span>
      </div>
    </div>

    ${recent && recent.length ? `
    <div class="group">
      <h3>recent</h3>
      <ul>
        ${recent.slice(0, 5).map(r => `<li><a href="${r.url}">${esc(r.title)}</a><span class="meta">${timeTag(r.date, 'day')}</span></li>`).join('\n        ')}
      </ul>
    </div>` : ''}
  </aside>

  <article class="timeline">
    <div class="post-head">
      <div class="kicker">
        <span class="kind">${esc(meta.kicker)}</span>
        <span class="dot">·</span>
        <span>${timeTag(note.date, 'long')}</span>
        ${note.readTime ? `<span class="dot">·</span><span>${esc(note.readTime)}</span>` : ''}
      </div>
      <h1>${esc(note.title)}</h1>
      ${note.summary ? `<p class="lede">${esc(note.summary)}</p>` : ''}
    </div>

    <div class="post-body">
      ${note.html}

      ${tags ? `<p style="margin-top:1.25rem;">${tags}</p>` : ''}

      <p style="margin-top:1rem; padding-top:.75rem; border-top:1px dashed var(--faint); font-size:11px; color:var(--mute); font-family:var(--font-mono);">
        ↳ ${esc(note.sourcePath)}${note.words ? ` · ${note.words} words` : ''}${note.updated ? ` · last edited ${timeTag(note.updated, 'day')}` : ''}
      </p>
    </div>

    ${(prev || next) ? `
    <nav class="pager" aria-label="post pager">
      ${prev ? `<a href="${prev.url}"><span class="d">← older</span>${esc(prev.title)}</a>` : '<span></span>'}
      ${next ? `<a href="${next.url}"><span class="d">newer →</span>${esc(next.title)}</a>` : '<span></span>'}
    </nav>` : ''}
  </article>

  <aside class="side-right" aria-label="related">
    ${note.tags && note.tags.length ? `
    <div class="group">
      <h3>tags</h3>
      <ul>
        ${note.tags.map(t => `<li><a class="tg" href="/tags/${encodeURIComponent(t)}/">${esc(t)}</a></li>`).join('\n        ')}
      </ul>
    </div>` : ''}
  </aside>
</main>`;

  return base({
    page: {
      title: note.title,
      navActive: kind === 'making' ? 'making' : 'journal',
      nowPlaying: site.nowPlaying || '',
      footerText: site.config?.footerText ?? '',
    },
    body,
  });
}

// Back-compat alias.
export const journalPage = articlePage;
