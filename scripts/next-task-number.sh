#!/bin/bash
# next-task-number.sh
# Determines the next sequential task number for SPEC tasks.
# Scans both SPEC/ACTIVE/ and SPEC/ARCHIVE/ directories.
# Returns zero-padded 4-digit number (e.g., 0001, 0002, etc.)
#
# Run from the project root — numbering is per-project, so PROJECT_ROOT is the
# caller's cwd. (Deriving it from BASH_SOURCE resolved to ~/ for the installed
# copy at ~/.claude/scripts/, which made every project restart at 0001.)

set -e

PROJECT_ROOT="$(pwd)"

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
