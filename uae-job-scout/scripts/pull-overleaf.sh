#!/usr/bin/env bash
# Pull a LaTeX CV from Overleaf into cv/overleaf/ for build-evidence.mjs.
#
# Prerequisites:
#   1. Overleaf project → Menu → Git → clone URL shows a project id
#   2. Overleaf Account Settings → Git Integration → create a token
#
# Usage:
#   export OVERLEAF_GIT_TOKEN=...
#   export OVERLEAF_PROJECT_ID=...
#   ./scripts/pull-overleaf.sh
#
# Works for any Overleaf user — not tied to a specific account beyond the token.

set -euo pipefail
cd "$(dirname "$0")/.."

if [[ -z "${OVERLEAF_GIT_TOKEN:-}" || -z "${OVERLEAF_PROJECT_ID:-}" ]]; then
  echo "Set OVERLEAF_GIT_TOKEN and OVERLEAF_PROJECT_ID first." >&2
  echo "  OVERLEAF_PROJECT_ID is the hex id in the Overleaf git URL." >&2
  exit 1
fi

DEST="cv/overleaf"
URL="https://git:${OVERLEAF_GIT_TOKEN}@git.overleaf.com/${OVERLEAF_PROJECT_ID}"

rm -rf "$DEST"
git clone --depth 1 "$URL" "$DEST"
# Never keep credentials or a nested git history the user might accidentally commit
rm -rf "$DEST/.git"

echo "Pulled Overleaf project into $DEST"
echo "Next: node scripts/build-evidence.mjs"
