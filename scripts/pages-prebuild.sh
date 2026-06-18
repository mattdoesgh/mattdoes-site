#!/usr/bin/env bash
# pages-prebuild.sh — runs before `npm run build` on Cloudflare Pages.
# Clones the private vault directly into ./vault using VAULT_TOKEN (a
# fine-grained GitHub PAT with Contents:Read on mattdoesgh/mattdoes-vault).
#
# Why not a git submodule? Cloudflare Pages' GitHub App auth does not
# propagate to submodule clones, so the submodule step fails with 403.
# A direct clone using our own PAT sidesteps that limitation entirely.
#
# Local use: optional. Devs can either set VAULT_TOKEN and run this script,
#            or just `git clone ...mattdoes-vault.git vault` themselves.
#            The script is a no-op if vault/ already has content.
# Pages use: set VAULT_TOKEN in project env vars, then set build command to
#            `bash scripts/pages-prebuild.sh && npm run build`.

set -euo pipefail

# Repo URL is hardcoded — letting it be env-overridable would mean a
# compromised CF Pages env var could redirect the clone (and the PAT
# along with it) to an attacker-controlled mirror. Branch + dir stay
# overridable for legitimate dev use, with validation before they reach git.
VAULT_REPO="github.com/mattdoesgh/mattdoes-vault.git"
VAULT_BRANCH="${VAULT_BRANCH:-main}"
VAULT_DIR="${VAULT_DIR:-vault}"

# If vault/ is already populated (local dev, or a previous prebuild on a
# warm Pages cache), skip the clone.
if [[ -d "$VAULT_DIR" ]] && [[ -n "$(ls -A "$VAULT_DIR" 2>/dev/null)" ]]; then
  echo "→ $VAULT_DIR/ already populated — skipping clone."
  if [[ -d "$VAULT_DIR/.git" ]]; then
    echo "✓ vault/ present ($(git -C "$VAULT_DIR" rev-parse --short HEAD 2>/dev/null || echo 'no-git'))"
  fi
  exit 0
fi

if [[ -z "${VAULT_TOKEN:-}" ]]; then
  echo "✗ VAULT_TOKEN is not set — cannot clone private vault."
  echo "  Set it in Cloudflare Pages → Settings → Environment variables,"
  echo "  or export it locally before running this script."
  exit 1
fi

if [[ ! "$VAULT_BRANCH" =~ ^[A-Za-z0-9._/-]+$ ]] || [[ "$VAULT_BRANCH" == -* ]] || [[ "$VAULT_BRANCH" == *..* ]]; then
  echo "✗ VAULT_BRANCH contains unsupported characters."
  exit 1
fi

echo "→ Cloning vault from $VAULT_REPO (branch $VAULT_BRANCH)…"
# Avoid embedding the PAT in the clone URL, which can leak through process
# listings and verbose git output. Git invokes this temporary askpass helper
# only when GitHub challenges for credentials.
ASKPASS="$(mktemp)"
cleanup() { rm -f "$ASKPASS"; }
trap cleanup EXIT
chmod 700 "$ASKPASS"
cat > "$ASKPASS" <<'EOF'
#!/usr/bin/env bash
case "$1" in
  *Username*) printf '%s\n' 'x-access-token' ;;
  *)          printf '%s\n' "${VAULT_TOKEN:?}" ;;
esac
EOF

GIT_TERMINAL_PROMPT=0 GIT_ASKPASS="$ASKPASS" git clone \
  --depth 1 \
  --branch "$VAULT_BRANCH" \
  "https://${VAULT_REPO}" \
  "$VAULT_DIR"

# Sanity check: vault should now exist and be non-empty.
if [[ ! -d "$VAULT_DIR" ]] || [[ -z "$(ls -A "$VAULT_DIR" 2>/dev/null)" ]]; then
  echo "✗ $VAULT_DIR/ is empty after clone — token may lack Contents:Read on mattdoes-vault."
  exit 1
fi

echo "✓ vault/ checked out ($(git -C "$VAULT_DIR" rev-parse --short HEAD))"

# Note: design-system deps (react/react-dom + the build toolchain) are installed
# by the root `postinstall` hook when Pages runs `npm ci`, so they're present
# before the build command's `prebuild` step builds the SSG bundle. Nothing to do
# here — and doing it here would be skipped on a warm vault cache (early-exit
# above) anyway.

# Media pipeline: generate optimized variants, then push originals + variants
# to R2. Both steps no-op gracefully if their prereqs (sharp, R2 token) are
# absent — build.js falls back to serving attachments out of dist/img/.
if [[ -f package.json ]]; then
  echo "→ Optimizing media…"
  npm run --silent optimize-media || echo "  (optimize-media reported an error — continuing)"

  if [[ -n "${CLOUDFLARE_API_TOKEN:-}" ]] && [[ -n "${CLOUDFLARE_ACCOUNT_ID:-}" ]]; then
    echo "→ Syncing media to R2…"
    npm run --silent sync-media || echo "  (sync-media reported an error — continuing; originals may be stale on R2)"
  else
    echo "  (skip sync-media: CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID not set)"
  fi
fi
