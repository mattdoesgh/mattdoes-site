# Prerender via static speculation rules

The site is full-page-load (not a SPA), so cross-page navigation pays a fetch +
parse + paint on every click. `static/nav-prefetch.js` already had a Speculation
Rules layer to prerender same-origin links, but it injected the
`<script type="speculationrules">` at runtime via `createElement`. Under the
site CSP (`script-src 'self'`) Chromium silently blocked that inline script, so
the prerender fast path never ran in production — navigation always fell back to
plain `rel=prefetch`. We decided: emit the speculation rules as **static markup**
in the document `<head>` (`design-system/ssg/document.tsx`) and add the
purpose-built `'inline-speculation-rules'` source to `script-src` in
`static/_headers`. `nav-prefetch.js` is reduced to the `rel=prefetch` fallback
for browsers without the API (Safari, Firefox); its runtime-injection +
CSP-violation-watching dance is gone. Prerender uses `eagerness: 'conservative'`
(pointerdown/focus) for the first rollout to keep speculative loads tightly
scoped.

A prerendered document **runs its scripts at prerender-creation time**, against
whatever state existed then. The visitor theme/accent is persisted in
`localStorage` (`mdo:tweaks:v1`) and was previously applied only by the deferred
`tweaks.js`, so a prerendered page would freeze a stale (or default) theme and
activate it instantly on click — making "my setting didn't stick" worse, not
better. Two coupled changes make prerender safe: a synchronous `theme-boot.js`
in `<head>` applies the saved theme before first paint (also fixing the
pre-existing dark→light flash on ordinary loads), and `tweaks.js` re-applies the
latest persisted prefs on `prerenderingchange` and `pageshow` (which also covers
bfcache restores). The theme boot is shipped as an external `'self'` script
rather than inline, so it needs no CSP hash to maintain.

## Considered Options

- **Inline `<script type="speculationrules">` injected at runtime (status quo)** —
  rejected: blocked by `script-src 'self'`, so it never fired; detecting the
  block required listening for a `securitypolicyviolation`, fragile and silent
  when it failed.
- **Inline theme boot with a build-time `'sha256-…'` CSP hash** — zero extra
  requests, but the exact inline bytes must be hashed every build and a mismatch
  silently re-introduces the flash. Rejected in favour of a tiny external
  `'self'` script (already permitted, no hash to keep in sync), preloaded via
  Early Hints so the blocking cost is negligible.
- **`eagerness: 'moderate'` (hover/viewport-dwell) for prerender** — broader
  coverage but prerenders pages the visitor may never open, running their
  enhancement scripts speculatively. Deferred: start conservative, revisit once
  the speculative-execution behaviour of the geo/now-playing scripts is
  confirmed harmless before activation.

## Follow-up (2026-06)

`eagerness` was widened to **`moderate`** after `now-playing.js`,
`geo-background.js`, and `listening-live.js` were taught to defer network work
until `prerenderingchange` (same pattern as `tweaks.js`). Speculation rules now
live in `design-system/ssg/document.tsx` with `moderate` for both prerender and
prefetch.
