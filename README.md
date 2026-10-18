# mattdoes.online

Source for [mattdoes.online](https://mattdoes.online). Static HTML from in-repo notes, plus digs and a build-time Letterboxd snapshot. Hosted on Cloudflare Pages. Live listening and geo sit on same-origin Workers.

## what's on it

- **home** — name, a short bio, and shelves for listening, digs, movies, and grok says.
- **listening** (`/listening/`) — recent plays from Last.fm, baked at build time and refreshed live.
- **digs** (`/digs/`) — weekly music picks in `content/digs/`. Favorites also show on **grok says…** (`/grok/`), with anything else in `content/recommendations.json`.
- **movies** (`/movies/`) — the last 25 Letterboxd watches, from the diary RSS at build time.
- **search** — client-side filter over a static index.
- **about** and **colophon** — `content/about.md` (`publish: about`), and a generated colophon.
- **X** — `@mattdoes` in the topbar links to [x.com/mattdoes](https://x.com/mattdoes). Letterboxd sits beside it, the same chip, to [letterboxd.com/mattdoes](https://letterboxd.com/mattdoes).

Journal, making, and thoughts notes are still accepted. They are not published.

## how it's built

`content/about.md` is the about page. `build.js` reads markdown notes from `content/`, fetches listening data (disk-cached under `.cache/`), and writes `dist/`. Pages are React components rendered to static HTML (`design-system/`). The browser gets plain HTML plus small scripts. `/listening/` rows are rendered by `templates/rows.js` so live updates can swap the same markup.

`scripts/pages-prebuild.sh` does not clone anything. The Cloudflare Pages build command stays `bash scripts/pages-prebuild.sh && npm run build`.

Three Cloudflare Workers, same-origin under `/api/`:

- **`mattdoes-listening`** — `/api/listening/now` and `/api/listening/recent`. A Durable Object polls Last.fm and writes KV. The request path only reads KV.
- **`mattdoes-geo`** — reverse-geocodes a visitor's city only if they opt in. The default map is `static/home.geojson`.
- **`mattdoes-csp-report`** — collects CSP reports.

They share `workers/lib/transport.js`. Editing that file means redeploying all three.

`mattdoes-rebuild` has no route. Every six hours it POSTs the Pages deploy hook so the Letterboxd snapshot baked by `lib/watches.js` stays current. The hook URL is the `DEPLOY_HOOK` secret, set outside the repo.

## running it

```
npm install
npm run build
```

Output lands in `dist/`. With no markdown notes under `content/`, the other pages still build and the command does not error.

```
npm test
npm run lint             # html-validate against dist/**/*.html
npm run audit            # npm audit --audit-level=moderate
npm run bake-geo         # re-bake static/home.geojson
npm run optimize-media   # .webp variants from content/attachments, if that directory exists
npm run sync-media       # push those files to R2 (needs a CF token; uses the wrangler pin in workers/)
```

CI (`.github/workflows/build.yml`) audits, builds the in-repo content, lints HTML, and runs tests. Cloudflare Pages deploys from a successful GitHub push on its own.

## workers

KV bindings, routes, and secret names live in each `wrangler.toml`. From the repo root:

```
npm run deploy:workers
```

Listening secrets are `LASTFM_USERNAME` and `LASTFM_API_KEY`. From `workers/listening`, after `npm ci --prefix workers`: `node ../node_modules/wrangler/bin/wrangler.js secret put LASTFM_API_KEY`.
