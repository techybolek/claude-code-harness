#!/bin/bash
#
# lib.sh - Shared helpers for the ralph scripts
# =============================================
# Sourced by ralph.sh, ralph-pipeline.sh and worktree-setup.sh. Everything here
# existed as near-identical copies in those scripts before extraction (and had
# already started drifting apart).
#
# All log output goes to stderr: several callers (worktree-setup.sh's path
# echo, resolve_active_task) reserve stdout for machine-readable results.
# Set LOG_PREFIX to tag a script's messages (e.g. LOG_PREFIX=PIPELINE).

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info()    { echo -e "${BLUE}[${LOG_PREFIX:-INFO}]${NC} $1" >&2; }
log_success() { echo -e "${GREEN}[${LOG_PREFIX:-SUCCESS}]${NC} $1" >&2; }
log_warn()    { echo -e "${YELLOW}[${LOG_PREFIX:-WARN}]${NC} $1" >&2; }
log_error()   { echo -e "${RED}[${LOG_PREFIX:-ERROR}]${NC} $1" >&2; }

# Accept the task as a bare dir name OR a path to a file inside it
# (e.g. SPEC/ACTIVE/0001-x/context.md) — normalize to the dir name.
normalize_task() {
    local t="${1%/}"
    [[ "$t" == */*.md ]] && t="${t%/*}"
    printf '%s\n' "${t##*/}"
}

# Resolve the task to work on. Explicit selection via $RALPH_TASK wins;
# otherwise SPEC/ACTIVE/ must contain exactly ONE NNNN- dir — with several we
# fail loudly instead of silently picking the lowest number.
# Prints the task dir on stdout; on failure logs to stderr, prints nothing and
# returns 1 (callers treat empty as "stop").
resolve_active_task() {
    local project_root="$1" candidates count task
    candidates=$(ls -1 "$project_root/SPEC/ACTIVE/" 2>/dev/null | grep -E '^[0-9]{4}-' | sort)

    if [ -n "${RALPH_TASK:-}" ]; then
        task=$(normalize_task "$RALPH_TASK")
        if echo "$candidates" | grep -qxF "$task"; then
            echo "$task"
            return 0
        fi
        log_error "Task '$task' not found in SPEC/ACTIVE/. Available:"
        echo "$candidates" | sed 's/^/  /' >&2
        return 1
    fi

    count=$(echo -n "$candidates" | grep -c . || true)
    if [ "$count" -eq 0 ]; then
        log_error "No active tasks found in SPEC/ACTIVE/ (need a NNNN- prefixed dir)"
        log_info "Create a task with /ralph:strategic-plan first"
        return 1
    fi
    if [ "$count" -gt 1 ]; then
        log_error "Multiple tasks in SPEC/ACTIVE/ — select one with --task <name> (or RALPH_TASK env):"
        echo "$candidates" | sed 's/^/  /' >&2
        return 1
    fi
    echo "$candidates"
}

# A worktree "exists" only if it is both registered AND live on disk (.git link
# present) — a registration alone survives `rm -rf worktrees/` and would make us
# skip creation, leaving later steps to run against a hollow directory that git
# resolves to the MAIN repo.
worktree_exists() {
    local project_root="$1" worktree_path="$2"
    git -C "$project_root" worktree list | grep -q "$worktree_path" && [ -f "$worktree_path/.git" ]
}

# Agents sometimes leave servers running: a `next dev` started for verification
# on 2026-08-15 survived its iteration and squatted port 3000 a day later. After
# an agent session exits, anything still running with its cwd inside the
# worktree is a leak — kill it. Interactive shells are spared so a user terminal
# cd'd into the worktree never dies.
kill_worktree_orphans() {
    local worktree_path="$1"
    local p pid cwd comm
    for p in /proc/[0-9]*; do
        pid="${p#/proc/}"
        [ "$pid" = "$$" ] && continue
        cwd=$(readlink "$p/cwd" 2>/dev/null) || continue
        case "$cwd" in
            "$worktree_path"|"$worktree_path"/*) ;;
            *) continue ;;
        esac
        comm=$(cat "$p/comm" 2>/dev/null)
        case "$comm" in bash|zsh|sh|fish|dash) continue ;; esac
        if kill "$pid" 2>/dev/null; then
            log_warn "Killed leftover process $pid ($comm) still running in the worktree"
        fi
    done
    return 0
}

# The branch a ralph/* branch was cut from. Hardcoding "main" silently produced
# an empty merge-base on repos whose default branch is dev/master (TPV2,
# 2026-08-25) — and an empty base ref downgrades the review to "uncommitted
# changes only", which is nothing at all once ralph has committed every
# iteration. Prefer origin/HEAD, else the first conventional name that exists.
resolve_base_branch() {
    local repo="$1" b c
    b=$(git -C "$repo" symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null | sed 's|^origin/||')
    if [ -z "$b" ]; then
        for c in main master dev; do
            if git -C "$repo" rev-parse --verify --quiet "$c" >/dev/null 2>&1; then b="$c"; break; fi
        done
    fi
    [ -n "$b" ] || return 1
    printf '%s\n' "$b"
}
