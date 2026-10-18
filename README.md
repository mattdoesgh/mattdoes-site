# mattdoes.online

Source for [mattdoes.online](https://mattdoes.online). Static HTML from a private Obsidian vault, plus in-repo digs and a build-time Letterboxd snapshot. Hosted on Cloudflare Pages. Live listening and geo sit on same-origin Workers.

## what's on it

- **home** — name, a short bio, and shelves for listening, digs, movies, and grok says.
- **listening** (`/listening/`) — recent plays from Last.fm, baked at build time and refreshed live.
- **digs** (`/digs/`) — weekly music picks in `content/digs/`. Favorites also show on **grok says…** (`/grok/`), with anything else in `content/recommendations.json`.
- **movies** (`/movies/`) — the last 25 Letterboxd watches, from the diary RSS at build time.
- **search** — client-side filter over a static index.
- **about** and **colophon** — from the vault note with `publish: about`, and a generated colophon.
- **X** — `@mattdoes` in the topbar links to [x.com/mattdoes](https://x.com/mattdoes). Letterboxd sits beside it, the same chip, to [letterboxd.com/mattdoes](https://letterboxd.com/mattdoes).

Journal, making, and thoughts notes are still accepted so an older vault builds. They are not published.

## how it's built

`scripts/pages-prebuild.sh` clones the vault into `./vault/` on Cloudflare Pages. `build.js` reads that vault, fetches listening data (disk-cached under `.cache/`), and writes `dist/`. Pages are React components rendered to static HTML (`design-system/`). The browser gets plain HTML plus small scripts. `/listening/` rows are rendered by `templates/rows.js` so live updates can swap the same markup.

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

Output lands in `dist/`. Without `vault/` the build is empty and does not error.

```
npm test
npm run lint             # html-validate against dist/**/*.html
npm run audit            # npm audit --audit-level=moderate
npm run bake-geo         # re-bake static/home.geojson
npm run optimize-media   # .webp variants under .cache/media-build/
npm run sync-media       # push originals + variants to R2 (needs a CF token)
```

CI (`.github/workflows/build.yml`) audits, builds the fixture vault, lints HTML, and runs tests. Cloudflare Pages deploys from a successful GitHub push on its own.

## workers

KV bindings, routes, and secret names live in each `wrangler.toml`. From the repo root:

```
npm run deploy:workers
```

Listening secrets are `LASTFM_USERNAME` and `LASTFM_API_KEY`. From `workers/listening`, after `npm ci --prefix workers`: `node ../node_modules/wrangler/bin/wrangler.js secret put LASTFM_API_KEY`.
