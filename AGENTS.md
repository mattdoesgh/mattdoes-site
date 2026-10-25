# Agent notes

`STYLE.md` and `site/tokens.css` are the style source.

CSP is strict: no inline scripts and no inline styles.

Web Audio is generated live. Do not add stored audio.

`site/verbs.ts` is the registry. An unknown source or a missing renderer fails the build. `/unshared/` stays off the home menu. `/frequency/` is a noindex secret: it is not in the registry or the sitemap, and it stays offline while `SECRET_PATHS` is empty. Old paths are not redirected.

Do not invent watches or posts. A poster that is not mirrored is omitted.

Wrangler stays at the version in `workers/package-lock.json`. Do not run `npx wrangler`. Keep the `CSP_RL`, `GEO_CACHE`, and `GEO_RL` bindings.

GitHub Actions stay pinned to a full commit SHA, with `permissions: contents: read`.

One concern per pull request. Do not merge.
