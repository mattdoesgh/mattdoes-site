# CLAUDE.md

Working notes for agents in this repo. The architecture is documented elsewhere —
read it before structural changes instead of re-deriving it here:

- **`CONTEXT.md`** — the domain glossary (Vault, Note record, Intake, Content
  model, Emit, Listening, Thought, Row, Edge transport, Design system, design-sync).
- **`docs/adr/`** — the decisions behind the structure (0001–0007). Cite ADRs in
  source comments, `CONTEXT.md`, and PRs only — never in shipped HTML, the README,
  or the colophon.

## What this is

Static HTML for [mattdoes.online](https://mattdoes.online), built from a private
Obsidian vault (`mattdoes-vault`). Every page is a React component rendered to
static HTML at build time; the shipped site is plain HTML + small
progressive-enhancement scripts. Cloudflare Pages, plus two same-origin Workers
for the live bits.

## Where things live

- `build.js` — entrypoint: reads the vault, fetches Last.fm data (disk-cached under
  `.cache/`), runs the pipeline.
- `lib/intake.js` — vault notes → content model. **Pure** (no clock/fs/env); throws
  with the offending vault-relative path.
- `lib/emit/` — content model → `dist/` (markdown, asset hashing, CSS/JS, RSS,
  sitemap). Imports the `render*` functions from the built design-system bundle
  (`design-system/dist-ssg/ssg.js`) for pages.
- `design-system/` — `@mattdoes/ds`, the React + TS component library. One source,
  three roles: it renders every page (`ssg/pages/`, `renderToStaticMarkup`), is the
  component set synced to Claude Design (`.design-sync/`) so they don't drift, and
  ships the one browser React island (`client/timeline-controls.tsx` → `dist-client/`,
  the timeline filter/density controls — the site's only client-side React).
- `templates/` — the browser Row module (`rows.js`), helpers (`_helpers.js`), asset
  registry (`_assets.js`). These three stay permanently; the old `*.js` page modules
  were removed after the React cutover soaked (ADR 0005).
- `workers/` — `mattdoes-listening` (request path is a pure KV reader; a
  `ListeningPoller` Durable Object is the sole Last.fm writer, ADR 0008),
  `mattdoes-geo`, and `mattdoes-csp-report`, sharing `workers/lib/transport.js`
  (the JSON+CORS envelope). Tooling is shared: one `workers/package.json`
  (wrangler devDep) serves all three — no per-Worker package files.

## Commands

```
npm install            # also installs design-system deps (postinstall)
npm run build          # prebuild (SSG + client bundles) → node build.js → dist/
npm test               # builds SSG + fixture-vault site, then node --test
npm run lint           # html-validate dist/**/*.html
npm run audit          # npm audit --audit-level=moderate
npm run deploy:workers # deploy all three Workers (listening, geo, csp-report)
npm run bake-geo       # re-bake static/home.geojson
npm run optimize-media # .webp variants under .cache/media-build/
npm run sync-media     # push originals + variants to R2 (needs CF token)
```

Without `vault/` populated the build is empty but does not error.

## Gotchas

- **Determinism.** Intake is pure — keep it that way. Listening data is an input to
  Emit, never fetched there.
- **`/listening/` rows are the one React exception** — still server-rendered by
  `templates/rows.js` to stay byte-equal for live in-browser updates (ADR 0001).
  Deliberately no React `ListeningRow`.
- **Editing shared worker code (`workers/lib/transport.js`) means redeploying all
  three Workers** (`npm run deploy:workers`) — ADR 0002.
- **CSP is strict** — no `'unsafe-inline'`, no third-party connect; both dynamic
  surfaces are same-origin Workers. Inline `<head>` scripts (importmap +
  speculation rules) are admitted by a per-build `sha256` (`injectInlineScriptCsp`);
  add one without hashing it and the CSP silently drops it (ADR 0001/0007).
- Keep `CONTEXT.md` and `docs/adr/` current. Run `/code-review` before pushing; open
  changes as PRs against `main`.
