# Posts replace the thoughts section

The notebook at `/thoughts/` is no longer a public section. That nav slot and
the homepage “around here” tile are the original-posts feed from @mattdoes
on X. This overrides the earlier choice that X stay a profile link only
(ADR 0012). The footer profile link to x.com/mattdoes stays.

We decided:

- **Route.** `/posts/` is the page. `/thoughts/` and `/thoughts` 301 to it.
  The nav label is `posts`. The shelf note is `on x`.
- **What counts.** Original posts only. The API request sets
  `exclude=retweets,replies`. `lib/x-posts.js` also drops anything with a
  referenced tweet of type `retweeted`, `quoted`, or `replied_to`, and any
  body that starts with `RT @`. Quote posts count as reposts here.
- **How it is fetched.** Build-time bake, same posture as Letterboxd movies.
  X has no public RSS. `lib/posts.js` calls `https://api.x.com/2` when
  `X_BEARER_TOKEN` is set, caches the filtered list under `.cache/x-posts.json`,
  and passes it into Emit. `X_OFFLINE=1` skips the network (CI and tests).
  With no token and no cache, `/posts/` renders an empty state and a link
  to the profile. The build does not fail.
- **Refresh.** The next production Pages build that has `X_BEARER_TOKEN`.
  Between deploys the page is that bake. A Worker was the wrong fit: the
  site is static HTML, `connect-src` is `'self'`, and posts do not need the
  live poll listening uses for scrobbles.
- **Secret.** `X_BEARER_TOKEN` on the Cloudflare Pages (or Workers Builds)
  production environment. A read-only app token is enough. Do not commit it.
- **Vault.** `publish: thoughts` stays a valid frontmatter value so an older
  vault still builds. Those notes are not written into blog, search, topics,
  RSS, or a page.
- **Presentation.** Feed rows in the existing bare column. Glass stays on
  the nav and the shelf. No X embed, no third-party script.

The handle, profile URL, limit (20), and cache TTL live in `site.config.js`
(`x`).
