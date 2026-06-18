# Brand fonts in the design-system bundle

JetBrains Mono is the site's brand font. It has to render in two places now that
the React component library doubles as the Claude Design source (ADR 0003): on
the deployed site, and inside the bundle uploaded to Claude Design — both the
preview cards and every design the agent builds from the components. A font that
falls back to system mono in the bundle is wrong in *every* design produced from
the design system, and nothing downstream catches it.

The earlier arrangement was host-served: the deploy dropped woff2 files into
`/fonts/` at build time (not committed to the repo), `static/_shared.css`
referenced them by the absolute URL `url('/fonts/JetBrainsMono-*.woff2')`, and
design-sync's `cfg.runtimeFontPrefixes` declared the family host-served so its
`[FONT_MISSING]` check stayed quiet. That left two holes: the Claude Design
runtime serves nothing at `/fonts/`, so every preview rendered in fallback mono;
and the deploy occasionally shipped missing or zero-byte font files, so even the
live site lost the brand face.

The decision: **commit the fonts and ship them as real files in the bundle.**

- The five used weights (Light/Regular/Medium/SemiBold/Italic) are committed
  under `static/fonts/`.
- The `@font-face` `src` in `static/_shared.css` is now stylesheet-relative
  (`url('./fonts/JetBrainsMono-*.woff2')`). On the deployed site the `static/`
  tree copies to the dist root, so `./fonts/` resolves to `/fonts/` — the same
  path the `templates/base.js` preload and `static/_headers` Early-Hints already
  reference, which therefore needed no change. The relative form also makes the
  face portable into the bundle, where an absolute `/fonts/` URL has no meaning.
- The design-sync converter copies the woff2 into the bundle's `fonts/` as files
  and rewrites the faces to `./JetBrainsMono-*.woff2`, via
  `cfg.extraFonts: ["../static/_shared.css"]` (it harvests the `@font-face`
  blocks straight from the shared stylesheet — one source of truth).
  `runtimeFontPrefixes` is dropped; the fonts are bundled, not host-served.

The wrinkle that shaped the implementation: **Vite library mode always
base64-inlines assets referenced by `url()`** — `build.assetsInlineLimit` is
ignored in lib mode. Left alone, the relative faces inline into `dist/style.css`,
which the converter copies verbatim into `_ds_bundle.css`, bloating the bundle's
stylesheet from ~25 KB to ~653 KB of base64 and bypassing the file-based `fonts/`
path entirely. So `design-system/vite.config.ts` carries a small `stripFontFace`
plugin that removes `@font-face` blocks from the emitted stylesheet; `extraFonts`
re-adds them as files. The deployed site uses `static/_shared.css` directly (not
the Vite output), so its `@font-face` and `/fonts/` serving are untouched.

Result: Claude Design previews render in real JetBrains Mono, `_ds_bundle.css`
stays ~25 KB, and the woff2 ship once as cacheable files. The repo-specific
mechanics (and the standing watch-list) live in
`design-system/.design-sync/NOTES.md`.

## Considered Options

- **Keep host-served fonts + `runtimeFontPrefixes`** (the prior state) — zero
  new committed bytes. Rejected: the Claude Design runtime has no `/fonts/`, so
  every preview — and every design built from the DS — renders in fallback mono;
  the suppressed `[FONT_MISSING]` check hid exactly the problem it exists to
  catch. The deploy also kept losing the files.
- **Let Vite base64-inline the faces** (commit the woff2, keep relative URLs, no
  plugin) — simplest, and it does render. Rejected: it inflates the bundle
  stylesheet ~25× (~653 KB), re-downloads the fonts with every CSS load instead
  of caching them, and the committed files are never used *as files* — the
  opposite of the intent.
- **Absolute `/fonts/` `@font-face` + `extraFonts`** (no Vite plugin) — Vite
  leaves absolute URLs external, so nothing inlines and the bundle stays lean.
  Rejected: an absolute `/fonts/` URL resolves to nothing inside the Claude
  Design bundle, and it re-pins the live site to a `/fonts/` serving root; the
  relative form resolves correctly in both contexts from one declaration.
- **Substitute a freely-available mono for previews** — sidesteps shipping the
  brand font. Rejected: it breaks the 1:1 mapping between Claude Design output
  and the real site (ADR 0003) — every design would diverge from what ships.
