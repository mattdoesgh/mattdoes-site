# Phase 4 — Media (R2 + media.mattdoes.online)

Embeds in notes use Obsidian's `![[file.ext]]` syntax. At build time that gets
rewritten to `https://media.mattdoes.online/<file>`. This doc covers the
one-time Cloudflare provisioning, the API token, and the local dev flow.

## 1 · Create the R2 bucket

1. Cloudflare dashboard → **R2** → **Create bucket**.
2. Name: `mattdoes-media`. Location: Automatic. Storage class: Standard.
3. Leave public access **off**. We'll expose it via the custom domain, which
   is a cleaner path than the `pub-*.r2.dev` subdomain and keeps the bucket
   bindable from Workers later if we ever need it.

## 2 · Bind `media.mattdoes.online`

1. Open the bucket → **Settings** → **Custom Domains** → **Connect Domain**.
2. Enter `media.mattdoes.online`. Cloudflare creates the CNAME automatically
   because the apex (`mattdoes.online`) is already on Cloudflare.
3. Wait for the status to flip to **Active** (usually <1 min). Hit the URL
   with any path — a 404 from Cloudflare's R2 edge confirms the binding
   worked (you haven't uploaded anything yet).

## 3 · API token for the sync script

Scope it to just R2 on the `mattdoes-media` bucket — do not reuse the broader
workers-deploy token.

1. Cloudflare dashboard → **Manage Account** → **API Tokens** → **Create Token**.
2. Template: **Custom token**.
3. Permissions:
   - `Account` · `Workers R2 Storage` · **Edit**
4. Account Resources: include the account that owns the bucket.
5. Client IP Filtering / TTL: leave defaults unless you have a reason.
6. Create → copy the token once.

Also grab the **Account ID** from the right-hand sidebar on any Cloudflare
account page.

## 4 · Local env

Add to `~/.mattdoes.env` (or wherever you keep secrets):

```
export CLOUDFLARE_API_TOKEN="…token from step 3…"
export CLOUDFLARE_ACCOUNT_ID="…account id…"
export MEDIA_BASE="https://media.mattdoes.online"
```

Source that file before running `npm run sync-media`.

## 5 · Cloudflare Pages env vars

Project → **Settings** → **Environment variables** → **Production**:

| Name                   | Value                           |
| ---------------------- | ------------------------------- |
| `VAULT_TOKEN`          | (already set — private vault)   |
| `CLOUDFLARE_API_TOKEN` | token from step 3               |
| `CLOUDFLARE_ACCOUNT_ID`| account id                      |
| `MEDIA_BASE`           | `https://media.mattdoes.online` |

Mark `CLOUDFLARE_API_TOKEN` and `VAULT_TOKEN` as **Encrypted**.

## 6 · Build command

Pages → **Settings** → **Builds & deployments** → **Build command**:

```
bash scripts/pages-prebuild.sh && npm run build
```

`pages-prebuild.sh` clones the vault, then runs `optimize-media` and
`sync-media` before the build. On local dev without the R2 token, both
scripts no-op and `build.js` falls back to serving `vault/attachments/`
out of `dist/img/`.

## 7 · Authoring flow

1. Drop a file into `vault/attachments/`.
2. Reference it with `![[filename.jpg]]` in any note.
3. Run `npm run build` locally to preview — the `<picture>` element will
   resolve to `/img/filename.jpg` (+ a `.webp` sibling if optimization ran).
4. Commit to the vault repo → Pages build fires → sync-media uploads
   the file + variants to R2 → production page serves
   `https://media.mattdoes.online/filename.jpg`.

## Notes

- **Original + webp.** For v1, sharp emits a sibling `.webp` for every
  raster image (`.png` / `.jpg` / `.jpeg`). Responsive widths (`srcset` with
  multiple sizes) aren't generated yet — that's a cheap follow-up once
  there's real content load to justify it.
- **Cache headers.** R2 custom domains serve with Cloudflare's default cache
  rules. If we start overwriting files in-place, set up a Cache Rule on
  `media.mattdoes.online` — but for now every file is effectively immutable
  (new files land under new names).
- **Manifest.** `.media-manifest.json` lives in the site repo's
  `.cache/` (gitignored). It maps attachment path → sha256 → uploaded
  variants, so only changed files hit the R2 API on each build.
