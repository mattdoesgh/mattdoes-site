#!/usr/bin/env bash
# pages-prebuild.sh — runs before `npm run build` on Cloudflare Pages.
#
# Authored pages live in this repo under content/ (content/about.md is the
# about note). Nothing is cloned and no token is required.
#
# Pages build command:
#   bash scripts/pages-prebuild.sh && npm run build
#
# Design-system deps are installed by the root postinstall when Pages runs
# `npm ci`, before this script. Media optimize/sync is not part of the Pages
# build: nothing under content/ embeds an attachment. `npm run optimize-media`
# and `npm run sync-media` still read content/attachments when that directory
# exists, and sync-media still refuses any wrangler other than the version
# pinned in workers/package-lock.json.

set -euo pipefail

echo "→ in-repo content (content/); no vault clone."
