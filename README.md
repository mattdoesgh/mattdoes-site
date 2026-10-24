# mattdoes.online

Source for [mattdoes.online](https://mattdoes.online). Static HTML from a small verb registry, hosted on Cloudflare Pages. Live listening sits on a same-origin Worker.

## what's on it

- **home** (`/`) — the verb list. The letterboxd row also shows the newest film and its stars.
- **watching** (`/watching/`) — recent Letterboxd watches. Posters are mirrored to `media.mattdoes.online` at build time.
- **listening** (`/listening/`) — recent plays from the listening worker, baked at build time and refreshed live. The monthly album chart is a weekly snapshot.
- **unshared** (`/unshared/`) — offline while `unsharedEnabled` is false. The page code stays. A public mailbox is rendered only when the page is published and `unsharedContact.email` is set.
- **404** — not found.

`/frequency/` is a noindex page and is not in the menu or the sitemap. This site does not keep legacy redirects.

## how it's built

`site/verbs.ts` lists the verbs. The slug is the URL and the label is separate. `build.js` fetches listening data and the Letterboxd RSS, mirrors posters when `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` are set, and writes `dist/`. A failed poster fetch or upload omits that poster and does not fail the build.

`scripts/pages-prebuild.sh` does not clone anything. The Cloudflare Pages build command stays `bash scripts/pages-prebuild.sh && npm run build`.

Workers, same-origin under `/api/`:

- **`mattdoes-listening`** — `/api/listening/now` and `/api/listening/recent`.
- **`mattdoes-geo`** — still deployed. The page no longer draws a map.
- **`mattdoes-csp-report`** — collects CSP reports.

`mattdoes-rebuild` has no route. Every six hours it POSTs the Pages deploy hook so the Letterboxd snapshot stays current. The listening worker also asks for that rebuild after it refreshes the album chart on Monday at 11:00 UTC, which is 6:00 AM US Central during daylight time and 5:00 AM during standard time.

## running it

```
npm install
npm run build
```

Output lands in `dist/`.

```
npm test
npm run typecheck
npm run lint             # html-validate against dist/**/*.html
npm run audit            # npm audit --audit-level=moderate
npm run check:tokens     # colors, font families, and font sizes stay in site/tokens.css
npm run test:visual      # screenshot baselines of the main pages at 1280 and 390
npm run optimize-media   # .webp variants from content/attachments, if that directory exists
npm run sync-media       # push those files to R2 (needs a CF token; uses the wrangler pin in workers/)
```

CI (`.github/workflows/build.yml`) audits, typechecks `site/`, builds, lints HTML, checks design tokens, runs tests, and compares screenshot baselines. Cloudflare Pages deploys from a successful GitHub push on its own. Style lives in `site/tokens.css` and `STYLE.md`.

## workers

KV bindings, routes, and secret names live in each `wrangler.toml`. From the repo root:

```
npm run deploy:workers
```

Listening secrets are `LASTFM_USERNAME` and `LASTFM_API_KEY`. Wrangler stays the version pinned in `workers/package-lock.json`. Do not run `npx wrangler`.
