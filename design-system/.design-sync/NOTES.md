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
  emitted `dist/style.css`, which re-exports `static/_shared.css` verbatim.

## Fonts
- The brand font is JetBrains Mono, self-hosted by the deploy (woff2 dropped into
  `/fonts/` at build time — NOT committed to the repo). So the bundle references
  the family but ships no `@font-face` files; `cfg.runtimeFontPrefixes:
  ["JetBrains Mono"]` declares it host-served and suppresses `[FONT_MISSING]`.
- Consequence: Claude Design previews render in fallback mono (ui-monospace),
  not JetBrains Mono. To improve preview fidelity, drop the OFL woff2 files under
  the package and switch to `cfg.extraFonts` — deferred for now.

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
- The font situation (host-served, fallback in previews) is a standing state,
  not a miss — don't re-chase `[FONT_MISSING]`; it's suppressed by config.
