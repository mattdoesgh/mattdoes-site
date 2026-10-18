// Verbatim static documentation body for the colophon (ported from
// templates/colophon.js). Kept as a raw HTML string — and out of the component
// file — because the <pre> folder tree and the code-block have significant
// pre-formatted whitespace that must stay byte-faithful, and JSX-ifying it would
// force every backtick/`${`/entity to be re-escaped by hand. Backticks and `${`
// are escaped here exactly as in the source so the rendered HTML contains the
// literal characters. Injected via dangerouslySetInnerHTML by ColophonPage.
export const COLOPHON_DOC_HTML = `<h2 id="folder" class="section-label"><span>folder layout</span><span class="n">01</span></h2>
    <div class="blurb">One repo. The about note and the other authored data live in <code>content/</code>. The pre-build script does not clone anything.</div>
<pre class="tree"><span class="b">┌</span> <span class="d">mattdoes-site</span> <span class="note">(public)</span>
<span class="b">├──</span> <span class="f">build.js</span>             <span class="note"># the generator entrypoint</span>
<span class="b">├──</span> <span class="d">lib</span>                  <span class="note"># intake (notes → model) · emit (model → dist) · listening · lastfm codec</span>
<span class="b">├──</span> <span class="d">design-system</span>        <span class="note"># React page components · renders every page to static HTML</span>
<span class="b">├──</span> <span class="f">site.config.js</span>       <span class="note"># identity + last.fm + letterboxd</span>
<span class="b">├──</span> <span class="d">content</span>             <span class="note"># about note · digs weeks · other recommendations</span>
<span class="b">│   ├──</span> <span class="f">about.md</span>         <span class="note"># publish: about → /about/</span>
<span class="b">│   ├──</span> <span class="d">digs</span>             <span class="note"># one JSON file per week</span>
<span class="b">│   ├──</span> <span class="d">attachments</span>      <span class="note"># images / audio / video, when a note embeds one</span>
<span class="b">│   └──</span> <span class="f">recommendations.json</span>
<span class="b">├──</span> <span class="d">templates</span>            <span class="note"># listening row module · helpers</span>
<span class="b">├──</span> <span class="d">static</span>               <span class="note"># css, js (tweaks · geo-bg · live), fonts, baked geojson, _headers</span>
<span class="b">├──</span> <span class="d">scripts</span>              <span class="note"># prebuild, optimize-media, sync-media, bake-geo</span>
<span class="b">├──</span> <span class="d">workers</span>              <span class="note"># listening · geo · csp-report · lib (shared edge transport)</span>
<span class="b">└──</span> <span class="d">dist</span>                 <span class="note"># deployed</span></pre>

    <h2 id="schema" class="section-label"><span>frontmatter schema</span><span class="n">02</span></h2>
    <div class="blurb">Every note that wants to appear on the site declares it. <code class="ic">publish:</code> is the only required field.</div>

    <table class="schema">
      <caption class="visually-hidden">Frontmatter fields accepted in content notes</caption>
      <thead>
        <tr><th>key</th><th>type</th><th>req</th><th>description</th></tr>
      </thead>
      <tbody>
        <tr><td class="key">publish</td><td class="type">enum</td><td class="req y">req</td><td>about · draft <span class="note">(listening is last.fm. publish: journal, making, and thoughts are accepted and not shown.)</span></td></tr>
        <tr><td class="key">title</td><td class="type">string</td><td class="req">opt</td><td>Display title. Defaults to filename.</td></tr>
        <tr><td class="key">date</td><td class="type">date</td><td class="req">opt</td><td>Bare <code>YYYY-MM-DD</code> is anchored to CT midnight (so the post lands on the day you wrote, not UTC's). Full ISO timestamps are used as-is. Defaults to file mtime.</td></tr>
        <tr><td class="key">slug</td><td class="type">string</td><td class="req">opt</td><td>URL path segment. Defaults to kebab filename.</td></tr>
        <tr><td class="key">tags</td><td class="type">[string]</td><td class="req">opt</td><td>Render as #tag. Drives filter rows.</td></tr>
        <tr><td class="key">summary</td><td class="type">string</td><td class="req">opt</td><td>One-sentence lede.</td></tr>
        <tr><td class="key">updated</td><td class="type">date</td><td class="req">opt</td><td>Last meaningful edit.</td></tr>
        <tr><td class="key">aliases</td><td class="type">[string]</td><td class="req">opt</td><td>Extra wikilink targets.</td></tr>
      </tbody>
    </table>

    <h2 id="routing" class="section-label"><span>routing · publish → url</span><span class="n">03</span></h2>
    <div class="blurb">Routes are driven by the <code>publish:</code> frontmatter value, not the folder. Folders are organizational only.</div>
    <div class="routes">
      <span class="from">publish: about</span><span class="arr">→</span><span class="to">/about/</span>
      <span class="from">publish: journal · making</span><span class="arr">✕</span><span class="to"><span class="dim">accepted, not published</span></span>
      <span class="from">content/attachments/&lt;file&gt;</span><span class="arr">→</span><span class="to">/img/<span class="dim">&lt;file&gt;</span> <span class="dim">(R2 in prod via media.mattdoes.online)</span></span>
      <span class="from">last.fm recent tracks</span><span class="arr">→</span><span class="to">/listening/ <span class="dim">(static at build · refreshed live)</span></span>
      <span class="from">content/digs/*.json</span><span class="arr">→</span><span class="to">/digs/ <span class="dim">(weekly · favorites flow to /grok/)</span></span>
      <span class="from">letterboxd rss</span><span class="arr">→</span><span class="to">/movies/ <span class="dim">(25 most recent · build time)</span></span>
      <span class="from">grok says</span><span class="arr">→</span><span class="to">/grok/ <span class="dim">(favorite digs · other picks)</span></span>
      <span class="from">search index</span><span class="arr">→</span><span class="to">/search/ <span class="dim">· /search-index.json (client-filtered)</span></span>
      <span class="from">og card</span><span class="arr">→</span><span class="to">/og/default.png <span class="dim">(1200×630 · sharp)</span></span>
      <span class="from">listening worker</span><span class="arr">→</span><span class="to">/api/listening/{now,recent}</span>
      <span class="from">geo worker</span><span class="arr">→</span><span class="to">/api/geo/lookup</span>
      <span class="from">csp-report worker</span><span class="arr">→</span><span class="to">/api/csp-report <span class="dim">(report-only sink)</span></span>
      <span class="from">publish: &lt;other&gt;</span><span class="arr">→</span><span class="to">/<span class="dim">&lt;slug&gt;</span>/ <span class="dim">(catch-all)</span></span>
      <span class="from">publish: draft · missing</span><span class="arr">✕</span><span class="to"><span class="dim">never built</span></span>
    </div>

    <h2 id="wikilinks" class="section-label"><span>wikilinks &amp; embeds</span><span class="n">04</span></h2>
    <div class="doc-body">
      <ul>
        <li><code>[[some-slug]]</code> — resolves to published page; else renders as plain text with a dotted underline.</li>
        <li><code>[[some-slug|custom label]]</code> — aliased label.</li>
        <li><code>![[image.png]]</code> — image embed. Served from R2 in production.</li>
        <li><code>![[clip.mp3]]</code> — renders as native &lt;audio&gt;.</li>
        <li><code>[[#some heading]]</code> — intra-page anchor. Rare.</li>
      </ul>
    </div>

    <h2 id="build" class="section-label"><span>the build</span><span class="n">05</span></h2>
<div class="code-block"><span class="c">// simplified</span>
<span class="k">for</span> (<span class="k">const</span> note <span class="k">of</span> <span class="v">walk</span>(<span class="s">'content/'</span>)) {
  <span class="k">const</span> { data, body } = <span class="v">matter</span>(note)
  <span class="k">if</span> (!data.publish <span class="d">||</span> data.publish === <span class="s">'draft'</span>) <span class="k">continue</span>

  <span class="k">const</span> html = <span class="v">renderMarkdown</span>(body, {
    wikilinks: resolveAgainst(publishedNotes),
    embeds:    rewriteToR2()
  })

  <span class="k">const</span> route = <span class="v">routeFor</span>(note.path, data)
  <span class="v">write</span>(<span class="s">\`dist</span><span class="d">\${</span>route<span class="d">}</span><span class="s">.html\`</span>, <span class="v">renderPage</span>(data.publish, { data, html }))
}

<span class="v">writeIndex</span>(<span class="s">'dist/index.html'</span>)</div>

    <div class="doc-body">
      <p>One pass. Intake turns notes in <code>content/</code> into the content model — frontmatter validation and the slug index. Journal, making, and thoughts stay valid publish values and are not written out as pages. Emit renders <code>content/about.md</code>, then writes React-rendered static pages and hashed assets. The listening page is the timeline that still ships the filter island's script; digs, movies, and grok stay their own pages. <code>/search-index.json</code> backs the client-filtered search page.</p>
      <p>Two dynamic surfaces, both same-origin Workers; <code>connect-src 'self'</code> holds. On <code>/api/listening/*</code> a single-writer Durable Object — the <code>ListeningPoller</code> — is the only thing that calls Last.fm: a self-rescheduling ~25s alarm makes one <code>user.getrecenttracks</code> call, derives both the now-playing pill and the recent-tracks list from it, and writes them to KV; a cron watchdog re-arms the alarm if it ever stops. The request path just reads KV and serves — it never calls Last.fm and never blocks, so upstream volume is constant whatever the traffic. <code>/api/geo/lookup</code> reverse-geocodes a visitor's coords against Nominatim if they opt in via the tweaks panel — by default the animated background renders the home polygon baked into <code>static/home.geojson</code>, no prompt, no network call. Every Worker answers through one shared envelope (<code>workers/lib/transport.js</code>) — JSON + CORS, preflight, cached error responses — with caching policy kept per-Worker.</p>
      <p>Media is optional. <code>scripts/optimize-media.js</code> hashes files under <code>content/attachments</code> (a no-op when that directory is absent) and emits <code>.webp</code> siblings into <code>.cache/media-build/</code>; <code>scripts/sync-media.js</code> PUTs originals + variants to R2 with the wrangler binary pinned in <code>workers/package-lock.json</code>, and the build emits <code>&lt;picture&gt;</code> tags pointed at <code>media.mattdoes.online</code>. CSS and JS are content-hashed and served immutable from Pages; the CSP is strict — no third-party connect and no <code>'unsafe-inline'</code> anywhere. The few inline <code>&lt;head&gt;</code> scripts the document shell emits — the importmap and the speculation rules that prerender same-origin links — are admitted by a per-build <code>sha256</code> in <code>script-src</code>, recomputed each build so the hashes track the content-hashed module URLs. <code>style-src</code> stays <code>'self'</code> too (Shiki's per-token colors are de-duplicated into build-time CSS classes rather than inline styles). A Report-Only policy mirrors the enforced one to a same-origin <code>/api/csp-report</code> sink, so the next tightening is measured against real traffic first. Mail is Fastmail, contact is a plain <code>mailto:</code>, no form worker.</p>
    </div>`;
