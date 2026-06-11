# Shared worker code via relative imports

The two Cloudflare Workers (`workers/listening`, `workers/geo`) had grown
byte-for-byte duplicate transport code — the JSON+CORS response envelope,
preflight, error cache policy, fail-open KV access. We decided: shared code
that only Workers use lives in `workers/lib/` and is consumed by plain
relative imports (`../../lib/transport.js`); shared code that must run in
both the build pipeline and a Worker (isomorphic, e.g. a Last.fm decoder)
lives in repo-root `lib/` and the Worker reaches up the same way. Wrangler's
bundler and Node's test runner both follow relative imports outside the
worker directory, so no packaging layer is needed.

Consequence — deploy coupling: each Worker bundles its own copy of every
module it imports at `wrangler deploy` time. Editing a shared module (any
module a Worker bundles, wherever it lives) means redeploying **all**
Workers, or the un-redeployed one keeps running the old copy.
`npm run deploy:workers` at the repo root deploys both.

## Considered Options

- **Keep duplicating** — each Worker stays a fully self-contained file.
  Rejected: the duplication already drifted once (the listening Worker's
  hand-built 429 lost three CORS headers the geo Worker's envelope has),
  which is exactly how shared-by-copy code rots.
- **npm workspace package** (`workers/shared` as a dependency) — cleanest
  isolation and explicit versioning. Rejected: adds workspace plumbing,
  lockfile churn, and an install step to a repo with two tiny Workers;
  relative imports deliver the same bundle for ~150 LOC of helpers.
- **Put everything in repo-root `lib/`** — one shared-code location.
  Rejected: `lib/` is the build pipeline's seam (Intake/Emit/Listening,
  per CONTEXT.md); edge-only response/CORS code doesn't belong in it.
