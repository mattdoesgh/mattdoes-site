// Colophon — static doc page about how the site is put together.
// Build stats are interpolated at build time.

import { base } from './base.js';
import { esc, fmtDate, timeTag, safeUrl, relFor } from './_helpers.js';
import { siteConfig } from '../site.config.js';

export function colophonPage({ stats, updated, nowPlaying }) {
  const body = `
<main class="page">
  <aside class="side-left" aria-label="page meta">
    <div class="ident">
      <div class="who">colophon</div>
      <div class="bio">How this site is put together. Obsidian vault → small Node build → static HTML.</div>
    </div>

    <div class="group">
      <h3>on this page</h3>
      <ul>
        <li><a href="#folder">folder layout</a><span class="meta">01</span></li>
        <li><a href="#schema">frontmatter</a><span class="meta">02</span></li>
        <li><a href="#routing">routing</a><span class="meta">03</span></li>
        <li><a href="#wikilinks">wikilinks</a><span class="meta">04</span></li>
        <li><a href="#build">the build</a><span class="meta">05</span></li>
      </ul>
    </div>

    ${siteConfig.links && siteConfig.links.length ? `
    <div class="group">
      <h3>source</h3>
      <ul>
        ${siteConfig.links.filter(l => l.href).map(l => `<li><a href="${esc(safeUrl(l.href))}"${relFor(l.href)}>${esc(l.label)}</a>${l.meta ? `<span class="meta">${esc(l.meta)}</span>` : ''}</li>`).join('\n        ')}
        <li><span>build.js</span><span class="meta">${stats?.buildLines || '—'} ln</span></li>
      </ul>
    </div>` : ''}
  </aside>

  <section class="timeline">
    <div class="post-head">
      <div class="kicker"><span class="kind">docs</span><span class="dot">·</span><span>updated ${timeTag(updated || new Date(), 'day')}</span></div>
      <h1>colophon.</h1>
      <p class="lede">The Obsidian vault is the source of truth; a small build script turns it into the pages you're reading.</p>
    </div>

    <div id="folder" class="section-label"><span>folder layout</span><span class="n">01</span></div>
    <div class="blurb">Two repos. Vault stays private; site repo is thin and public. A pre-build script clones the vault into <code>./vault/</code> using a fine-grained PAT — not a submodule, since CF Pages' GitHub App auth doesn't reach submodule clones.</div>
<pre class="tree"><span class="b">┌</span> <span class="d">vault</span> <span class="note">(private · obsidian)</span>
<span class="b">├──</span> <span class="d">daily</span>
<span class="b">│   └──</span> <span class="f">YYYY-MM-DD.md</span>   <span class="note"># micro-posts · one ##HH:MM = one thought</span>
<span class="b">├──</span> <span class="d">notes</span>             <span class="note"># publish: journal | making → routed below</span>
<span class="b">│   ├──</span> <span class="f">*.md</span>             <span class="note"># loose notes (publish: journal lives here)</span>
<span class="b">│   ├──</span> <span class="d">making</span>           <span class="note"># convention bucket</span>
<span class="b">│   └──</span> <span class="d">ideas</span>            <span class="note"># never published (no publish: key)</span>
<span class="b">├──</span> <span class="d">attachments</span>          <span class="note"># images / audio / video</span>
<span class="b">└──</span> <span class="f">.obsidian/</span>           <span class="note"># ignored</span>

<span class="b">┌</span> <span class="d">mattdoes-site</span> <span class="note">(public)</span>
<span class="b">├──</span> <span class="f">build.js</span>             <span class="note"># the generator</span>
<span class="b">├──</span> <span class="f">site.config.js</span>       <span class="note"># identity + last.fm</span>
<span class="b">├──</span> <span class="d">templates</span>
<span class="b">├──</span> <span class="d">vault</span>                <span class="note">→ cloned pre-build</span>
<span class="b">└──</span> <span class="d">dist</span>                 <span class="note"># deployed</span></pre>

    <div id="schema" class="section-label"><span>frontmatter schema</span><span class="n">02</span></div>
    <div class="blurb">Every note that wants to appear on the site declares it. <code style="font-family:var(--font-mono); background:var(--faint); padding:1px 5px; border-radius:2px;">publish:</code> is the only required field.</div>

    <table class="schema">
      <thead>
        <tr><th>key</th><th>type</th><th>req</th><th>description</th></tr>
      </thead>
      <tbody>
        <tr><td class="key">publish</td><td class="type">enum</td><td class="req y">req</td><td>journal · thoughts · making · draft <span class="note">(listening is pulled from last.fm)</span></td></tr>
        <tr><td class="key">title</td><td class="type">string</td><td class="req">opt</td><td>Display title. Defaults to filename.</td></tr>
        <tr><td class="key">date</td><td class="type">date</td><td class="req">opt</td><td>Bare <code>YYYY-MM-DD</code> is anchored to CT midnight (so the post lands on the day you wrote, not UTC's). Full ISO timestamps are used as-is. Defaults to file mtime.</td></tr>
        <tr><td class="key">slug</td><td class="type">string</td><td class="req">opt</td><td>URL path segment. Defaults to kebab filename.</td></tr>
        <tr><td class="key">tags</td><td class="type">[string]</td><td class="req">opt</td><td>Render as #tag. Drives filter rows.</td></tr>
        <tr><td class="key">summary</td><td class="type">string</td><td class="req">opt</td><td>One-sentence lede. Shown in index + RSS.</td></tr>
        <tr><td class="key">updated</td><td class="type">date</td><td class="req">opt</td><td>Last meaningful edit.</td></tr>
        <tr><td class="key">aliases</td><td class="type">[string]</td><td class="req">opt</td><td>Extra wikilink targets.</td></tr>
      </tbody>
    </table>

    <div id="routing" class="section-label"><span>routing · publish → url</span><span class="n">03</span></div>
    <div class="blurb">Routes are driven by the <code>publish:</code> frontmatter value, not the folder. Folders are organizational only.</div>
    <div class="routes">
      <span class="from">publish: journal</span><span class="arr">→</span><span class="to">/journal/<span class="dim">&lt;slug&gt;</span>/</span>
      <span class="from">publish: making</span><span class="arr">→</span><span class="to">/making/<span class="dim">&lt;slug&gt;</span>/</span>
      <span class="from">publish: thoughts <span class="dim">(daily/YYYY-MM-DD.md, split on ##HH:MM)</span></span><span class="arr">→</span><span class="to">/thoughts<span class="dim">#t-NNN</span></span>
      <span class="from">attachments/&lt;file&gt;</span><span class="arr">→</span><span class="to">/img/<span class="dim">&lt;file&gt;</span></span>
      <span class="from">last.fm recent tracks</span><span class="arr">→</span><span class="to">/listening/</span>
      <span class="from">publish: &lt;other&gt;</span><span class="arr">→</span><span class="to">/<span class="dim">&lt;slug&gt;</span>/ <span class="dim">(catch-all)</span></span>
      <span class="from">publish: draft · missing</span><span class="arr">✕</span><span class="to"><span class="dim">never built</span></span>
    </div>

    <div id="wikilinks" class="section-label"><span>wikilinks &amp; embeds</span><span class="n">04</span></div>
    <div class="doc-body">
      <ul>
        <li><code>[[some-slug]]</code> — resolves to published page; else renders as plain text with a dotted underline.</li>
        <li><code>[[some-slug|custom label]]</code> — aliased label.</li>
        <li><code>![[image.png]]</code> — image embed. Served from R2 in production.</li>
        <li><code>![[clip.mp3]]</code> — renders as native &lt;audio&gt;.</li>
        <li><code>[[#some heading]]</code> — intra-page anchor. Rare.</li>
      </ul>
    </div>

    <div id="build" class="section-label"><span>the build</span><span class="n">05</span></div>
<div class="code-block"><span class="c">// simplified</span>
<span class="k">for</span> (<span class="k">const</span> note <span class="k">of</span> <span class="v">walk</span>(<span class="s">'vault/'</span>)) {
  <span class="k">const</span> { data, body } = <span class="v">matter</span>(note)
  <span class="k">if</span> (!data.publish <span class="d">||</span> data.publish === <span class="s">'draft'</span>) <span class="k">continue</span>

  <span class="k">const</span> html = <span class="v">renderMarkdown</span>(body, {
    wikilinks: resolveAgainst(publishedNotes),
    embeds:    rewriteToR2()
  })

  <span class="k">const</span> route = <span class="v">routeFor</span>(note.path, data)
  <span class="v">write</span>(<span class="s">\`dist</span><span class="d">\${</span>route<span class="d">}</span><span class="s">.html\`</span>, <span class="v">template</span>(data.publish, { data, html }))
}

<span class="v">writeIndex</span>(<span class="s">'dist/index.html'</span>)
<span class="v">writeFeeds</span>(<span class="s">'dist/feed.xml'</span>)</div>

    <div class="doc-body">
      <p>Four templates, three content types, one loop. If a new section shows up (say, <code>publish: recipes</code>), it's a new template file and one line in <code>routeFor()</code>. That's the whole extension story.</p>
      <p>One dynamic surface left: a single Cloudflare Worker at <code>/api/listening/*</code> that proxies Last.fm so the API key stays out of the client. Mail is handled by Fastmail — contact is a plain <code>mailto:</code>, no form worker.</p>
    </div>
  </section>

  <aside class="side-right" aria-label="related">
    <div class="group">
      <h3>build stats</h3>
      <ul>
        <li><span>notes read</span><span class="meta">${stats?.notesRead ?? '—'}</span></li>
        <li><span>pages written</span><span class="meta">${stats?.pagesWritten ?? '—'}</span></li>
        <li><span>build time</span><span class="meta">${stats?.buildTime ?? '—'}</span></li>
        <li><span>dist size</span><span class="meta">${stats?.distSize ?? '—'}</span></li>
      </ul>
    </div>

    <div class="group">
      <h3>stack</h3>
      <ul>
        <li><span>Obsidian</span><span class="meta">vault</span></li>
        <li><span>Node</span><span class="meta">build</span></li>
        <li><span>CF Pages</span><span class="meta">host</span></li>
        <li><span>R2</span><span class="meta">media</span></li>
        <li><span>CF Worker</span><span class="meta">listening</span></li>
        <li><span>Fastmail</span><span class="meta">mail</span></li>
      </ul>
    </div>
  </aside>
</main>`;

  return base({
    page: {
      title: 'colophon',
      navActive: 'colophon',
      nowPlaying: nowPlaying || '',
      footerText: siteConfig.footerText ?? '',
    },
    body,
  });
}
