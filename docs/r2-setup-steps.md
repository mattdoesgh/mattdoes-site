# R2 Storage Setup — Step-by-Step

Provisions the `mattdoes-media` R2 bucket, wires it to `media.mattdoes.online`,
and gets local + Pages builds authenticated to push to it. See
`phase-4-media.md` for context on why these choices were made.

## Step 1 — Create the bucket

1. Cloudflare dashboard → **R2** → **Create bucket**.
2. Name: `mattdoes-media`.
3. Location: **Automatic**. Storage class: **Standard**.
4. Public access: **off** (we expose it via custom domain instead).
5. Click **Create bucket**.

## Step 2 — Connect the custom domain

1. Open the bucket → **Settings** tab → **Custom Domains** → **Connect Domain**.
2. Enter `media.mattdoes.online` and confirm.
3. Wait for status to flip to **Active** (usually under a minute). The CNAME
   is created automatically since the apex is already on Cloudflare.
4. Verify: `curl -I https://media.mattdoes.online/anything` — a 404 from the
   R2 edge means the binding is live.

## Step 3 — Create the R2 API token

1. Dashboard → **Manage Account** → **API Tokens** → **Create Token**.
2. Choose **Custom token**.
3. Permissions: `Account` · `Workers R2 Storage` · **Edit**.
4. Account Resources: include the account that owns `mattdoes-media`.
5. Leave Client IP Filtering and TTL at defaults.
6. **Create Token** and copy it immediately — you cannot view it again.
7. Grab the **Account ID** from the sidebar on any account page.

Do not reuse the broader workers-deploy token. This one is R2-only by design.

## Step 4 — Wire up local env

Create `.env` in the repo root (already gitignored — won't be committed):

```
CLOUDFLARE_API_TOKEN=…token from step 3…
CLOUDFLARE_ACCOUNT_ID=…account id…
MEDIA_BASE=https://media.mattdoes.online
```

Node 20+ reads this natively. Either:

- **Per-command:** `node --env-file=.env scripts/sync-media.js`
- **Or via npm script:** add `"sync-media": "node --env-file=.env scripts/sync-media.js"` to `package.json` so `npm run sync-media` picks it up automatically.

Sanity-check:

```
npm run sync-media   # runs without auth errors (may be a no-op first time)
```

Pages builds don't read this file — they use the env vars from Step 5.

## Step 5 — Add env vars to Cloudflare Pages

Pages project → **Settings** → **Environment variables** → **Production**:

| Name                    | Value                            | Encrypted |
| ----------------------- | -------------------------------- | --------- |
| `CLOUDFLARE_API_TOKEN`  | token from step 3                | yes       |
| `CLOUDFLARE_ACCOUNT_ID` | account id                       | no        |
| `MEDIA_BASE`            | `https://media.mattdoes.online`  | no        |

`VAULT_TOKEN` should already exist from the earlier phase.

## Step 6 — Confirm the build command

Pages → **Settings** → **Builds & deployments** → **Build command**:

```
bash scripts/pages-prebuild.sh && npm run build
```

This is what runs `optimize-media` and `sync-media` before `build.js`. If
you set this up in an earlier phase, just confirm it's still the command.

## Step 7 — End-to-end verification

1. Drop a throwaway image into `vault/attachments/` and commit it to the
   vault repo.
2. Reference it in any note with `![[filename.jpg]]`.
3. Trigger a Pages deploy (push to the site repo, or **Retry deployment**).
4. Build log should show `sync-media` uploading the file.
5. Hit `https://media.mattdoes.online/filename.jpg` — 200 with the image.
6. Load the rendered post on the deployed site — `<picture>` resolves to
   the `media.` host and a `.webp` sibling is served where supported.

Once that round-trip works, R2 setup is done.
