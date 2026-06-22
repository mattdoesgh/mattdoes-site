# mattdoes-csp-report

Same-origin CSP violation collector for the report-only policy in `static/_headers`.

## Route

`POST https://mattdoes.online/api/csp-report`

Browsers send `application/csp-report` or `application/reports+json` bodies when
`Content-Security-Policy-Report-Only` includes
`report-uri https://mattdoes.online/api/csp-report`.

## Setup

```bash
npm ci
npx wrangler deploy
```

Optional KV storage for later review:

```bash
npx wrangler kv namespace create CSP_REPORTS
# uncomment [[kv_namespaces]] in wrangler.toml and paste the id
npx wrangler deploy
```

## Deploy coupling

This Worker imports `workers/lib/transport.js`. Editing shared worker code
means redeploying every Worker — `npm run deploy:workers` from the repo root.
