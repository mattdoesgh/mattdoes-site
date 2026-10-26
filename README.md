# mattdoes.online

[matt does online](https://mattdoes.online). Static pages from `site/verbs.ts`, on Cloudflare Pages, with same-origin Workers under `/api/`.

Agents start at [AGENTS.md](AGENTS.md). The generated map is [intel/index.json](intel/index.json).

## run, test, build, deploy

```
npm install
npm test
npm run typecheck
npm run build
npm run deploy:workers
```

`npm run build` writes `dist/`. Pages runs `bash scripts/pages-prebuild.sh && npm run build`. A successful GitHub push deploys. Listening secrets are `LASTFM_USERNAME` and `LASTFM_API_KEY`.

## layout

`build.js` writes `dist/` from `site/`, `lib/`, and `static/`. `concepts/` is copied to `dist/unshared/`. `workers/` holds the Workers. `scripts/` is prebuild, deploy, and media. `test/` is the node tests. `site.config.js` is build settings.

## workers

- `mattdoes-listening` — `/api/listening/now`, `/api/listening/recent`, `/api/listening/charts`
- `mattdoes-geo` — `/api/geo/lookup`. The page does not call it.
- `mattdoes-csp-report` — `/api/csp-report`
- `mattdoes-rebuild` — no route. A six-hour cron POSTs the Pages deploy hook. Listening asks for that rebuild after the Monday 11:00 UTC chart refresh.
