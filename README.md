# mattdoes.online

Source for [mattdoes.online](https://mattdoes.online). Static HTML from a small verb registry, hosted on Cloudflare Pages. Live listening sits on a same-origin Worker.

## what's on it

- **home** (`/`) — "matt does …", with watch, listen, and unshared as the menu.
- **watch** (`/watch/`) — recent Letterboxd watches. Reviews are the witness statements. Posters are mirrored to `media.mattdoes.online` at build time.
- **listen** (`/listen/`) — recent plays from the listening worker, baked at build time and refreshed live.
- **unshared** (`/unshared/`) — the music project, with a public `mailto:unshared@mattdoes.online` link.
- **404** — in character, and it links the index of anomalies.

`/frequency/` is a noindex page and is not in the menu or the sitemap. `/movies` redirects to `/watch`, `/listening` to `/listen`, and the retired sections redirect home.

## how it's built

`site/verbs.ts` lists the verbs. `build.js` fetches listening data and the Letterboxd RSS, mirrors posters when `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` are set, and writes `dist/`. A failed poster fetch or upload leaves the Evidence placeholder and does not fail the build.

`scripts/pages-prebuild.sh` does not clone anything. The Cloudflare Pages build command stays `bash scripts/pages-prebuild.sh && npm run build`.

Workers, same-origin under `/api/`:

- **`mattdoes-listening`** — `/api/listening/now` and `/api/listening/recent`.
- **`mattdoes-geo`** — still deployed. The page no longer draws a map.
- **`mattdoes-csp-report`** — collects CSP reports.

`mattdoes-rebuild` has no route. Every six hours it POSTs the Pages deploy hook so the Letterboxd snapshot stays current.

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
npm run optimize-media   # .webp variants from content/attachments, if that directory exists
npm run sync-media       # push those files to R2 (needs a CF token; uses the wrangler pin in workers/)
```

CI (`.github/workflows/build.yml`) audits, typechecks `site/`, builds, lints HTML, and runs tests. Cloudflare Pages deploys from a successful GitHub push on its own.

## workers

KV bindings, routes, and secret names live in each `wrangler.toml`. From the repo root:

```
npm run deploy:workers
```

Listening secrets are `LASTFM_USERNAME` and `LASTFM_API_KEY`. Wrangler stays the version pinned in `workers/package-lock.json`. Do not run `npx wrangler`.
