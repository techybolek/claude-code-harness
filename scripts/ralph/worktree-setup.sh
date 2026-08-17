#!/bin/bash
#
# worktree-setup.sh - Provision an isolated git worktree for a task
# ==================================================================
#
# Extracted from ralph.sh so any harness (ralph.sh, ralph-pipeline.sh, or a
# manual run) provisions worktrees the same way:
#   1. Create the worktree on branch ralph/<task-dir> (idempotent)
#   2. Propagate machine-local state: skip-worktree files (generic) + a
#      per-project hook for everything else (env files, secrets, auth state —
#      all project-specific policy; hooks carry a gitignore guard the old
#      generic .env copy never had)
#
# Usage:
#   worktree-setup.sh <project_root> <task_dir>
#
# Prints ONLY the worktree path on stdout; all logging goes to stderr.
# Idempotent — safe to re-run on an existing worktree.

set -e

# Shared logging and worktree helpers
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

PROJECT_ROOT="${1:-}"
TASK_DIR="${2:-}"

if [ -z "$PROJECT_ROOT" ] || [ -z "$TASK_DIR" ]; then
    echo "Usage: worktree-setup.sh <project_root> <task_dir>" >&2
    exit 1
fi

WORKTREES_DIR="$PROJECT_ROOT/worktrees"
BRANCH_NAME="ralph/${TASK_DIR}"
WORKTREE_PATH="$WORKTREES_DIR/${TASK_DIR}"

# Detect and clear a stale registration (registered, but no valid checkout on disk).
prune_stale_worktree() {
    if git -C "$PROJECT_ROOT" worktree list | grep -q "$WORKTREE_PATH" && [ ! -f "$WORKTREE_PATH/.git" ]; then
        log_info "Stale worktree registration at $WORKTREE_PATH — pruning and removing leftovers"
        rm -rf "$WORKTREE_PATH"
        git -C "$PROJECT_ROOT" worktree prune >&2
    fi
}

create_worktree() {
    mkdir -p "$WORKTREES_DIR"
    prune_stale_worktree

    if worktree_exists "$PROJECT_ROOT" "$WORKTREE_PATH"; then
        log_info "Worktree already exists at $WORKTREE_PATH"
        return 0
    fi

    if git -C "$PROJECT_ROOT" show-ref --verify --quiet "refs/heads/$BRANCH_NAME"; then
        log_info "Branch $BRANCH_NAME exists, creating worktree..."
        git -C "$PROJECT_ROOT" worktree add "$WORKTREE_PATH" "$BRANCH_NAME" >&2
    else
        log_info "Creating new branch $BRANCH_NAME with worktree..."
        git -C "$PROJECT_ROOT" worktree add -b "$BRANCH_NAME" "$WORKTREE_PATH" >&2
    fi
}

# Propagate machine-local state a fresh checkout lacks:
# 1. skip-worktree files (self-enumerating via git ls-files -v) — local edits git
#    deliberately hides, e.g. a dev-only auth bypass; a worktree gets the pristine
#    version and silently diverges from the working local setup.
# 2. a per-project hook in ~/.claude/scripts/ralph/worktree-hooks/<path-slug>.sh
#    for gitignored runtime files (nested .env, captured auth state, …) that no
#    generic rule can enumerate. Harness-neutral args: <project_root> <worktree_path>.
setup_worktree_local_state() {
    git -C "$PROJECT_ROOT" ls-files -v | awk '/^S /{ $1=""; sub(/^ /,""); print }' | while IFS= read -r f; do
        if [ -f "$PROJECT_ROOT/$f" ]; then
            mkdir -p "$WORKTREE_PATH/$(dirname "$f")"
            cp "$PROJECT_ROOT/$f" "$WORKTREE_PATH/$f"
            # Carry the skip-worktree bit too — it is per-checkout; without it the
            # copy shows as modified in the worktree and an agent could commit it.
            git -C "$WORKTREE_PATH" update-index --skip-worktree "$f"
            log_info "Propagated skip-worktree file: $f"
        fi
    done

    local hook="$HOME/.claude/scripts/ralph/worktree-hooks/$(echo "$PROJECT_ROOT" | tr / -).sh"
    if [ -x "$hook" ]; then
        log_info "Running worktree hook: $hook"
        "$hook" "$PROJECT_ROOT" "$WORKTREE_PATH" || log_error "Worktree hook failed (continuing)"
    fi
}

# Post-provision health check — fresh worktrees have repeatedly started broken
# (0001: `Cannot find module 'chai'` ×4 because mocha ran before npm ci; 0002
# session 1 had to rediscover `npm ci --legacy-peer-deps`). Findings go to
# stderr for the human AND to .runs/worktree-health.txt so the agent prompt can
# carry them (ralph.sh includes the file when non-empty).
health_check() {
    local report="$WORKTREE_PATH/.runs/worktree-health.txt"
    mkdir -p "$WORKTREE_PATH/.runs"
    : > "$report"

    # Every package.json (outside node_modules) without a sibling node_modules
    # means tests/builds in that dir will fail until npm ci runs there.
    while IFS= read -r pkg; do
        local dir rel
        dir=$(dirname "$pkg")
        rel="${dir#$WORKTREE_PATH}"; rel="${rel#/}"; [ -z "$rel" ] && rel="."
        if [ ! -e "$dir/node_modules" ]; then
            echo "MISSING node_modules in '$rel' — run npm ci there before any test/build (a peer-dep conflict may require the project's documented flags, e.g. --legacy-peer-deps)" >> "$report"
        fi
    done < <(find "$WORKTREE_PATH" -maxdepth 3 -name package.json -not -path '*/node_modules/*' 2>/dev/null)

    if [ -s "$report" ]; then
        log_error "Worktree health check warnings:"
        sed 's/^/  /' "$report" >&2
    else
        rm -f "$report"
        log_info "Worktree health check passed"
    fi
}

create_worktree
setup_worktree_local_state
health_check

echo "$WORKTREE_PATH"
