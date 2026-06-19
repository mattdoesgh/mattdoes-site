# Build-time listening snapshot sourced from the Worker

The static `/listening/` page (and the homepage scrobble stat) baked
`count: 0` and the "No scrobbles yet" empty state in production. The build
fetched Last.fm directly, but the production Cloudflare Pages build has no
Last.fm credentials and no committed cache, so the snapshot resolved to
empty — the page only ever populated once the browser live-updater polled
the (healthy) Worker. Result: a wrong-content flash on every visit, nothing
at all for no-JS visitors, and a permanently empty page whenever the Worker
hiccupped (the empty static fallback wiped any last-known-good).

We decided: the build-time snapshot sources from the deployed listening
Worker's own `/api/listening/recent` route instead of Last.fm. The Worker
already serves live scrobbles from its KV cache and needs no credentials on
the request path, so the static snapshot now reflects reality without any
secrets in the Pages build. `lib/listening.js` resolves in order:

1. a fresh disk cache (short-circuits all network — keeps tests hermetic);
2. the listening Worker (production path);
3. Last.fm direct (only when the build *does* have `LASTFM_API_KEY`);
4. a stale disk cache (back-stops a Worker-down deploy);
5. empty.

`LISTENING_OFFLINE=1` skips steps 2–3; the test harness, `pretest`, and the
CI fixture build set it so they never reach out.

Consequence — one playcount source. The total scrobble count is now the
recent-tracks `@attr.total` in every path (the value the live Worker already
served), replacing the old `user.getinfo` lookup. The dead `user.getinfo`
URL builder, its decoder, and the separate `lastfm-user.json` cache are
removed. The static stat and the live-updated stat can no longer disagree.

Consequence — a build-time dependency on the deployed Worker. A Worker that
is down at deploy time drops the build to its cache (step 4) or empty (step
5) — strictly better than the previous always-empty production behavior, and
the common case (Worker up) now ships real data with no flash. This does
**not** change the ADR 0002 redeploy coupling: `lib/lastfm.js` is still
bundled into the Worker, so editing it still means `npm run deploy:workers`.

## Considered Options

- **Add Last.fm credentials to the Pages build** — set `LASTFM_API_KEY` /
  `LASTFM_USERNAME` as Pages build env vars so the existing direct fetch
  works. Rejected as the primary fix: it leaves two playcount sources
  (`user.getinfo` vs `@attr.total`) that can drift, needs dashboard config
  outside the repo, and duplicates upstream calls the Worker already makes.
  Kept as the optional step-3 fallback for credentialed builds.
- **Commit a refreshed cache snapshot** (scheduled job commits
  `.cache/lastfm.json`) — adds commit noise, a cron, and staleness for no
  gain over reading the Worker that already holds fresh data.
- **Stay client-only, fix only the flash** — bake a neutral skeleton instead
  of `0`/empty. Rejected: still shows nothing to no-JS visitors and still
  has no graceful degradation when the Worker is unavailable.
