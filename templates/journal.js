// Single article — journal post or making post. Same layout, different labels.

import { base } from './base.js';
import { esc, fmtDate, timeTag, tagList, safeUrl } from './_helpers.js';

export function articlePage({ site, note, recent, prev, next }) {
  const kind = note.kind || 'journal';
  const section = (site.config?.sections && site.config.sections[kind]) || {};
  const meta = {
    who:    section.who    || kind,
    bio:    section.bio    || '',
    kicker: section.kicker || kind,
  };
  // Tag chips on a single post jump back to /blog/ pre-filtered by the
  // post's kind and the clicked tag. tag-filter.js AND-combines the two
  // params, so /blog/?kind=making&tag=foo lands on the right slice.
  const sectionPath = '/blog/';
  const tags = (note.tags || []).map(t => `<a class="tg" href="${sectionPath}?kind=${encodeURIComponent(kind)}&tag=${encodeURIComponent(t)}" data-tag="${esc(t)}">${esc(t)}</a>`).join(' ');

  const body = `
<main class="page" id="main">
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
      <h2>recent</h2>
      <ul>
        ${recent.slice(0, 5).map(r => `<li><a href="${esc(safeUrl(r.url))}">${esc(r.title)}</a><span class="meta">${timeTag(r.date, 'day')}</span></li>`).join('\n        ')}
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

      ${tags ? `<p class="post-tags">${tags}</p>` : ''}

      <p class="post-source">
        ↳ ${esc(note.sourcePath)}${note.words ? ` · ${note.words} words` : ''}${note.updated ? ` · last edited ${timeTag(note.updated, 'day')}` : ''}
      </p>
    </div>

    ${(prev || next) ? `
    <nav class="pager" aria-label="post pager">
      ${prev ? `<a href="${esc(safeUrl(prev.url))}"><span class="d">← older</span>${esc(prev.title)}</a>` : '<span></span>'}
      ${next ? `<a href="${esc(safeUrl(next.url))}"><span class="d">newer →</span>${esc(next.title)}</a>` : '<span></span>'}
    </nav>` : ''}
  </article>

  <aside class="side-right" aria-label="related">
    ${note.tags && note.tags.length ? `
    <div class="group">
      <h2>tags</h2>
      <ul>
        ${note.tags.map(t => `<li><a class="tg" href="${sectionPath}?kind=${encodeURIComponent(kind)}&tag=${encodeURIComponent(t)}" data-tag="${esc(t)}">${esc(t)}</a></li>`).join('\n        ')}
      </ul>
    </div>` : ''}
  </aside>
</main>`;

  return base({
    page: {
      title: note.title,
      url: note.url,
      // A post is an Open Graph "article"; description falls back to the
      // section bio so social cards still say something useful (finding C9).
      description: note.summary || meta.bio || `${meta.who} — ${esc(note.title)}`,
      ogType: 'article',
      navActive: 'blog',
      nowPlaying: site.nowPlaying || '',
      footerText: site.config?.footerText ?? '',
    },
    body,
  });
}

// Back-compat alias.
export const journalPage = articlePage;
