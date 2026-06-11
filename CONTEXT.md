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

## Thought
A micro-post split out of a daily note on `## HH:MM` headings (CT wall-clock). Carries a stable id `t-YYYYMMDD-HHMM` derived from its own timestamp.

## Edge transport
The shared Worker response machinery in `workers/lib/transport.js`: the JSON+CORS envelope, preflight, error cache policy (`errorJson`), fail-open KV access, and request helpers. Caching *policy* (TTLs, cache-control strings) stays per-Worker; only the envelope is shared. Editing it means redeploying all Workers (`npm run deploy:workers`) — see ADR 0002.
