# Agent notes

The site is a short list of verbs. `site/verbs.ts` is the registry. Each verb has a slug (the URL) and a separate label. The visible heading is `matt does ` plus the label: letterboxd at `/watching/`, last.fm at `/listening/`. `/unshared/` stays offline while `unsharedEnabled` is false in `site/verbs.ts`; the renderer stays. The home menu, the routes, and the sitemap come from the published verbs. An unknown source or a missing renderer fails the build. `/frequency/` is a noindex secret: it is not in the registry or the sitemap, and it stays offline while `SECRET_PATHS` is empty.

This site does not keep legacy redirects. Old paths are not redirected.

Do not invent watches or posts. Watches come from the Letterboxd RSS. Listening comes from the `/api/listening/*` worker. Posters are mirrored to the `mattdoes-media` bucket at build time. A poster that is not mirrored is omitted.

Wrangler stays at the exact version in `workers/package-lock.json` (4.151.0). Do not run `npx wrangler`. Keep the `CSP_RL`, `GEO_CACHE`, and `GEO_RL` bindings.

GitHub Actions stay pinned to a full commit SHA, with `permissions: contents: read`.

One concern per pull request. Do not merge.
