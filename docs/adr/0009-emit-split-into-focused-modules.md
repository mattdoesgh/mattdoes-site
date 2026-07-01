# Emit split into focused modules

`lib/emit.js` had grown to ~1,050 lines spanning four loosely-related jobs:
markdown rendering (wikilinks/embeds, marked + Shiki, callouts, sanitization),
file plumbing with the minify + content-hash pipeline, inline-script CSP
hashing, and the feed/sitemap/robots emitters — all behind the single `emit()`
entry point. Any change to one concern meant navigating all of them, and the
CSP machinery (the most delicate part, see ADR 0001/0007 and the #80/#81
regression) shared a file with unrelated markdown code.

We decided: Emit becomes a directory, `lib/emit/`, with one module per
concern and an orchestrating entry:

- `index.js` — `emit()` itself: the model→page aggregation (siteMeta,
  feedEntries, listening mapping), the write order, and the colophon stats.
  Signature and behavior unchanged; `build.js` now imports
  `./lib/emit/index.js`.
- `render.js` — markdown → HTML. The per-emit state the wikilink/embed
  renderers close over (media base, slug index, media variants, alt-text
  warnings) stays module-level because they plug into a module-singleton
  `marked`; `emit()` resets it via `configureRender()` instead of assigning
  the variables directly.
- `assets.js` — file plumbing (page writes, static copies, the
  timeline-controls bundle), minify + content-hash, Early Hints links.
- `csp.js` — `injectInlineScriptCsp()`, alone with the inline-script hashing
  it must keep in lockstep with the document shell.
- `feeds.js` — Atom feed, sitemap, robots.

The split is a pure move: verified by byte-diffing `dist/` before/after on the
fixture vault — identical except the colophon's vanity line count (the new
module headers/imports; the counter now includes `lib/emit/*.js`) and its
build timestamp, which differs between any two runs. Emit's contract is
unchanged: deterministic given its inputs, Listening passed in by the
entrypoint, `/listening/` rows still rendered by `templates/rows.js`
(ADR 0001).

Alternatives considered:

- **Leave `lib/emit.js` as a re-exporting shim** so importers keep the old
  path — rejected: exactly one runtime importer exists (`build.js`), so the
  shim would be one more file whose only job is to hide where the code went.
- **Split by output artifact (pages.js, feed.js, headers.js…)** — rejected:
  the natural seams in the code are by *mechanism* (render, hash, headers,
  XML), which is how the file's own section markers were already organized;
  artifact-based modules would each re-import most of the mechanisms.
