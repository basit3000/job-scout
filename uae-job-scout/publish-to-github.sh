#!/usr/bin/env bash
# Turn this folder into a GitHub repo under your account and push.
#
# Prerequisites: GitHub CLI logged in as YOU (not a limited CI token)
#   gh auth login
#
# Usage:
#   ./publish-to-github.sh                 # creates basit3000/uae-job-scout (public)
#   ./publish-to-github.sh myuser my-repo  # custom owner/name

set -euo pipefail
cd "$(dirname "$0")"

OWNER="${1:-basit3000}"
NAME="${2:-uae-job-scout}"
FULL="$OWNER/$NAME"

if ! command -v gh >/dev/null; then
  echo "Install GitHub CLI: https://cli.github.com/" >&2
  exit 1
fi

if gh repo view "$FULL" >/dev/null 2>&1; then
  echo "Repo $FULL already exists — adding remote and pushing…"
  git remote remove origin 2>/dev/null || true
  git remote add origin "https://github.com/$FULL.git"
  git push -u origin main
else
  echo "Creating public repo $FULL and pushing…"
  gh repo create "$FULL" --public --source=. --remote=origin --push \
    --description "Portable UAE-only job scout for any profession (Apify + JobSpy)"
fi

echo
echo "Done: https://github.com/$FULL"
echo "Friend setup: clone that URL, then cp profile.example.json profile.json"
