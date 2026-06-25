# design-sync notes — @mattdoes/ds

Repo-specific gotchas for future syncs of the mattdoes.online design system.

## Layout
- The DS package lives in `design-system/` (not repo root). Run all design-sync
  commands from `design-system/`: `.design-sync/`, `.ds-sync/`, and `ds-bundle/`
  are rooted there. `--node-modules ./node_modules`, `--entry ./dist/index.es.js`.
- This DS is also the site's build-time renderer (React SSG via `ssg/`), so the
  component source is the single source of truth — keep that in mind when a sync
  surfaces a markup question; the answer is whatever the live site needs.

## Build
- `npm run build` (Vite library mode) emits `dist/index.es.js` (the entry),
  per-file `dist/**/*.d.ts`, and `dist/style.css`. The JS entry (`src/index.ts`)
  is intentionally CSS-free so it runs under Node for SSG; the stylesheet builds
  from the separate `src/styles-entry.ts` entry. `cfg.cssEntry` points at the
  emitted `dist/style.css`, which re-exports `static/_shared.css` MINUS its
  `@font-face` blocks (see Fonts — a Vite plugin strips them).
- **The converter resolves component exports via `package.json` `types`
  (`./dist/index.d.ts`). The dts MUST land FLAT at `dist/index.d.ts` (with
  `dist/components/*.d.ts` etc.), NOT under `dist/src/`.** `vite.config.ts`
  pins this with `dts({ ..., compilerOptions: { rootDir: 'src' } })`. Without
  that, vite-plugin-dts 5 (unplugin-dts) derives the output root from the
  tsconfig `include` (`["src","ssg"]`) → project root, prefixing every
  declaration with `src/` (`dist/src/index.d.ts`) and leaving the `types` entry
  dangling. The converter then parses the .d.ts files, finds **0** PascalCase
  exports, logs `[ZERO_MATCH] … tokens-only DS`, and produces a 0-component
  bundle whose diff marks ALL components `removed` — i.e. it would WIPE the
  project. This regressed when #73 bumped vite-plugin-dts 4→5 (2026-06-22) and
  was fixed the same day by adding `rootDir`. If a future sync ever reports
  `[ZERO_MATCH]` / "tokens-only", check `dist/index.d.ts` exists FIRST — do not
  upload a 0-component build.

## Fonts
- JetBrains Mono woff2 (Light/Regular/Medium/SemiBold/Italic) are COMMITTED under
  the repo's `static/fonts/`. The `@font-face` block in `static/_shared.css` uses
  stylesheet-relative `url('./fonts/JetBrainsMono-*.woff2')`, which resolves both
  on the deployed site (static/ copies to dist root, so `./fonts/` → `/fonts/`,
  matching the preload `renderDocument` emits (design-system/ssg/document.tsx) +
  `static/_headers`) and inside the design bundle.
- Vite library mode ALWAYS base64-inlines url() assets (`build.assetsInlineLimit`
  is ignored), which would bloat `dist/style.css` — and the design bundle's
  `_ds_bundle.css` — by ~600 KB. So `vite.config.ts` has a `stripFontFace` plugin
  that removes `@font-face` blocks from the emitted CSS. The converter re-adds the
  faces as real woff2 FILES via `cfg.extraFonts: ["../static/_shared.css"]`
  (extractFonts harvests the `@font-face` from `_shared.css`, copies the woff2 to
  `ds-bundle/fonts/`, and rewrites the urls to `./JetBrainsMono-*.woff2`).
- Result: `_ds_bundle.css` stays ~25 KB and previews render in real JetBrains
  Mono, not fallback. `cfg.runtimeFontPrefixes` is GONE (fonts are now bundled,
  not host-served); do not re-add it or `[FONT_MISSING]` checks get suppressed
  for no reason. Keep the `static/_shared.css` `@font-face` weights and the
  committed `static/fonts/` files in sync.

## README / guidelines
- `readmeHeader` is supported again as of the 2026-06-22 staged scripts (it's in
  `lib/common.mjs`'s validated key allowlist and handled in `package-build.mjs`);
  the earlier "removed, fails with unknown key" note is obsolete. We deliberately
  keep shipping the DS's authored intro via
  `cfg.guidelinesGlob: [".design-sync/conventions.md"]` → the bundle's
  `guidelines/` (which the design agent reads); the bundle README stays the
  converter's template. Keep editing `.design-sync/conventions.md`. Switching to
  `readmeHeader` (prepended to the README, inlined into the design agent's system
  prompt) is now a viable option if guidelines/ ever stops being read — but it's
  a change, not a fix; only do it deliberately.

## Tokens & callout (linter requirements)
- `package-validate` / the design linter flags custom-property DECLARATIONS under
  component selectors. `.callout*` therefore sets `border-left-color` / `background`
  / title `color` directly per variant (no `--co-accent` cascade var). Don't
  reintroduce a per-component custom property.
- Non-color/spacing/radius/shadow/font tokens need an explicit `/* @kind other */`
  after the value or they read as unclassified: currently `--lh`,
  `--geo-point-opacity`, `--geo-shimmer-min`, `--geo-shimmer-max` in
  `static/_shared.css`. Add the marker to any new metric/opacity token.

## Theming
- Design tokens (`--bg`, `--ink`, `--accent`, …) are scoped to the document
  `html` element in `static/_shared.css`, with the dark set as the default and
  `html[data-theme="light"]` the only override. `ThemeProvider` sets `data-theme`
  + an inline `--accent` on a wrapper div: the inline `--accent` cascades (so
  accent switching works in previews), but light/dark switching via the wrapper
  does NOT yet work because the token sets are html-scoped. Widening the token
  scope to `.ds-root` is tracked in docs/adr/0003.

## Re-sync risks
- `dist/style.css` is a build artifact (gitignored). A re-sync MUST run
  `npm run build` first (it's `cfg.buildCmd`) or `cssEntry` won't resolve.
- After a re-sync, expect `ds-bundle/fonts/` to hold the 5 woff2 + a `fonts.css`
  with `./JetBrainsMono-*.woff2` refs, and `styles.css` to `@import` it. If fonts
  go missing or `_ds_bundle.css` balloons past ~25 KB, the `stripFontFace` plugin
  or `cfg.extraFonts` regressed (see Fonts) — that's the thing to check, not
  `runtimeFontPrefixes`.
- Render check: the 2026-06-19 re-sync FINALLY ran the full browser render check
  (playwright 1.61.0 + chromium installed; mac cache at
  `~/Library/Caches/ms-playwright/`, NOT `~/.cache/`). 16/16 render cleanly and
  JetBrains Mono is visibly applied across every card — the font fix is confirmed.
  Playwright lives in `.ds-sync/node_modules` (gitignored, reinstall on a fresh
  clone: `cd .ds-sync && npm i playwright && npx playwright install chromium`).
  `package-validate`/`resync` import it relative to `.ds-sync/`, so a smoke test
  must run from THERE, not from `design-system/` (where it won't resolve).
- keyRecipe bump (anchor recipe 5 → staged-scripts recipe 7) on the 2026-06-19
  re-copy made ALL existing components read as `changed`/`pendingGrade` and
  cleared every carried grade (0 carried forward on the first capture). This is
  scripts churn, NOT real source change — the previews were untouched and graded
  identically. Expect the same whenever the staged `.ds-sync/` scripts advance a
  recipe: the re-sync re-grades everything from the fresh sheets (which is also
  what finally gave us the browser font confirmation). Not a regression.
- TweaksDialog renders BLANK in-card without help: the shipped CSS anchors
  `dialog#tweaks` `position: fixed` bottom-right (for `showModal()`'s top layer),
  so an inline `open` dialog falls outside the capture's content slice (png <5KB →
  `[RENDER_BLANK]`, even though the DOM text is all present). Fix lives in the
  preview only — `previews/TweaksDialog.tsx` injects a `<style>` pinning
  `dialog#tweaks{position:static;...}`. Don't "fix" the component; don't drop the
  override or the card goes blank again.
- 4 components from the 2026-06-18 "public-facing renderer" commit (ElsewhereLinks,
  IdentityRail, PageShell, TagCloud) were added but NOT synced until 2026-06-19;
  they now have authored previews. PageShell renders a full page → it has a
  `cfg.overrides` single-card + `980x640` viewport like Layout. The rail previews
  (ElsewhereLinks/IdentityRail/TagCloud) render the muted `.group`/`.ident` rail
  styling — intentionally low-contrast secondary nav, not a defect.
- A user-created folder of the full JetBrains Mono family (committed at the repo
  root as `webfonts/`, a manual pre-fix workaround) sat OUTSIDE the sync's managed
  dirs — the reconciliation never touched it. Redundant once `fonts/` shipped the
  faces, it was **removed on 2026-06-19** (untracked, unreferenced, ~1.5 MB). The
  5 weights the site uses live in `static/fonts/`; the sync sources fonts from
  there, never from that folder. NOTE: there is ALSO an `uploads/` folder IN THE
  PROJECT (claude.ai/design) holding the full JetBrains family (Bold…Thin) — a
  user manual upload, OUTSIDE the converter's managed dirs. The atomic delete
  reconciliation only touches paths the diff lists, so `uploads/`,
  `_adherence.oxlintrc.json`, `_ds_manifest.json`, and `.thumbnail` (app/user
  managed) are correctly left alone; never hand-add them to deletes.
- **Remote `_ds_sync.json` reads can be eventually-consistent.** On the
  2026-06-22 re-sync the FIRST `get_file _ds_sync.json` returned a stale 15-key
  anchor (no TagList) while two immediate re-fetches returned the authoritative
  16-key anchor. Seeding the driver with the stale read made TagList show as
  `added` (harmless here — atomic full-writes upload it anyway). The skill's
  "re-fetch right before finalize_plan; if it moved, re-run the driver" rule
  caught it. Always re-fetch the sidecar immediately before `finalize_plan` and
  trust the later, stable read.
- **Toolchain bumps churn the bundle/CSS bytes without touching components.** #73
  (vite 8 / TS 6, 2026-06-22) left all 16 component sourceKeys/renderHashes
  byte-identical (TS6 emits the same per-component .d.ts) but changed
  `bundleSha12` and `styleSha` → the diff was `16 unchanged` yet
  `upload.{bundle,styling}: true`. Expected; the atomic full-write re-uploads
  bundle + CSS and re-anchors. Not a regression.
- **A component's INTERNAL-default change reads as `unchanged` but still ships.**
  2026-06-25 re-sync (after #75 + #76): #75 added `thoughts`/`making`/`search`
  to `Topbar`'s `DEFAULT_NAV`, so the Topbar/Layout/PageShell *cards* visibly
  gained those nav items — yet the verdict was `changed: []`, all 16
  `unchanged`, `pendingGrade: []`. Why: `sourceKeys` hash the emitted `.jsx`
  re-export stub + `.d.ts` + `.prompt.md`, none of which move when only an
  in-component constant changes; the new nav lives in the compiled bundle, so it
  shipped via `upload.{bundle,styling}: true` + the `render_churn` canary (5
  picks: Footer/IdentityRail/PageShell/ThemeProvider/Time — all confirmed on the
  contact sheet), with grades carried forward (0 cleared). #76's comment-only
  `Time.tsx` edit + #75's `_shared.css` search styles also moved
  `styleSha`/`bundleSha12` (expected). Lesson: do NOT be alarmed by `changed: []`
  on a re-sync that obviously changed a card — eyeball the contact sheet / canary
  and ship. 16/16 render clean.
