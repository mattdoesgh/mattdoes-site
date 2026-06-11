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
