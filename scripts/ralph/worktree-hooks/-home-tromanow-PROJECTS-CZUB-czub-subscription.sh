#!/bin/bash
# Worktree local-state hook for ~/PROJECTS/CZUB/czub-subscription.
# Invoked by worktree-setup.sh as: <this-script> <project_root> <worktree_path>
# Gitignored runtime files a fresh checkout lacks. (.env.local.example is
# tracked in git, so the worktree already has it.)
set -euo pipefail
ROOT="$1"
WT="$2"

cp "$ROOT/.env.local" "$WT/.env.local"

# Guard: everything this hook placed must be ignored in the worktree,
# else a .gitignore change could make a secret committable.
for f in .env.local; do
    git -C "$WT" check-ignore -q "$f" || { echo "ERROR: $f is not gitignored in worktree — refusing to leave it" >&2; rm -f "$WT/$f"; exit 1; }
done
