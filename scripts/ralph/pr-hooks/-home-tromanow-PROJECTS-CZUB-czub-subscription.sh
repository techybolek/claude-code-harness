#!/bin/bash
# PR hook for ~/PROJECTS/CZUB/czub-subscription (GitHub).
# Invoked by /ralph:ship as: <this-script> <worktree> <branch> <base> <title> <body_file> <spec>
# Pushes the branch and opens a PR into <base>; prints only the PR URL on stdout.
# Idempotent: an open PR for the branch is reported, not duplicated.
set -euo pipefail
WT="$1"; BRANCH="$2"; BASE="$3"; TITLE="$4"; BODY="$5"
cd "$WT"

git push -u origin "$BRANCH" >&2

URL=$(gh pr list --head "$BRANCH" --state open --json url -q '.[0].url')
[ -n "$URL" ] || URL=$(gh pr create --head "$BRANCH" --base "$BASE" --title "$TITLE" --body-file "$BODY")
echo "$URL"
