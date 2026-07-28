#!/bin/bash
# Worktree local-state hook for ~/PROJECTS/TP/TPV2.
# Invoked by ralph.sh setup_worktree_local_state (or any harness) as:
#   <this-script> <project_root> <worktree_path>
# Gitignored runtime files a fresh checkout lacks. Skip-worktree files
# (securityAdfsController.js) are propagated generically — not listed here.
set -euo pipefail
ROOT="$1"
WT="$2"

# Backend secrets (nested — ralph's top-level copy_env_files misses it).
cp "$ROOT/backend/.env" "$WT/backend/.env"

# Captured ADFS admin session for E2E: symlink, not copy — it expires ~hourly
# and `just e2e-auth` recaptures it in the root checkout; a symlink always
# sees the latest capture.
mkdir -p "$WT/frontend/e2e/.auth"
ln -sf "$ROOT/frontend/e2e/.auth/admin-state.json" "$WT/frontend/e2e/.auth/admin-state.json"

# Guard: everything this hook placed must be ignored in the worktree,
# else a .gitignore change could make a secret committable.
for f in backend/.env frontend/e2e/.auth/admin-state.json; do
    git -C "$WT" check-ignore -q "$f" || { echo "ERROR: $f is not gitignored in worktree — refusing to leave it" >&2; rm -f "$WT/$f"; exit 1; }
done
