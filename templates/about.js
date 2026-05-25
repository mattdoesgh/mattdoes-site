// About — single static page; body comes from a vault note with
// `publish: about`. Mirrors the journal article shell but strips the
// post-specific chrome (kicker kind, read time, tag list, prev/next
// pager) because /about/ is a destination, not a post.

import { base } from './base.js';
import { esc, safeUrl, relFor } from './_helpers.js';

export function aboutPage({ site, note }) {
  const siteConfig = site.config || {};
  const links = site.links || [];
  const identity = site.identity || {};

  const body = `
<main class="page about" id="main">
  <aside class="side-left" aria-label="page meta">
    <div class="ident">
      <div class="who">about</div>
      ${identity.bio ? `<div class="bio">${esc(identity.bio)}</div>` : ''}
    </div>

    ${links.length ? `
    <div class="group">
      <h2>elsewhere</h2>
      <ul>
        ${links.filter(l => l.href).map(l => `<li><a href="${esc(safeUrl(l.href))}"${relFor(l.href)}>${esc(l.label)}</a>${l.meta ? `<span class="meta">${esc(l.meta)}</span>` : ''}</li>`).join('\n        ')}
      </ul>
    </div>` : ''}
  </aside>

  <article class="timeline">
    <div class="post-head">
      <h1>About me</h1>
      ${note.summary ? `<p class="lede">${esc(note.summary)}</p>` : ''}
    </div>

    <div class="post-body">
      ${note.html}
    </div>
  </article>
</main>`;

  return base({
    page: {
      title: 'about',
      url: '/about/',
      description: note.summary || identity.bio || '',
      navActive: 'about',
      nowPlaying: site.nowPlaying || '',
      footerText: siteConfig.footerText ?? '',
    },
    body,
  });
}
