# AGENTS

See `README.md` and `CONTEXT.md` for the full architecture. This file captures only
cloud-agent-specific operating notes.

## Cursor Cloud specific instructions

This is a Node.js static-site generator (no database, no long-running backend). The
product is the static site in `dist/`; two Cloudflare Workers under `workers/` are
optional and only power live `/api/` features. Node 22 is required (`.nvmrc`,
`engines: node >=20`).

Non-obvious caveats:

- **`npm install` cascades.** The root `postinstall` runs `npm --prefix design-system ci`,
  and the `prebuild` step builds the design-system SSG bundle before `build`. The
  `workers/listening` and `workers/geo` packages have their own `package-lock.json`
  and are NOT installed by the root install — install them separately if you need them.
- **An empty build is expected.** The content vault (`mattdoes-vault`) is a private repo
  that is not present here. Running `npm run build` with no `vault/` produces a valid but
  empty `dist/` (0 notes) and does NOT error. To build a site with real content for
  testing/demo, point at the committed fixture:
  `VAULT_DIR=test/fixture-vault SITE_URL=https://mattdoes.online npm run build`.
- **`npm test`** auto-builds the SSG bundle and runs `build.js` against
  `test/fixture-vault` (the `pretest` hook) before `node --test`. So a bare `npm test`
  also leaves a content-filled `dist/`.
- The `Invalid DOM property `datetime`` line printed during build is a pre-existing,
  harmless React SSR warning, not a failure.
- **Serving:** there is no dev server; the build is one-shot. Serve the output with any
  static server, e.g. `npx serve dist -l 3000`.
- The Cloudflare Workers require `wrangler dev`, KV namespaces, and (for listening)
  Last.fm secrets; they are not needed to build or view the core site.
