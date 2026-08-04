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

# app_tp.js checkDirectories() throws at boot unless config's staticContentDir /
# assetsDir / fraudWasteAbuseDir all exist. Paths are relative to cwd=backend/,
# so '../tmp/fwa' is <worktree>/tmp/fwa. COR3Uploads/ and COR3Assets/ are
# tracked and arrive with the checkout; only tmp/fwa is gitignored.
mkdir -p "$WT/tmp/fwa"

# node_modules: symlink to the root checkout instead of a ~4-minute npm ci per
# worktree. Only safe while the lockfiles agree — if they diverge, leave it
# absent so the agent installs for real rather than building against wrong deps.
for proj in backend frontend; do
    if [[ -d "$ROOT/$proj/node_modules" ]] \
       && cmp -s "$ROOT/$proj/package-lock.json" "$WT/$proj/package-lock.json"; then
        ln -sfn "$ROOT/$proj/node_modules" "$WT/$proj/node_modules"
    else
        echo "WARN: $proj/node_modules not linked (lockfile differs or root deps missing) — run npm ci in the worktree" >&2
    fi
done
# NOTE: backend/config.js needs nothing — it is TRACKED, and the committed
# content already equals tp/configurations/local/config_local_current.js, so a
# fresh checkout is already correct. Copying it risks dirtying the worktree and
# breaking ralph's clean-tree all_done guard.

# Guard: everything this hook placed must be ignored in the worktree,
# else a .gitignore change could make a secret committable.
for f in backend/.env frontend/e2e/.auth/admin-state.json tmp/fwa \
         backend/node_modules frontend/node_modules; do
    [[ -e "$WT/$f" || -L "$WT/$f" ]] || continue
    git -C "$WT" check-ignore -q "$f" || { echo "ERROR: $f is not gitignored in worktree — refusing to leave it" >&2; rm -rf "$WT/$f"; exit 1; }
done
