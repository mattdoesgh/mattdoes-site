#!/usr/bin/env bash
# pages-prebuild.sh — runs before `npm run build` on Cloudflare Pages.
#
# Pages are rendered from site/verbs.ts. Nothing is cloned and no token is
# required for the HTML build. Poster uploads, inside `npm run build`,
# run when CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID are set. Without
# them, a poster already on the media host is reused.
#
# Pages build command:
#   bash scripts/pages-prebuild.sh && npm run build
#
# Media optimize/sync is not part of the Pages build. `npm run sync-media`
# still refuses any wrangler other than the version pinned in
# workers/package-lock.json.

set -euo pipefail

echo "→ in-repo verbs (site/verbs.ts); no vault clone."
