# Architecture backlog

Actionable deepening opportunities from a full-repo review (2026-07-07).
Ordered by impact within each area. Cite the relevant ADR when picking one up.

## Build pipeline

1. **Refactor render module state into a RenderContext.** `lib/emit/render.js` uses
   module-level mutable state (`MEDIA_BASE`, `slugIndex`, `mediaVariants`, `altWarned`)
   reset via `configureRender()`; `altWarned` bleeds between builds. Replace with a
   factory returning bound render functions. *(High impact, medium effort)*
2. **Observable listening fallbacks.** `lib/listening.js` falls back
   Worker → Last.fm → stale cache → empty but consumers can't tell which was used.
   Return `{ tracks, playcount, source, fetchedAt }`. *(High, low)*
3. **Optional incremental builds.** Full re-render of every page/asset per build.
   Track note mtimes in Intake and skip unchanged pages behind an `INCREMENTAL=1`
   flag. *(High, high)*
4. **Better asset failure reporting.** `lib/emit/index.js` uses `Promise.all` on asset
   processing — use `allSettled` and report failing asset names. Also log files
   silently skipped by `copyStatic()` in `lib/emit/assets.js`. *(Medium, low)*
5. **Centralize config.** `LISTENING_OFFLINE`, `MEDIA_MANIFEST`, and the hardcoded
   early-hints allowlist (`EARLY_HINTED` in `lib/emit/assets.js`) into one validated
   `lib/config.js` / `site.config.js`. *(Medium, low)*
6. **CSP error clarity.** `lib/emit/csp.js` should list the missing hashes in its
   error instead of requiring a manual diff. *(Low, low)*

## Design system / templates

7. **Parity tests for dual-authority markup.** Listening rows have byte-equality
   tests; Article/Thought row markup rendered by React vs `templates/rows.js`
   helpers does not. Add snapshot/parity tests covering tag markup whitespace,
   HTML escaping, and data-attribute sanitization — the three likeliest drift
   points. *(High, medium)*
8. **Design-sync drift check.** Nothing validates that `.design-sync/` previews
   match exported components. Add a CI check comparing exports vs synced previews.
   *(Medium, medium)*
9. **Tighten types.** Export `tagsHtml()` in the public API; type
   `formatScrobbleCount()` strictly. *(Low, low)*
10. **Defensive SSG bundling.** Fail the design-system SSG build if a component
    pulls an unexpected external import; document the font-face stripping pattern.
    *(Low, low)*

## Workers

11. **Enforce ADR 0002 in CI.** Shared code (`workers/lib/transport.js` etc.) is
    bundled per-worker at deploy; a partial deploy silently forks behavior. Add a
    CI check (or deploy script guard) that any change under `workers/lib/` triggers
    `deploy:workers` for all three. *(High, low)*
12. **Poller observability.** `ListeningPoller` DO has no instrumentation — if it
    stalls, readers serve stale data invisibly. Add logging plus a cache-age /
    `fetchedAt` header on the read path so staleness is detectable (pairs with #2).
    *(High, low)*
13. **Worker failure-mode tests.** Cover rate-limit binding failures, edge-cache key
    isolation, KV TTL expiry, DO persistence errors. *(Medium, medium)*
14. **CI/CD for workers.** Wrangler config validation, lint, and post-deploy smoke
    tests (hit each worker's health path). *(Medium, medium)*
15. **De-duplicate wrangler config.** Rate-limit namespace IDs are hand-copied across
    three `wrangler.toml` files; generate or assert consistency in a test. *(Low, low)*

## Suggested first batch

#1, #2 + #12 (one observability story end-to-end), and #11 — highest
impact-to-effort, and none change shipped HTML.
