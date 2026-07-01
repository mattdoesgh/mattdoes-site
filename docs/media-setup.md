# Media setup — R2 + media.mattdoes.online

Embeds in notes use Obsidian's `![[file.ext]]` syntax. At build time that gets
rewritten to `https://media.mattdoes.online/<file>`. This doc covers the
one-time Cloudflare provisioning, the API token, the local dev flow, and the
authoring round-trip. (Merged from the old `phase-4-media.md` and
`r2-setup-steps.md`.)

## 1 · Create the R2 bucket

1. Cloudflare dashboard → **R2** → **Create bucket**.
2. Name: `mattdoes-media`. Location: **Automatic**. Storage class: **Standard**.
3. Public access **off** — we expose it via the custom domain, which is a
   cleaner path than the `pub-*.r2.dev` subdomain and keeps the bucket
   bindable from Workers later if we ever need it.

## 2 · Connect `media.mattdoes.online`

1. Open the bucket → **Settings** → **Custom Domains** → **Connect Domain**.
2. Enter `media.mattdoes.online`. Cloudflare creates the CNAME automatically
   because the apex (`mattdoes.online`) is already on Cloudflare.
3. Wait for status **Active** (usually <1 min). Verify:
   `curl -I https://media.mattdoes.online/anything` — a 404 from the R2 edge
   means the binding is live (nothing is uploaded yet).

## 3 · API token for the sync script

Scope it to just R2 on the `mattdoes-media` bucket — do not reuse the broader
workers-deploy token.

1. Dashboard → **Manage Account** → **API Tokens** → **Create Token**.
2. Template: **Custom token**.
3. Permissions: `Account` · `Workers R2 Storage` · **Edit**.
4. Account Resources: include the account that owns the bucket.
5. Client IP Filtering / TTL: leave defaults.
6. **Create Token** and copy it immediately — you cannot view it again.
7. Grab the **Account ID** from the sidebar on any account page.

## 4 · Local env

Create `.env` in the repo root (gitignored — never committed):

```
CLOUDFLARE_API_TOKEN=…token from step 3…
CLOUDFLARE_ACCOUNT_ID=…account id…
MEDIA_BASE=https://media.mattdoes.online
```

`npm run sync-media` reads it automatically (`node --env-file-if-exists=.env`).
Sanity-check: `npm run sync-media` runs without auth errors (may be a no-op
first time). Pages builds don't read this file — they use the env vars below.

## 5 · Cloudflare Pages env vars

Project → **Settings** → **Environment variables** → **Production**:

| Name                    | Value                            | Encrypted |
| ----------------------- | -------------------------------- | --------- |
| `VAULT_TOKEN`           | (already set — private vault)    | yes       |
| `CLOUDFLARE_API_TOKEN`  | token from step 3                | yes       |
| `CLOUDFLARE_ACCOUNT_ID` | account id                       | no        |
| `MEDIA_BASE`            | `https://media.mattdoes.online`  | no        |

## 6 · Build command

Pages → **Settings** → **Builds & deployments** → **Build command**:

```
bash scripts/pages-prebuild.sh && npm run build
```

`pages-prebuild.sh` clones the vault, then runs `optimize-media` and
`sync-media` before the build. On local dev without the R2 token, both
scripts no-op and `build.js` falls back to serving `vault/attachments/`
out of `dist/img/`.

## 7 · Authoring flow + verification

1. Drop a file into `vault/attachments/`.
2. Reference it with `![[filename.jpg]]` in any note.
3. `npm run build` locally to preview — the `<picture>` element resolves to
   `/img/filename.jpg` (+ a `.webp` sibling if optimization ran).
4. Commit to the vault repo → Pages build fires → `sync-media` uploads the
   file + variants to R2 (check the build log).
5. `https://media.mattdoes.online/filename.jpg` returns 200; the rendered
   post serves from the `media.` host with `.webp` where supported.

## Notes

- **Original + webp.** sharp emits a sibling `.webp` for every raster image
  (`.png` / `.jpg` / `.jpeg`). Responsive widths (`srcset` with multiple
  sizes) aren't generated yet — a cheap follow-up once real content load
  justifies it.
- **Cache headers.** R2 custom domains serve with Cloudflare's default cache
  rules. If files start being overwritten in-place, set up a Cache Rule on
  `media.mattdoes.online` — for now every file is effectively immutable
  (new files land under new names).
- **Manifest.** `media-manifest.json` lives under the site repo's `.cache/`
  (gitignored). It maps attachment path → sha256 → uploaded variants, so
  only changed files hit the R2 API on each build.
