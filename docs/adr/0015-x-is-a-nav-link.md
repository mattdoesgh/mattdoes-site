# X is a nav link, not a page

ADR 0014 replaced the notebook with a baked `/posts/` feed of original
@mattdoes posts. That needed `X_BEARER_TOKEN` at build time. The feed is
cancelled. There is no thoughts page and no posts page.

We decided:

- **Routes.** Do not generate `/posts/` or `/thoughts/`. Do not redirect
  either path at a content section. Unknown paths 404.
- **No X API.** Delete the build-time fetch, `.cache/x-posts.json`, and the
  `X_BEARER_TOKEN` / `X_OFFLINE` switches. The site does not call X.
- **Nav.** The topbar carries a clear-glass chip to `https://x.com/mattdoes`,
  labelled `@mattdoes` (a short `X` when the bar is narrow). It sits beside
  the reading links, in its own social landmark, and again in the compact
  menu. Footer profiles stay: Letterboxd, X, Instagram, Last.fm.
- **Shelf.** The homepage “around here” tiles are writing, listening, digs,
  movies, and grok says. They do not list posts or thoughts.
- **Vault.** `publish: thoughts` stays valid so an older vault builds. Those
  notes are not written into a page, blog, search, topics, or RSS.

The profile URL lives on the topbar (`X_PROFILE`) and in `site.config.js`
`links`, kept in step with the footer.
