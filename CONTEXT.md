# CONTEXT

## Vault
The Obsidian source tree of `.md` notes (plus `attachments/`) that the site is built from. Nested vaults (subdirs with their own `.obsidian/`) are skipped.

## Note record
What the vault reader hands Intake: `{ rel, content, mtime }`. `rel` is the vault-relative path used in every error message; `mtime` exists only as the `date:` frontmatter fallback.
Names the fs/pure seam: everything after the Note record is deterministic.

## Intake
The pure module that turns Note records into the Content model. Owns all loud-failure validation (publish kinds, slug rules, date/tags/aliases shapes, duplicate routes, duplicate about), thought splitting, stable thought IDs, sorting, and the slug index.
Invariant: same records in, same model out — no clock, no fs, no env. Error mode: throws with messages that name the offending `rel`.

## Content model
Intake's output: articles + thoughts + about note + slug index, all carrying raw markdown (never HTML). Articles and thoughts are newest-first; thought IDs are assigned oldest-first from CT wall-clock timestamps.

## Emit
The module that writes the Content model to a `distDir`: markdown rendering (Shiki, wikilinks, embeds against the slug index), templates, asset hashing, feeds, sitemap. Deterministic given its inputs — listening data is passed in by the entrypoint, never fetched here.

## Listening
The Last.fm-derived track data (recent scrobbles + playcount). Fetched by the build entrypoint (disk-cached) and by workers/listening (KV-cached); an input to Emit, not part of the Content model.
Both consumers decode through `lib/lastfm.js` — the pure wire-format codec (URL builders + decoders, no fetch/fs/config). It is bundled into the listening Worker, so the ADR 0002 redeploy rule applies to it.

## Thought
A micro-post split out of a daily note on `## HH:MM` headings (CT wall-clock). Carries a stable id `t-YYYYMMDD-HHMM` derived from its own timestamp.

## Row
The rendered form of one timeline entry — one renderer per content kind (article, thought, listening) plus a per-kind empty state, shared verbatim by every timeline surface: /blog/, the section listings, and the in-browser listening live updates. The homepage's compact feed is deliberately not a Row consumer; it is its own renderer.

## Edge transport
The shared Worker response machinery in `workers/lib/transport.js`: the JSON+CORS envelope, preflight, error cache policy (`errorJson`), fail-open KV access, and request helpers. Caching *policy* (TTLs, cache-control strings) stays per-Worker; only the envelope is shared. Editing it means redeploying all Workers (`npm run deploy:workers`) — see ADR 0002.

## Design system
The React + TypeScript component library in `design-system/` (`@mattdoes/ds`). One source of truth playing two roles: it renders the site's pages to static HTML at build time (`renderToStaticMarkup`, replacing the `templates/*.js` layer page by page) and it is the component set synced to Claude Design (claude.ai/design) for visual editing. Components emit the same class names as the templates and reuse `static/_shared.css` verbatim, so the look is unchanged; content still comes from the vault via Intake. The presentation layer goes React; everything else (static output, Workers, CSP, enhancement scripts, feeds) is untouched — see ADR 0003. Fidelity is held to semantic+visual equivalence (not byte-identical) because React controls HTML serialization; `design-system/ssg/render.tsx` proves it by diffing React output against the original template for identical data.

## design-sync
The pipeline that uploads `@mattdoes/ds` to a Claude Design project so the components are editable visually. Config + notes live in `design-system/.design-sync/`; the converter builds `ds-bundle/` (the `window.MattdoesDS` bundle + preview cards) from the package's compiled `dist/`. Re-syncs run from `design-system/`.
