# Importmap for shared browser modules

The site has no bundler — `lib/emit.js` minifies and content-hashes each
static JS/CSS file individually. The Row module (`templates/rows.js`, which
imports `templates/_helpers.js`) must run both in Node templates and in the
browser (`static/listening-live.js`), so the browser needs a way to resolve
plain relative imports to the content-hashed filenames. We decided: ship the
module files as hashed static assets and have `templates/base.js` emit a
`<script type="importmap">` (generated from the same asset registry templates
already use) that remaps the clean URLs (`/rows.js`, `/_helpers.js`) to their
hashed counterparts. Source files keep ordinary relative imports and identical
bytes run in both environments; scripts that import shared modules are loaded
with `type="module"`.

## Consequence — admitted under the strict CSP by hash

The importmap is an inline `<script>`. The strict CSP added later (the
`script-src 'self' 'inline-speculation-rules'` line in `static/_headers`) has no
`'unsafe-inline'`, and unlike speculation rules there is no keyword that
allowlists inline importmaps — so the browser silently *drops* an unhashed one.
A dropped importmap is invisible at the network layer but fatal: every clean URL
(`/rows.js`) then resolves unmapped, 404s as the Pages `text/html` fallback,
fails the module MIME check, and the importer (`listening-live.js`) dies — the
`/listening/` scrobble list and count stop updating while the import-free
now-playing pill keeps working (the exact production regression this records).

So the build hashes the importmap: `lib/emit.js` (`injectInlineScriptCsp`)
derives the `sha256` of the same string `design-system/ssg/document.tsx`
(`buildImportmap`) emits and appends `'sha256-…'` to `script-src` in the dist
`_headers`. The hash moves with the hashed `rows.js`/`_helpers.js` URLs, so it is
computed per build, never hardcoded.

Subtlety, learned the hard way: **a hash source in a directive disables that
directive's keyword inline allowances** — `'inline-speculation-rules'` included,
not just `'unsafe-inline'`. So the moment the importmap hash lands in
`script-src`, the speculation-rules `<script>` (ADR 0007) stops being admitted by
its keyword and is itself blocked. The fix therefore hashes *every* inline script
the document shell emits — importmap **and** speculation rules
(`buildSpeculationRules`) — together. `test/row-parity.test.js` extracts all
inline `<script>`s from a built page and asserts `script-src` carries each one's
hash (and no `'unsafe-inline'`), so adding a new inline script without hashing
it, or a CSP edit that drops a hash, fails the build/test rather than silently
shipping a dead importmap or dead prerendering.

## Considered Options

- **Rewrite import specifiers during minify** — hash `rows.js` first, then
  rewrite the specifier inside each importer before hashing it. Rejected:
  build-time source mutation is invisible when reading the source, and the
  cascading hash order forces sequencing into the currently-parallel
  `processAsset` calls.
- **Build-time concatenation** — prepend the module source (exports stripped)
  onto each consumer, keeping classic scripts. Rejected: the export-stripping
  step is fragile and the shipped file no longer corresponds to any source
  file.
- **Self-contained copies per consumer** — re-creates exactly the
  hand-mirrored duplication ("keep in sync" comments in `listening-live.js`)
  this decision exists to eliminate.
