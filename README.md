# mattdoes.online

source for [mattdoes.online](https://mattdoes.online) — my personal site. i write here, think out loud here, and log what i'm listening to here.

## what's on it

- **home** — a quiet front door: one featured piece of writing and a short list of recent work.
- **writing** (`/blog/`) — long-form and short, on one reverse-chronological timeline. three kinds, each also reachable as its own section page (`/journal/`, `/making/`, `/thoughts/`):
  - *journal* — reflective posts, usually weighing a tradeoff
  - *making* — building-in-public notes on projects, tools, and stack choices
  - *thoughts* — short notes grouped with the daily context they came from
- **topic paths** (`/topics/<topic>/`) — durable cross-kind routes connecting journal, making, and notebook entries by idea.
- **listening** — recent plays pulled from Last.fm at build time and refreshed live between deploys.
- **digs** (`/digs/`) — weekly music picks, authored in the repo. favorite digs also show up on **grok says…** (`/grok/`).
- **movies** (`/movies/`) — the last 25 Letterboxd watches, fetched from the diary RSS at build time.
- **search** — client-side filter over a static index of every journal, making, and thoughts post.
- **about** — who I am, what I work on.
- **colophon** — how the whole thing fits together.

## how it's built

static HTML generated from an Obsidian vault (`mattdoes-vault`, private repo). a pre-build script (`scripts/pages-prebuild.sh`) clones the vault into `./vault/` with a fine-grained PAT. every page is a React component rendered to static HTML at build time — no CMS, and no client-side framework beyond a small React island for the timeline controls. hosted on Cloudflare Pages.

how to add a digs week, or anything else on grok says…, is in [`docs/recommendations.md`](docs/recommendations.md).

the generator, in three parts:

- **`build.js`** — the entrypoint. reads the vault, fetches Last.fm listening data (disk-cached under `.cache/`), and hands both to the modules below.
- **`lib/intake.js`** — vault notes → content model. frontmatter parsing (`yaml`) and validation, splitting daily notes into thoughts, stable thought IDs, sorting, the slug index. pure: same notes in, same model out.
- **`lib/emit/`** — content model → `dist/`. markdown via `marked` (shiki for code highlighting, emitted as build-time CSS classes via `lib/shiki-csp.js` so `style-src` stays strict), the inline `<head>` scripts (importmap + speculation rules) admitted under the strict CSP by a per-build `sha256` (`injectInlineScriptCsp`) so `script-src` needs no `'unsafe-inline'`, wikilink + embed resolution, pages rendered by the React design system (`design-system/`), editorial-home/notebook/topic projections, a static search index (`search-index.json`, queried by `static/search.js`), build-time Open Graph card PNGs (`lib/og-image.js`, rasterized with `sharp`, under `/og/`), CSS through `lightningcss`, JS through `terser`, content-hashed assets, RSS + sitemap.

the presentation layer is a React + TypeScript module library in `design-system/` (`@mattdoes/ds`). every public page (home, writing archive, notebook, Topic paths, listings, article, about, colophon) renders there to a static HTML string via `renderToStaticMarkup` — the shipped pages are plain static HTML. the one runtime-React exception is the filter/density island on exhaustive archive timelines; the editorial homepage, Notebook, and Topic paths need no client rendering. the same library is the design source synced to Claude Design (claude.ai/design) for visual editing. `design-system/` builds first (`npm run build:ssg`, which emits both the render bundle and client island, wired in as the `prebuild` step), and its deps install via `postinstall`.

three thin Cloudflare Workers, all same-origin under `/api/`; the site's CSP stays at `connect-src 'self'`. two serve the live bits:

- **`mattdoes-listening`** — powers the topbar's now-playing pill and the live track list on `/listening/`. a single-writer Durable Object (`ListeningPoller`) is the only thing that calls Last.fm: a self-rescheduling ~25s alarm derives both payloads from one `user.getrecenttracks` call and writes them to KV, and a cron watchdog re-arms it if it stalls. the request path is a pure KV reader — it never calls Last.fm and never blocks, so upstream volume stays constant whatever the traffic. both the Worker and the build decode through `lib/lastfm.js`, the same pure codec.
- **`mattdoes-geo`** — reverse-geocodes a visitor's city against Nominatim *only if* they opt in via the tweaks panel. Default page render uses `static/home.geojson` (Houston), baked once with `npm run bake-geo`. KV-cached for 7 days per metro.

and one is a passive sink:

- **`mattdoes-csp-report`** — collects the `report-uri` POSTs from the Report-Only CSP in `static/_headers`, so a tightened directive (most recently `style-src 'self'`) can be validated against real traffic before it's enforced.

all three Workers share their response machinery — JSON + CORS envelope, preflight, error responses with edge-TTL policy, fail-open KV reads — from `workers/lib/transport.js`. caching policy (TTLs, cache-control strings) stays in each Worker.

media flows through R2: `scripts/optimize-media.js` produces `.webp` variants from `vault/attachments/`, `scripts/sync-media.js` PUTs originals + variants to the `mattdoes-media` bucket, and the build emits `<picture>` tags pointed at `media.mattdoes.online`. fonts are self-hosted (JetBrains Mono). contact is a plain `mailto:` to a Fastmail address. no tracker, no analytics, no third-party connect.

## running it

```
npm install
npm run build
```

output lands in `dist/`. serve it however. without `vault/` populated the build is empty but doesn't error.

other useful scripts:

```
npm run lint             # html-validate against dist/**/*.html
npm run audit            # npm audit --audit-level=moderate
npm run bake-geo         # re-bake static/home.geojson from siteConfig.geo.home
npm run optimize-media   # generate .webp variants under .cache/media-build/
npm run sync-media       # push originals + variants to R2 (needs CF token)
```

CI (`.github/workflows/build.yml`) runs the audit job before the build job on every push and PR. Cloudflare Pages deploys independently from a successful GitHub push, so a red CI blocks PR merge but never blocks production. Dependency PRs come in weekly via Dependabot (`.github/dependabot.yml`), grouped minor + patch per ecosystem so most weeks are one PR per package root.

workers live under `workers/` and deploy on their own schedule:

```
cd workers/listening  && npx wrangler deploy
cd workers/geo        && npx wrangler deploy
cd workers/csp-report && npx wrangler deploy
```

shared code under `workers/lib/` is bundled into every Worker that imports it — editing it means redeploying all three. `npm run deploy:workers` from the repo root does that in one go. tooling is shared too: one `workers/package.json` holds the `wrangler` devDep for all three (`npm --prefix workers install` once; `npx` resolves it from any Worker directory). each Worker has its own README covering KV setup, secrets, and refresh policy.
