# Assessment

Reviewed against the tree at `ae5523b` and the code this change adds. The page is a small static site with a strict build. The problems are leftovers and a few mobile gaps, not a missing framework.

## Structure

`build.js` fetches the listening snapshot and the Letterboxd diary, mirrors posters, then `lib/emit` writes HTML from `site/verbs.ts`. `site/render.js` is one string-template shell for `/`, `/watching/`, `/listening/`, `/404`, and the offline `/frequency/` page. `/unshared/` is a second publisher (`lib/publish-unshared.js`) that copies `concepts/`. Four Workers sit on `/api/*` or on a cron. There is no `content/` directory. Notes are not in the repo anymore.

That split is fine. What is not fine is the residue of the previous site. `site.config.js` still described a GeoJSON bake, a status pill, and section bios that nothing read. `lib/time.js` existed only so `test/time.test.js` could import it, and the test described a deleted `templates/_helpers.js`. Comments in the listening worker named `now-playing.js` and `listening-live.js`, which are not in the tree. Those are the files an agent would open first and trust. They are removed or corrected here.

`workers/geo` is still deployed. The page does not call `/api/geo/lookup`, and the Permissions-Policy denies geolocation. The worker, its KV binding, and its tests are real. Deleting them is an infra change, not a comment fix. Leave them until Matt wants the route gone.

`scripts/optimize-media.js` and `scripts/sync-media.js` still walk `content/attachments/` and no-op when it is missing. Poster bytes go through `lib/posters.js`, not those scripts. Do not point a new media task at them.

## Data flow

Home and `/listening/` bake Last.fm at build time (`lib/listening.js`). The browser then polls `/api/listening/now` (home) and `/api/listening/recent` (`/listening/`). `/api/listening/charts` is build-only. The Monday cron `0 11 * * 1` refreshes `charts:week` and asks `mattdoes-rebuild` to POST the Pages deploy hook. A six-hour cron on rebuild refetches Letterboxd. Posters and covers land on R2 (`mattdoes-media`) and are served from `media.mattdoes.online`. A poster that is not mirrored is omitted.

`/listening/` is not chart-only. The chat note said the recent list was gone. `renderListen` still prints it, and `station.js` still replaces it. That note is recorded as a disagreement, not as permission to delete the list.

The home line is duplicated. `lib/listen-line.js` bakes "last listened". `static/station.js` is a classic script, so it cannot import that module, and it repeats the clip. The index parity check fails if `LISTEN_LIMIT` drifts. The track-row HTML in `station.js` and `render.js` can still drift. A bundler would remove the copy and is the wrong trade.

## Mobile

The phone work that already landed is specific and should stay: `text-size-adjust: 100%`, `100dvh` after `100vh`, `clamp()` type, a 44px poster hit target made of padding and a negative margin, and reduced motion that turns off the wave, the pull hint, and smooth scroll. The across-to-down pull is a real gesture (thresholds are generated from `poster-prefs.js`), not scroll hijacking.

What is still weak:

- No `viewport-fit=cover` and no `env(safe-area-inset-*)`. Footer marks and the birds1 controls sit in the home-indicator band. Page padding is `--space-page` only.
- birds1 locks the document (`height: 100dvh`, `overflow: hidden`, canvas `touch-action: none`). That is correct for the flock and wrong if a control lands under the home indicator. The home link is tested with `elementFromPoint` in the visual suite, which does not include a safe area.
- Poster and cover images have no `srcset`. The first film is eager. The rest are lazy and stay on `data-src` until posters are on. Covers are fixed 300×300. That is honest for 25 images. It is not a responsive image pipeline.
- `scroll-behavior: smooth` is on unless reduced motion is set. The pull gesture does not depend on it. A reduced-motion user is covered. A normal phone scroll of the film strip is a horizontal overflow, which is fine, and it is not the same thing as the desktop wheel threshold.
- Dead rules still ship inside the 29.5KB station cap: `.status`, `.time`, `.verb-nav`, `.redaction*`, `.lede`, `.outlinks`, `.home-link`, `.kicker`. Nothing in the HTML uses them. Tests assert the elements are absent, and two tests pin the selectors in the CSS (`.slot .kicker` tracking, and the reduced-motion group that starts with `.redaction-hint`). Deleting the rules changes the hashed stylesheet, so this change leaves them. The index lists them under `simplification.classesOnlyInCss`.

## Accessibility and performance

axe runs in the visual job. Skip links, button names on the poster switches, the scene dialog, star `role="img"`, and the wave's spoken text are in place. Focus is `:focus-visible` after a reset of `:focus`. That is the right shape.

The station shell is one CSS file and one deferred script, hashed and cached immutable. Fonts are a year. That is the right caching story for this size. The listening worker's browser TTLs are short on purpose so the Monday rebuild is not stuck behind a stale chart. Do not lengthen them to "make it faster."

`injectInlineScriptCsp` still knows how to hash inline scripts. Emit passes an empty list. Keep it that way. A hash source would turn off `inline-speculation-rules`.

## What this change simplified

- Removed the unused `geo`, `status`, `footerText`, and `sections` fields from `site.config.js`.
- Removed `lib/time.js` and `test/time.test.js`.
- Corrected comments that named `scripts/bake-home-geojson.js`, `now-playing.js`, `listening-live.js`, and `rows.js`.

The build output is unchanged by those edits. An offline production build before and after this change hashed to the same bytes: `15a12dc3d757ed547cf6e0b3c557d5f1e022f97155246613959ab1bca14be28c`.

## What not to do from this review

- Do not retire the geo worker, the recent-track list, or the CSP hasher in this kind of change.
- Do not rename `buildFixtureVault`. It is a bad name and it is imported everywhere. A rename is churn.
- Do not add safe-area padding without a preview at 390×844. It moves the footer and the birds1 bar.
- Do not delete the dead station selectors without updating the two tests that require them.
- Do not add a module bundler so `station.js` can import `listen-line.js`.

## Efficiency

Measured on this tree. Tokens are `bytes / 4`, rounded, and are estimates. Tool counts are a procedure, not a recovered agent trace. The old cloud-agent transcripts are not in the repo.

| | Measured |
| --- | --- |
| Source corpus the index scans, tests included, binaries excluded | 134 files, 840,160 bytes |
| `intel/index.json` | 172,127 bytes. Do not read it. Query it. |
| `intel/curated.json` | 20,923 bytes |
| `AGENTS.md` | 3,848 bytes. The previous file was 820 bytes. |
| Full `npm run intel` when a scanned file changed | 109 ms (a later clean tree regenerated in 116 ms) |
| Second run, nothing dirty | 19 ms to write the file, 77 ms wall, every section kept |
| `npm run intel:check` | 335 ms |

Locate cost, measured as bytes returned before editing:

| Task | Search hits | Hit bytes | `--feature` bytes |
| --- | --- | --- | --- |
| Poster toggles (`data-posters-toggle`) | 6 files | 128,931 | 1,614 (`watching-toggles`) |
| Now-listening line (`now listening`) | 3 files | 29,597 | 1,417 (`home-listen`) |
| Unshared registry (`unsharedEntries`) | 5 files | 49,705 | 1,131 (`unshared-hub`) |
| birds1 path | 16 files | 97,222 | 1,450 (`birds1`) |

Reading `AGENTS.md` plus one feature query is 3,848 + about 1,500 bytes, two reads. A search still hands you the hit files above, and the previous entry point was only 820 bytes because it did not tell you which files to open. The index does not shrink the files you then edit. `watching-toggles` still points at 72,945 bytes of sources.

Estimated tool calls for that locate step, using "one grep, then open every hit" against "read AGENTS, then `--feature`": 8 against 2 for the toggles, 5 against 2 for the now-listening line, 7 against 2 for the hub, 18 against 2 for birds1. That estimate stops at naming the files.

The changes themselves were larger than the locate step. Measured from git, not from an agent log: `#188` touched 10 files (+627/−16). `#188` through `#195` together touched 29 files (+1,355/−164), baselines included. `#189` touched 12 files (+681/−24). `#184` touched 31 files. `#185` touched 8. `#187` touched 6. Most of that is the feature, the tests, and the screenshots. An index would not have made those diffs smaller. It would have skipped the search that preceded them.

`npm run intel -- --changed static/poster-prefs.js` names `watching-toggles`, `/watching/`, and the four tests. That is the invalidation map. It is a query, not a guess.
