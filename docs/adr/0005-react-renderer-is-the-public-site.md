# The React design system renders the public site

ADR 0003 set the direction — React components in `design-system/` become the
build-time renderer and the Claude Design source — and shipped the foundational
slice: the core components plus one real page (`BlogPage`) proven against
`templates/blog.js` in a diff harness. This ADR records completing that
migration: **every public page is now rendered by the React design system**, and
`lib/emit.js` no longer calls the `templates/*.js` page functions.

## What changed

- **All six page types are React pages** under `design-system/ssg/pages/`:
  `IndexPage`, `ArticlePage`, `BlogPage`, `ListingPage` (journal / making /
  thoughts / listening), `AboutPage`, `ColophonPage`. They compose the existing
  DS components (Layout/Topbar/Footer/StatusPill/the Row family/Tag/Time/
  TweaksDialog) and the `format` helpers.
- **The document shell moved to React.** `design-system/ssg/document.tsx`
  (`renderDocument`) reproduces what `templates/base.js` emitted around the body:
  `<head>` metadata (title, description, canonical, Open Graph/Twitter, Atom
  autodiscovery, `view-transition` / `geo-endpoint` meta, font + script
  preloads), the **importmap** (ADR 0001), and the trailing deferred enhancement
  `<script>`s. It calls `renderToStaticMarkup` itself and returns a finished HTML
  string.
- **`lib/emit.js` imports `render*` functions** from a built SSG bundle
  (`design-system/dist-ssg/ssg.js`, built by `ssg/index.tsx`). The bundle keeps
  `react` / `react-dom` external; they resolve at runtime from
  `design-system/node_modules` (the bundle lives under `design-system/`), so the
  root build stays plain `node` with no React dependency of its own.

## The listening exception (ADR 0001 holds)

`static/listening-live.js` re-renders the `/listening/` rows in the browser from
the shared `templates/rows.js` module and dedupes against the server output by an
`innerHTML` swap, so the server-rendered rows **must byte-equal** that module's
output (asserted by `test/row-parity.test.js`). React serialization would not
byte-match. So the listening rows are still rendered server-side by
`templates/rows.js` and injected into the React `ListingPage` frame as a raw HTML
string (`rowsHtml`). React owns the page frame; `rows.js` owns the listening-row
bytes. `templates/rows.js` and `templates/_helpers.js` therefore remain — they
are the browser Row module, not dead presentation code.

Because `rows.js` owns those bytes, the design system has **no `ListeningRow`
component**. An early slice shipped one (a React mirror of `listeningRow()`,
exported and synced to Claude Design), but nothing rendered from it — `ListingPage`
injects `rowsHtml`, not a React row — so it could only drift from the byte-equal
contract unnoticed, with no render path and no test to catch it. It was removed:
the `/listening/` row is intentionally owned by `templates/rows.js` alone, and the
`.row` visual language is still represented in the design surface by `ArticleRow`
and `ThoughtRow` (real renderers sharing the same `.row`/`.gutter`/`.body` markup
and CSS).

## Fidelity

Held to **semantic + visual equivalence**, as ADR 0003 established (React
controls serialization). Verified by: diffing every generated page against the
pre-cutover output (same class names / structure; only React serialization
differences — empty-string boolean attributes, void self-closing, `&#x27;`), the
full regression suite (a11y, contrast, CSP, privacy, feeds, **row-parity**,
W3C/html-validate), and the `design-system/ssg/render.tsx` parity harness. One
lint rule, `attribute-empty-style`, is now off — React emits `hidden=""` with no
bare-form option; it joins the sibling serialization-style rules already off
(`attribute-boolean-style`, `void-style`). See `test/w3c-coverage.test.js`.

## Shared page chrome

To avoid re-deriving the topbar/footer and the left rail on every page, three DS
components carry the shared structure:

- **`PageShell`** wraps `Layout` and owns the topbar status logic that
  `templates/base.js` had: a non-empty `siteConfig.status` renders a *static*
  pill (no `id="now-playing"`, so the live poller leaves it alone); otherwise the
  live now-playing pill. It also threads the brand `siteTitle`, so the topbar
  brand and the document `<title>` share one source.
- **`IdentityRail`** is the `side-left` "page meta" card (who / bio / stats +
  child groups).
- **`ElsewhereLinks`** is the off-site links group (sanitized hrefs + `rel`).

Each page reads `title` / `status` from its config object and forwards them to
`PageShell`. This restores the manual `siteConfig.status` site-notice that
`base.js` supported (it ships `status: ''`, so the default is the live pill).

## Build / deploy

`npm run build` builds the SSG bundle first via a `prebuild` hook; `npm test`
does the same via `pretest`. CI and the Cloudflare Pages prebuild
(`scripts/pages-prebuild.sh`) install `design-system`'s deps so the bundle can be
built. `design-system/dist-ssg/` is gitignored (a build artifact, like `dist/`).

## Status of the old templates

`templates/{base,index,journal,listing,about,blog,colophon}.js` are no longer
imported by the build. They are retained for one release as the rollback unit and
as the reference side of `render.tsx`'s parity diff, and are slated for removal
after a production soak (the `emit.js` per-call-site swap is the rollback
granularity). `templates/{rows,_helpers,_assets}.js` stay permanently —
`rows.js`/`_helpers.js` are the browser Row module (above) and `_assets.js` is
the hashed-asset registry the build and `renderDocument` both read.

## Considered alternatives

- **Render the listening rows in React too** — rejected: breaks the byte-equal
  contract with the browser Row module and `row-parity.test.js`. Injecting the
  `rows.js` output keeps server and live markup identical.
- **Run `build.js` under `tsx` to import `.tsx` directly** — rejected: adds a
  `tsx`/React runtime to the Cloudflare Pages build. Importing a pre-built
  bundle with React external (resolved from `design-system/node_modules`) keeps
  the production build on plain `node`.
