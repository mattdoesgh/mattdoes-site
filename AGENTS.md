# Agent notes

The site is a station of verbs. `site/verbs.ts` is the registry (watch, listen, unshared). The home menu, the routes, and the sitemap are generated from that list. An unknown source or a missing renderer fails the build. `/frequency/` is a noindex secret: it is not in the registry, the sitemap, or the footer index.

Do not invent watches or posts. Watches come from the Letterboxd RSS. Listening comes from the `/api/listening/*` worker. Posters are mirrored to the `mattdoes-media` bucket at build time and fall back to an Evidence box when that fails.

Wrangler stays at the exact version in `workers/package-lock.json` (4.151.0). Do not run `npx wrangler`. Keep the `CSP_RL`, `GEO_CACHE`, and `GEO_RL` bindings.

GitHub Actions stay pinned to a full commit SHA, with `permissions: contents: read`.

One concern per pull request. Do not merge.
