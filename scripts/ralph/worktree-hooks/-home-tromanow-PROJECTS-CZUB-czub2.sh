#!/bin/bash
# Worktree local-state hook for ~/PROJECTS/CZUB/czub2.
# Invoked by ralph.sh setup_worktree_local_state (or any harness) as:
#   <this-script> <project_root> <worktree_path>
# Covers the gitignored runtime state a fresh checkout lacks. czub2 has no
# skip-worktree files, so nothing is propagated generically.
set -euo pipefail
ROOT="$1"
WT="$2"

# The only gitignored runtime file: root .env.local (Supabase keys, the
# EXTERNAL_TAILOR_API_* service-account creds every integration test needs).
# COPY, not symlink — 0002's task 0.1 repoints EXTERNAL_TAILOR_API_EMAIL/
# _PASSWORD, and a symlink would silently rewrite the root checkout's creds.
# The copy stays worktree-local; apply the change to the root .env.local after
# reviewing the branch.
cp "$ROOT/.env.local" "$WT/.env.local"

# node_modules: symlink to the root checkout instead of a multi-minute
# `npm ci --legacy-peer-deps` per worktree (czub2 has a peer-dep conflict, so a
# bare `npm ci` fails). Only safe while the lockfiles agree — if they diverge,
# leave it absent so the agent installs for real rather than building against
# wrong deps. poc-integration has no node_modules in the root checkout either,
# so it is normally skipped; the health report's warning about it is expected.
for proj in . poc-integration; do
    if [[ -d "$ROOT/$proj/node_modules" ]] \
       && cmp -s "$ROOT/$proj/package-lock.json" "$WT/$proj/package-lock.json"; then
        ln -sfn "$ROOT/$proj/node_modules" "$WT/$proj/node_modules"
    else
        echo "WARN: $proj/node_modules not linked (lockfile differs or root deps missing) — run 'npm ci --legacy-peer-deps' in the worktree" >&2
    fi
done

# Guard: everything this hook placed must be ignored in the worktree, else a
# .gitignore change could make a secret committable — or an untracked
# node_modules could dirty the tree and break ralph's clean-tree all_done guard.
# Runs after placement on purpose: poc-integration/.gitignore matches
# `node_modules/` with a trailing slash, which check-ignore only resolves once
# the path exists.
for f in .env.local node_modules poc-integration/node_modules; do
    [[ -e "$WT/$f" || -L "$WT/$f" ]] || continue
    git -C "$WT" check-ignore -q "$f" || { echo "ERROR: $f is not gitignored in worktree — refusing to leave it" >&2; rm -rf "$WT/$f"; exit 1; }
done
