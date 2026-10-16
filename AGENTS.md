# Agent notes

Direction B is locked. Clear liquid glass on the top nav and the homepage shelf tiles only. Content stays bare on the faint field. No scanlines, glitch, chromatic fringe, or terminal chrome. Do not restyle.

Do not invent digs, watches, or posts. A week is a file in `content/digs/`. `publish: journal`, `making`, and `thoughts` still build, and they are not routed.

Wrangler stays at the exact version in `workers/package-lock.json` (4.151.0). Do not run `npx wrangler`. Keep the `CSP_RL`, `GEO_CACHE`, and `GEO_RL` bindings.

GitHub Actions stay pinned to a full commit SHA, with `permissions: contents: read`.

One concern per pull request. Do not merge.
