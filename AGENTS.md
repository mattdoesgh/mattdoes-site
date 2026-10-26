# Agent notes

Read this file, then query the index. Do not scan the repo when a query answers it.

```
node scripts/intel.js --feature <id>
node scripts/intel.js --route <path>
node scripts/intel.js --changed <path>
```

Feature ids and routes are in `intel/index.json`. Intent, rejected approaches, and lessons are in `intel/curated.json` under the same id. The critical review is `intel/assessment.md`.

## Trust

`intel/index.json` is generated. `npm run intel:check` fails when it disagrees with a full regen. Do not hand-edit it.

`intel/curated.json` is intent. Code wins when they disagree. A stale `verified-at` does not outrank the file. The check names the stale id and the files.

`intel/assessment.md` is judgment. Re-read the source before changing behavior.

## Don't

- Do not scan the repo when `--feature`, `--route`, or `--changed` lists the files.
- Do not re-litigate a decision in `intel/curated.json`.
- Do not add a color, font family, or font size outside `site/tokens.css`.
- Do not add a helper that already exists. `--changed` on the file you were sent to, and the module edges, are the check.
- Do not add a runtime dependency, a bundler, or stored audio.
- Do not verify posters, charts, or the live now-playing line with fixtures alone. The visual suite passed while the real preview had zero posters.
- Do not grow a hit area with an absolutely positioned `::before` or `::after`. Padding and a negative margin are the hit area.
- Do not inline a script or a style. CSP stays strict.
- Do not run `npx wrangler`. Wrangler is the binary pinned in `workers/package-lock.json`. Keep the `CSP_RL` binding.
- Do not pin a GitHub Action to a tag. `permissions` stay `contents: read`.
- Do not invent watches or posts. A poster that is not mirrored is omitted.
- `site/verbs.ts` is the registry. An unknown source or a missing renderer fails the build. `/unshared/` stays off the home menu. `/frequency/` is a noindex secret: it is not in the registry or the sitemap, and it stays offline while `SECRET_PATHS` is empty. Old paths are not redirected. Do not copy the prize mailto out of `renderFrequency`.
- Do not add a guide beside this file. Extend this file, a curated entry, or the generator.
- One concern per pull request. Do not merge.

## Verify

- The feature's `tests` list, then `npm test` when the change is shared.
- `npm run test:visual` when CSS, HTML, or client JS changes. Viewports are 390×844 and 1280×800.
- User-visible work is confirmed on the Pages preview, not the fixture server.
- `npm run intel:check` after any indexed file changes. Commit the regenerated index in the same change.

## Maintenance

- `npm run intel` regenerates a section only when its source hashes changed, and it prints the feature ids those files belong to.
- `npm run intel:check` fails when the index is stale, when a curated path or anchor is missing, or when a curated entry's product files changed after `verified-at`. Test files are listed on the feature and do not, by themselves, stale the entry.
- When the code change is committed and the prose is still true, run `npm run intel:touch` and commit `intel/curated.json`. When the behavior changed, edit the entry first, commit the code and the prose together, then touch.
- `npm run intel:hook` installs an opt-in pre-commit hook. CI does not install it.
- `index.sections.simplification` lists unused tokens, classes that appear only in CSS, modules nothing imports, and modules imported only by tests. Act on one only when a rebuild is byte-identical or the visual suite is clean.

## Locks the tests already enforce

Token literals, CSP headers, asset bytes, the verb registry, worker binding names, the wrangler pin, and Action SHAs are already tests. The index points at those files. Do not restate them as a second unchecked doc.
