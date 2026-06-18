// Verbatim static documentation body for the colophon (ported from
// templates/colophon.js). Kept as a raw HTML string — and out of the component
// file — because the <pre> folder tree and the code-block have significant
// pre-formatted whitespace that must stay byte-faithful, and JSX-ifying it would
// force every backtick/`${`/entity to be re-escaped by hand. Backticks and `${`
// are escaped here exactly as in the source so the rendered HTML contains the
// literal characters. Injected via dangerouslySetInnerHTML by ColophonPage.
export const COLOPHON_DOC_HTML = `<h2 id="folder" class="section-label"><span>folder layout</span><span class="n">01</span></h2>
    <div class="blurb">Two repos. Vault stays private; site repo is thin and public. A pre-build script clones the vault into <code>./vault/</code> using a fine-grained PAT.</div>
<pre class="tree"><span class="b">┌</span> <span class="d">vault</span> <span class="note">(private · obsidian)</span>
<span class="b">├──</span> <span class="d">daily</span>
<span class="b">│   └──</span> <span class="f">YYYY-MM-DD.md</span>   <span class="note"># micro-posts · one ##HH:MM = one thought</span>
<span class="b">├──</span> <span class="d">notes</span>             <span class="note"># publish: journal | making → routed below</span>
<span class="b">│   ├──</span> <span class="f">*.md</span>             <span class="note"># loose notes (publish: journal lives here)</span>
<span class="b">│   ├──</span> <span class="d">making</span>           <span class="note"># convention bucket</span>
<span class="b">│   ├──</span> <span class="d">dev</span>              <span class="note"># engineering posts</span>
<span class="b">│   └──</span> <span class="d">ideas</span>            <span class="note"># never published (no publish: key)</span>
<span class="b">├──</span> <span class="d">attachments</span>          <span class="note"># images / audio / video</span>
<span class="b">└──</span> <span class="f">.obsidian/</span>           <span class="note"># ignored</span>

<span class="b">┌</span> <span class="d">mattdoes-site</span> <span class="note">(public)</span>
<span class="b">├──</span> <span class="f">build.js</span>             <span class="note"># the generator entrypoint</span>
<span class="b">├──</span> <span class="d">lib</span>                  <span class="note"># intake (vault → model) · emit (model → dist) · listening · lastfm codec</span>
<span class="b">├──</span> <span class="f">site.config.js</span>       <span class="note"># identity + last.fm</span>
<span class="b">├──</span> <span class="d">templates</span>            <span class="note"># page templates · shared row renderers · helpers</span>
<span class="b">├──</span> <span class="d">static</span>               <span class="note"># css, js (tweaks · geo-bg · live), fonts, baked geojson, _headers</span>
<span class="b">├──</span> <span class="d">scripts</span>              <span class="note"># prebuild, optimize-media, sync-media, bake-geo</span>
<span class="b">├──</span> <span class="d">workers</span>              <span class="note"># listening · geo · lib (shared edge transport)</span>
<span class="b">├──</span> <span class="d">vault</span>                <span class="note">→ cloned pre-build</span>
<span class="b">└──</span> <span class="d">dist</span>                 <span class="note"># deployed</span></pre>

    <h2 id="schema" class="section-label"><span>frontmatter schema</span><span class="n">02</span></h2>
    <div class="blurb">Every note that wants to appear on the site declares it. <code class="ic">publish:</code> is the only required field.</div>

    <table class="schema">
      <caption class="visually-hidden">Frontmatter fields accepted in vault notes</caption>
      <thead>
        <tr><th>key</th><th>type</th><th>req</th><th>description</th></tr>
      </thead>
      <tbody>
        <tr><td class="key">publish</td><td class="type">enum</td><td class="req y">req</td><td>journal · making · thoughts · about · draft <span class="note">(listening is pulled from last.fm)</span></td></tr>
        <tr><td class="key">title</td><td class="type">string</td><td class="req">opt</td><td>Display title. Defaults to filename.</td></tr>
        <tr><td class="key">date</td><td class="type">date</td><td class="req">opt</td><td>Bare <code>YYYY-MM-DD</code> is anchored to CT midnight (so the post lands on the day you wrote, not UTC's). Full ISO timestamps are used as-is. Defaults to file mtime.</td></tr>
        <tr><td class="key">slug</td><td class="type">string</td><td class="req">opt</td><td>URL path segment. Defaults to kebab filename.</td></tr>
        <tr><td class="key">tags</td><td class="type">[string]</td><td class="req">opt</td><td>Render as #tag. Drives filter rows.</td></tr>
        <tr><td class="key">summary</td><td class="type">string</td><td class="req">opt</td><td>One-sentence lede. Shown in index + RSS.</td></tr>
        <tr><td class="key">updated</td><td class="type">date</td><td class="req">opt</td><td>Last meaningful edit.</td></tr>
        <tr><td class="key">aliases</td><td class="type">[string]</td><td class="req">opt</td><td>Extra wikilink targets.</td></tr>
      </tbody>
    </table>

    <h2 id="routing" class="section-label"><span>routing · publish → url</span><span class="n">03</span></h2>
    <div class="blurb">Routes are driven by the <code>publish:</code> frontmatter value, not the folder. Folders are organizational only.</div>
    <div class="routes">
      <span class="from">publish: journal</span><span class="arr">→</span><span class="to">/journal/<span class="dim">&lt;slug&gt;</span>/ <span class="dim">· /blog/?kind=journal</span></span>
      <span class="from">publish: making</span><span class="arr">→</span><span class="to">/making/<span class="dim">&lt;slug&gt;</span>/ <span class="dim">· /blog/?kind=making</span></span>
      <span class="from">publish: thoughts <span class="dim">(daily/YYYY-MM-DD.md, split on ##HH:MM)</span></span><span class="arr">→</span><span class="to">/blog/<span class="dim">#t-&lt;timestamp&gt;</span></span>
      <span class="from">publish: about</span><span class="arr">→</span><span class="to">/about/</span>
      <span class="from">attachments/&lt;file&gt;</span><span class="arr">→</span><span class="to">/img/<span class="dim">&lt;file&gt;</span> <span class="dim">(R2 in prod via media.mattdoes.online)</span></span>
      <span class="from">last.fm recent tracks</span><span class="arr">→</span><span class="to">/listening/ <span class="dim">(static at build · refreshed live)</span></span>
      <span class="from">listening worker</span><span class="arr">→</span><span class="to">/api/listening/{now,recent}</span>
      <span class="from">geo worker</span><span class="arr">→</span><span class="to">/api/geo/lookup</span>
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
      <p>One pass, two modules. Intake turns notes into the content model — frontmatter validation, thought splitting, stable IDs, the slug index. Emit writes the model to <code>dist/</code> — markdown, templates, hashed assets, feeds. Four surfaces in the nav (home · blog · listening · about); a new section (say, <code>publish: recipes</code>) is a new template file and one line in <code>routeFor()</code>.</p>
      <p>Two dynamic surfaces, both same-origin Workers; <code>connect-src 'self'</code> holds. <code>/api/listening/*</code> proxies Last.fm (now-playing for the topbar, recent tracks for the listening page) with a stale-while-revalidate KV cache out front. <code>/api/geo/lookup</code> reverse-geocodes a visitor's coords against Nominatim if they opt in via the tweaks panel — by default the animated background renders the home polygon baked into <code>static/home.geojson</code>, no prompt, no network call. Both Workers answer through one shared envelope (<code>workers/lib/transport.js</code>) — JSON + CORS, preflight, cached error responses — with caching policy kept per-Worker.</p>
      <p>Media takes the long way around. <code>scripts/optimize-media.js</code> hashes every attachment and emits <code>.webp</code> siblings into <code>.cache/media-build/</code>; <code>scripts/sync-media.js</code> PUTs originals + variants to R2 over <code>wrangler r2 object</code>, and the build emits <code>&lt;picture&gt;</code> tags pointed at <code>media.mattdoes.online</code>. CSS and JS are content-hashed and served immutable from Pages; CSP is strict, no inline scripts, no third-party connect. Mail is Fastmail, contact is a plain <code>mailto:</code>, no form worker.</p>
    </div>`;
