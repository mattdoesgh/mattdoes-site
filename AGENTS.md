# Agent notes

## Don't

- Do not add a color, font family, or font size outside `site/tokens.css`.
- Do not add a runtime dependency, a bundler, or stored audio.
- Do not verify posters, charts, or the live now-playing line with fixtures alone. The visual suite passed while the real preview had zero posters.
- Do not grow a hit area with an absolutely positioned `::before` or `::after`. Padding and a negative margin are the hit area.
- Do not inline a script or a style. CSP stays strict.
- Do not run `npx wrangler`. Wrangler is the binary pinned in `workers/package-lock.json`. Keep the `CSP_RL` binding.
- Do not pin a GitHub Action to a tag. `permissions` stay `contents: read`.
- Do not invent watches or posts. A poster that is not mirrored is omitted.
- `site/verbs.ts` is the registry. An unknown source or a missing renderer fails the build. `/unshared/` stays off the home menu. `/frequency/` is a noindex secret: it is not in the registry or the sitemap, and it stays offline while `SECRET_PATHS` is empty. Old paths are not redirected. Do not copy the prize mailto out of `renderFrequency`.
- Do not add a guide beside this file. Extend this file.
- Do not write a comment that narrates a conversation, a person, or a past version. A browser quirk, a CSP constraint, a spec rule, or a security invariant can stay.
- One concern per pull request. Do not merge.

## Verify

- `npm run test:fast` while iterating. It needs no build.
- Before finishing: `npm run typecheck`, `npm run build:offline`, `npm run lint`, `npm run check:assets`, `npm run check:tokens`, `npm run test:all`. `npm test` is the build and `test:all` in one.
- `npm run test:visual` only when HTML templates, CSS, design tokens, or layout or visual JS change. Viewports are 390×844 and 1280×800.
- A test that builds the site does not belong in `test:fast`.
- User-visible work is confirmed on the Pages preview, not the fixture server.

## Locks the tests already enforce

Token literals, CSP headers, asset bytes, the verb registry, worker binding names, the wrangler pin, and Action SHAs are already tests. Do not restate them as a second unchecked doc.
