#!/bin/bash
# next-task-number.sh
# Determines the next sequential task number for SPEC tasks.
# Scans both SPEC/ACTIVE/ and SPEC/ARCHIVE/ directories.
# Returns zero-padded 4-digit number (e.g., 0001, 0002, etc.)
#
# Usage: next-task-number.sh [project_root]
#
# The project root is resolved, not assumed. Earlier versions took it from
# BASH_SOURCE (resolved to ~/ for the installed copy, so every project
# restarted at 0001) and then from $(pwd) (correct at the root, but silently
# 0001 from any subdirectory such as frontend/ — a wrong number that collides
# with an existing task instead of failing). Both failure modes were silent.

set -e

# 1. explicit argument  2. main worktree of the enclosing git repo  3. cwd
resolve_project_root() {
    if [[ -n "${1:-}" ]]; then
        if [[ ! -d "$1" ]]; then
            echo "next-task-number.sh: no such directory: $1" >&2
            exit 1
        fi
        (cd "$1" && pwd)
        return
    fi
    # --git-common-dir (not --show-toplevel) so a linked worktree resolves to
    # the MAIN repo: task numbering is per-project, and Ralph calls this from
    # both the root and from worktrees/<task>/.
    local common_dir
    if common_dir=$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null); then
        dirname "$common_dir"
        return
    fi
    pwd
}

PROJECT_ROOT="$(resolve_project_root "${1:-}")"
# Announce the resolved root so a wrong one is visible instead of inferred from
# a surprising number.
echo "next-task-number.sh: project root $PROJECT_ROOT" >&2

ACTIVE_DIR="$PROJECT_ROOT/SPEC/ACTIVE"
ARCHIVE_DIR="$PROJECT_ROOT/SPEC/ARCHIVE"

max_num=0

for dir in "$ACTIVE_DIR" "$ARCHIVE_DIR"; do
    if [[ -d "$dir" ]]; then
        for entry in "$dir"/*; do
            if [[ -d "$entry" ]]; then
                basename=$(basename "$entry")
                # Match leading digits before hyphen (e.g., "0001-task-name" -> "0001")
                if [[ "$basename" =~ ^([0-9]+)- ]]; then
                    num=$((10#${BASH_REMATCH[1]}))
                    if (( num > max_num )); then
                        max_num=$num
                    fi
                fi
            fi
        done
    fi
done

next_num=$((max_num + 1))
printf "%04d\n" "$next_num"
