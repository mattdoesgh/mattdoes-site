# mattdoes.online

source for [mattdoes.online](https://mattdoes.online) — my personal site. i write here, think out loud here, and log what i'm listening to here.

## what's on it

- **home** — a summary, recent thoughts, recent listening.
- **blog** — long-form and short, on one reverse-chronological timeline. three kinds:
  - *journal* — reflective posts, usually weighing a tradeoff
  - *making* — building-in-public notes on projects, tools, and stack choices
  - *thoughts* — short, one-idea posts, time-stamped through the day
- **listening** — recent plays pulled from Last.fm at build time and refreshed live between deploys.
- **about** — who I am, what I work on.
- **colophon** — how the whole thing fits together.

## how it's built

static HTML generated from an Obsidian vault (`mattdoes-vault`, private repo). a pre-build script (`scripts/pages-prebuild.sh`) clones the vault into `./vault/` with a fine-grained PAT. no framework, no templating engine, no CMS. hosted on Cloudflare Pages.

the generator, in three parts:

- **`build.js`** — the entrypoint. reads the vault, fetches Last.fm listening data (disk-cached under `.cache/`), and hands both to the modules below.
- **`lib/intake.js`** — vault notes → content model. frontmatter parsing (`gray-matter`) and validation, splitting daily notes into thoughts, stable thought IDs, sorting, the slug index. pure: same notes in, same model out.
- **`lib/emit.js`** — content model → `dist/`. markdown via `marked` (shiki for code highlighting), wikilink + embed resolution, page templates from `templates/`, CSS through `lightningcss`, JS through `terser`, content-hashed assets, RSS + sitemap.

two thin Cloudflare Workers serve the live bits, both same-origin under `/api/`; the site's CSP stays at `connect-src 'self'`:

- **`mattdoes-listening`** — proxies Last.fm for the topbar's now-playing pill and the live track list on `/listening/`. KV-cached with stale-while-revalidate. decodes Last.fm responses through `lib/lastfm.js`, the same pure codec the build uses.
- **`mattdoes-geo`** — reverse-geocodes a visitor's city against Nominatim *only if* they opt in via the tweaks panel. Default page render uses `static/home.geojson` (Houston), baked once with `npm run bake-geo`. KV-cached for 7 days per metro.

both Workers share their response machinery — JSON + CORS envelope, preflight, error responses with edge-TTL policy, fail-open KV reads — from `workers/lib/transport.js`. caching policy (TTLs, cache-control strings) stays in each Worker.

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
cd workers/listening && npx wrangler deploy
cd workers/geo       && npx wrangler deploy
```

shared code under `workers/lib/` is bundled into every Worker that imports it — editing it means redeploying both. `npm run deploy:workers` from the repo root does that in one go. each Worker has its own README covering KV setup, secrets, and refresh policy.
