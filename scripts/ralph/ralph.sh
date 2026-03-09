#!/bin/bash
#
# ralph.sh - Self-Continuing Agent for SPEC/ACTIVE Tasks
# ====================================================
#
# Ralph automates work on SPEC/ACTIVE/ tasks through an iterative loop.
# Uses git worktree isolation - all changes happen on a feature branch.
#
# Usage:
#   ~/.claude/scripts/ralph/ralph.sh [iterations]    # Default: 20 iterations
#   ~/.claude/scripts/ralph/ralph.sh 5               # Run 5 iterations
#   ~/.claude/scripts/ralph/ralph.sh --dry-run       # Show what would happen
#   ~/.claude/scripts/ralph/ralph.sh --status        # Show current status
#   ~/.claude/scripts/ralph/ralph.sh --cleanup       # Remove worktree and branch
#
# Safety:
#   - All changes on feature branch (main protected)
#   - Write/Edit restricted to worktree path via --allowedTools
#   - Safety hooks remain active (safety_validator.py)
#   - Maximum iterations prevent runaway execution
#

set -e  # Exit on any error

# Track claude PID so we can force-kill it on Ctrl+C
CLAUDE_PID=""
cleanup_on_exit() {
    echo -e "\n\033[0;31m[INTERRUPTED]\033[0m Stopping Ralph..."
    [ -n "$CLAUDE_PID" ] && kill -9 "$CLAUDE_PID" 2>/dev/null
    exit 130
}
trap cleanup_on_exit INT TERM

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PROJECT_ROOT="$(pwd)"
PROMPTS_DIR="$HOME/.claude/scripts/ralph/prompts"

# Completion markers
TASK_ITEM_DONE="<ralph>TASK_ITEM_DONE</ralph>"
ALL_TASKS_DONE="<ralph>ALL_TASKS_DONE</ralph>"
ERROR_STOP="<ralph>ERROR_STOP</ralph>"

# Logging functions
log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Find active task in SPEC/ACTIVE/ - requires NNNN- prefix
find_active_task() {
    ls -1 "$PROJECT_ROOT/SPEC/ACTIVE/" 2>/dev/null | grep -E '^[0-9]{4}-' | sort | head -1
}

# Worktrees directory (inside project, gitignored)
WORKTREES_DIR="$PROJECT_ROOT/worktrees"

# Get worktree path for a task (uses full task dir name, e.g. 0001-task-name)
get_worktree_path() {
    local task_name="$1"
    echo "$WORKTREES_DIR/${task_name}"
}

# Ensure worktrees directory exists
ensure_worktrees_dir() {
    if [ ! -d "$WORKTREES_DIR" ]; then
        mkdir -p "$WORKTREES_DIR"
        log_info "Created worktrees directory at $WORKTREES_DIR"
    fi
}

# Check if worktree already exists
worktree_exists() {
    local worktree_path="$1"
    git -C "$PROJECT_ROOT" worktree list | grep -q "$worktree_path"
}

# Get branch name for a task
get_branch_name() {
    echo "ralph/${1}"
}

# Create worktree for task
create_worktree() {
    local task_dir="$1"
    local branch_name=$(get_branch_name "$task_dir")
    local worktree_path=$(get_worktree_path "$task_dir")

    # Ensure worktrees directory exists
    ensure_worktrees_dir >&2

    # Check if worktree already exists
    if worktree_exists "$worktree_path"; then
        log_info "Worktree already exists at $worktree_path" >&2
        echo "$worktree_path"
        return 0
    fi

    # Check if branch exists
    if git -C "$PROJECT_ROOT" show-ref --verify --quiet "refs/heads/$branch_name"; then
        log_info "Branch $branch_name exists, creating worktree..." >&2
        git -C "$PROJECT_ROOT" worktree add "$worktree_path" "$branch_name" >&2
    else
        log_info "Creating new branch $branch_name with worktree..." >&2
        git -C "$PROJECT_ROOT" worktree add -b "$branch_name" "$worktree_path" >&2
    fi

    echo "$worktree_path"
}

# Copy environment and secret files to worktree (including .example for structure reference)
copy_env_files() {
    local worktree_path="$1"
    local copied=0

    for pattern in .env .secret; do
        for file in "$PROJECT_ROOT"/${pattern}*; do
            if [ -f "$file" ]; then
                local filename=$(basename "$file")
                cp "$file" "$worktree_path/$filename"
                log_info "Copied $filename to worktree"
                copied=$((copied + 1))
            fi
        done
    done

    if [ $copied -eq 0 ]; then
        log_info "No .env or .secret files found to copy"
    fi
}

# Build the agent prompt
build_prompt() {
    local worktree_path="$1"
    local task_dir="$2"
    local session_id="$3"

    # Read the prompt template
    local prompt_template=""
    if [ -f "$PROMPTS_DIR/AGENT_PROMPT.md" ]; then
        prompt_template=$(cat "$PROMPTS_DIR/AGENT_PROMPT.md")
    else
        log_error "Prompt template not found at $PROMPTS_DIR/AGENT_PROMPT.md"
        exit 1
    fi

    # Build file references
    local task_path="SPEC/ACTIVE/${task_dir}"
    local progress_file=".runs/${task_dir}/ralph_progress.txt"

    # Create prompt with context files
    cat <<PROMPT
@CLAUDE.md
@${task_path}/

Session ID: ${session_id}
Task: ${task_dir}
Worktree Path: ${worktree_path}
Progress File: ${progress_file}

${prompt_template}
PROMPT
}

# Append progress to .runs/<task>/ralph_progress.txt
log_progress() {
    local worktree_path="$1"
    local task_dir="$2"
    local session_id="$3"
    local status="$4"
    local details="$5"

    local progress_file="${worktree_path}/.runs/${task_dir}/ralph_progress.txt"
    local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    local branch_name=$(get_branch_name "$task_dir")

    # Ensure directory exists
    mkdir -p "$(dirname "$progress_file")"

    # Append JSONL entry
    echo "{\"timestamp\": \"$timestamp\", \"session\": \"$session_id\", \"branch\": \"$branch_name\", \"status\": \"$status\", \"details\": \"$details\"}" >> "$progress_file"
}

# Print a prominent final summary from the progress file
print_summary() {
    local worktree_path="$1"
    local task_dir="$2"
    local session_id="$3"
    local final_status="$4"   # "complete" | "max_iterations" | "error"

    local branch_name=$(get_branch_name "$task_dir")
    local progress_file="${worktree_path}/.runs/${task_dir}/ralph_progress.txt"

    # Accumulate stats from progress file for this session
    local items_completed=0 tests_written=0 tests_passed=0 commits=""
    if [ -f "$progress_file" ]; then
        while IFS= read -r line; do
            [[ "$line" != *"\"session\": \"$session_id\""* ]] && continue
            local ic tw tp cm
            ic=$(echo "$line" | grep -oP '"items_completed":\s*\K[0-9]+' || true)
            tw=$(echo "$line" | grep -oP '"tests_written":\s*\K[0-9]+' || true)
            tp=$(echo "$line" | grep -oP '"tests_passed":\s*\K[0-9]+' || true)
            cm=$(echo "$line" | grep -oP '"commit":\s*"\K[^"]+' || true)
            [ -n "$ic" ] && items_completed=$((items_completed + ic))
            [ -n "$tw" ] && tests_written=$((tests_written + tw))
            [ -n "$tp" ] && tests_passed=$((tests_passed + tp))
            [ -n "$cm" ] && commits="$cm"  # keep last commit
        done < "$progress_file"
    fi

    echo ""
    echo "╔══════════════════════════════════════════════╗"
    case "$final_status" in
        complete)       echo "║         RALPH — ALL TASKS COMPLETE           ║" ;;
        max_iterations) echo "║         RALPH — MAX ITERATIONS REACHED       ║" ;;
        error)          echo "║         RALPH — STOPPED (ERROR)              ║" ;;
    esac
    echo "╚══════════════════════════════════════════════╝"
    echo ""
    echo "  Task:    $task_dir"
    echo "  Branch:  $branch_name"
    echo "  Session: $session_id"
    [ $items_completed -gt 0 ] && echo "  Items:   $items_completed completed"
    [ $tests_written -gt 0 ]   && echo "  Tests:   $tests_written written, $tests_passed passed"
    [ -n "$commits" ]          && echo "  Commit:  $commits"
    echo ""
    # Display SUMMARY.md if Ralph wrote one
    local summary_file="${worktree_path}/.runs/${task_dir}/SUMMARY.md"
    if [ -f "$summary_file" ]; then
        echo "──────────────────────────────────────────────"
        cat "$summary_file"
        echo "──────────────────────────────────────────────"
        echo ""
    fi

    if [ "$final_status" = "complete" ] || [ "$final_status" = "max_iterations" ]; then
        echo "  Next steps:"
        echo "    git log main..$branch_name"
        echo "    gh pr create --base main --head $branch_name"
        echo "    ~/.claude/scripts/ralph/ralph.sh --cleanup"
    fi
    if [ "$final_status" = "error" ]; then
        echo "  Logs: cat $progress_file"
    fi
    echo ""
}

# Show status
show_status() {
    log_info "Ralph Status"
    echo "============================================"

    # Find active task
    local task_dir=$(find_active_task)
    if [ -z "$task_dir" ]; then
        log_warn "No active tasks found in SPEC/ACTIVE/"
        return 0
    fi

    echo "Active task: $task_dir"

    local worktree_path=$(get_worktree_path "$task_dir")
    local branch_name=$(get_branch_name "$task_dir")

    # Check worktree
    if worktree_exists "$worktree_path"; then
        echo "Worktree: $worktree_path (exists)"
    else
        echo "Worktree: $worktree_path (not created)"
    fi

    # Check branch
    if git -C "$PROJECT_ROOT" show-ref --verify --quiet "refs/heads/$branch_name"; then
        echo "Branch: $branch_name (exists)"
        local commits=$(git -C "$PROJECT_ROOT" rev-list --count main..$branch_name 2>/dev/null || echo "0")
        echo "Commits ahead of main: $commits"
    else
        echo "Branch: $branch_name (not created)"
    fi

    # Check progress file (worktree first, fall back to project root)
    local progress_file="${worktree_path}/.runs/${task_dir}/ralph_progress.txt"
    [ ! -f "$progress_file" ] && progress_file="$PROJECT_ROOT/.runs/${task_dir}/ralph_progress.txt"
    if [ -f "$progress_file" ]; then
        echo ""
        echo "Recent progress (last 5 entries):"
        tail -5 "$progress_file" 2>/dev/null || echo "  (empty)"
    fi

    echo "============================================"
}

# Cleanup worktree and optionally branch
cleanup() {
    local task_dir=$(find_active_task)
    if [ -z "$task_dir" ]; then
        log_warn "No active task to clean up"
        return 0
    fi

    local worktree_path=$(get_worktree_path "$task_dir")
    local branch_name=$(get_branch_name "$task_dir")

    log_info "Cleaning up Ralph artifacts for $task_dir"

    # Remove worktree
    if worktree_exists "$worktree_path"; then
        log_info "Removing worktree at $worktree_path"
        git -C "$PROJECT_ROOT" worktree remove --force "$worktree_path" 2>/dev/null || rm -rf "$worktree_path"
    fi

    # Ask about branch
    if git -C "$PROJECT_ROOT" show-ref --verify --quiet "refs/heads/$branch_name"; then
        read -p "Delete branch $branch_name? (y/N) " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            git -C "$PROJECT_ROOT" branch -D "$branch_name"
            log_success "Branch deleted"
        else
            log_info "Branch kept"
        fi
    fi

    log_success "Cleanup complete"
}

# Dry run - show what would happen
dry_run() {
    log_info "DRY RUN MODE"
    echo "============================================"

    local task_dir=$(find_active_task)
    if [ -z "$task_dir" ]; then
        log_warn "No active tasks found in SPEC/ACTIVE/"
        log_info "Create a task with /ralph:dev-docs first"
        return 0
    fi

    local branch_name=$(get_branch_name "$task_dir")
    local worktree_path=$(get_worktree_path "$task_dir")

    echo "Would work on: $task_dir"
    echo "Branch name: $branch_name"
    echo "Worktree path: $worktree_path"
    echo ""
    echo "Allowed tools would be:"
    echo "  Write(${worktree_path}/**)"
    echo "  Edit(${worktree_path}/**)"
    echo "  Read(*)"
    echo "  Glob(*)"
    echo "  Grep(*)"
    echo "  Bash(pytest:*)"
    echo "  Bash(ruff:*)"
    echo "  Bash(git status:*)"
    echo "  Bash(git add:*)"
    echo "  Bash(git commit:*)"
    echo ""
    echo "Task files:"
    ls -la "$PROJECT_ROOT/SPEC/ACTIVE/${task_dir}/" 2>/dev/null || echo "  (directory empty)"
    echo ""
    echo "Prompt preview (first 50 lines):"
    echo "----------------------------------------"
    build_prompt "$worktree_path" "$task_dir" "dry-run" | head -50
    echo "..."
    echo "============================================"
}

# Main loop
main() {
    local max_iterations="${1:-20}"

    # Generate session ID
    local session_id="$(date +%Y%m%d-%H%M%S)-$$"

    echo "============================================"
    echo "     Ralph Self-Continuing Agent"
    echo "============================================"
    log_info "Session: $session_id"
    log_info "Max iterations: $max_iterations"
    echo ""

    # Find active task
    local task_dir=$(find_active_task)
    if [ -z "$task_dir" ]; then
        log_error "No active tasks found in SPEC/ACTIVE/"
        log_info "Create a task with /ralph:dev-docs first"
        exit 1
    fi

    log_info "Working on task: $task_dir"

    # Create worktree
    local worktree_path=$(create_worktree "$task_dir")

    log_success "Worktree ready at: $worktree_path"

    # Copy environment files to worktree
    copy_env_files "$worktree_path"

    # Ensure .runs directory exists inside worktree
    mkdir -p "$worktree_path/.runs/${task_dir}"

    # Log session start
    log_progress "$worktree_path" "$task_dir" "$session_id" "session_start" "Starting Ralph session with max $max_iterations iterations"

    # Build allowed tools restricted to worktree path
    local allowed_tools="Write(${worktree_path}/**),Edit(${worktree_path}/**),Read(*),Glob(*),Grep(*),Bash(pytest:*),Bash(python -m pytest:*),Bash(ruff check:*),Bash(ruff format:*),Bash(git status:*),Bash(git diff:*),Bash(git add:*),Bash(git commit:*),Bash(ls:*),Bash(cat:*),Bash(head:*),Bash(tail:*)"

    # Main iteration loop
    for ((i=1; i<=$max_iterations; i++)); do
        echo ""
        log_info "========== Iteration $i of $max_iterations =========="

        log_progress "$worktree_path" "$task_dir" "$session_id" "iteration_start" "Starting iteration $i"

        # Build prompt
        local prompt=$(build_prompt "$worktree_path" "$task_dir" "$session_id")

        # Run Claude from within the worktree
        local log_file="${worktree_path}/.runs/${task_dir}/ralph_claude_iter${i}.log"
        log_info "Running Claude in worktree... (log: $log_file)"

        local exit_code=0

        # Run claude in background so trap can SIGKILL it on Ctrl+C
        pushd "$worktree_path" > /dev/null
        claude --dangerously-skip-permissions \
            --verbose \
            --output-format stream-json \
            --allowedTools "$allowed_tools" \
            -p "$prompt" > "$log_file" 2>&1 &
        CLAUDE_PID=$!
        wait $CLAUDE_PID || exit_code=$?
        CLAUDE_PID=""
        popd > /dev/null

        # Check for Claude errors
        if [ $exit_code -ne 0 ]; then
            log_error "Claude exited with code $exit_code"
            log_progress "$worktree_path" "$task_dir" "$session_id" "claude_error" "Claude exited with code $exit_code"
            print_summary "$worktree_path" "$task_dir" "$session_id" "error"
            echo "  Last log: $log_file"
            echo ""
            exit 1
        fi

        # Check for completion markers in log file
        local branch_name=$(get_branch_name "$task_dir")

        if grep -qF "$ALL_TASKS_DONE" "$log_file"; then
            log_progress "$worktree_path" "$task_dir" "$session_id" "all_complete" "All tasks completed"
            print_summary "$worktree_path" "$task_dir" "$session_id" "complete"
            exit 0
        fi

        if grep -qF "$ERROR_STOP" "$log_file"; then
            log_progress "$worktree_path" "$task_dir" "$session_id" "error_stop" "Agent encountered error and stopped"
            print_summary "$worktree_path" "$task_dir" "$session_id" "error"
            exit 1
        fi

        if grep -qF "$TASK_ITEM_DONE" "$log_file"; then
            log_success "Task item completed. Continuing to next..."
            log_progress "$worktree_path" "$task_dir" "$session_id" "item_complete" "Task item completed in iteration $i"
        else
            log_warn "No completion marker found in output"
            log_progress "$worktree_path" "$task_dir" "$session_id" "no_marker" "Iteration $i completed without marker"
        fi

        # Small delay between iterations
        sleep 2
    done

    echo ""
    log_warn "============================================"
    log_warn "Max iterations ($max_iterations) reached"
    log_warn "============================================"
    log_progress "$worktree_path" "$task_dir" "$session_id" "max_iterations" "Reached maximum iterations limit"
    print_summary "$worktree_path" "$task_dir" "$session_id" "max_iterations"
    echo "  Run again to continue: ~/.claude/scripts/ralph/ralph.sh"
    echo ""
}

# Parse arguments
case "${1:-}" in
    --dry-run)
        dry_run
        ;;
    --status)
        show_status
        ;;
    --cleanup)
        cleanup
        ;;
    --help|-h)
        echo "Ralph - Self-Continuing Agent for SPEC/ACTIVE Tasks"
        echo ""
        echo "Usage:"
        echo "  ~/.claude/scripts/ralph/ralph.sh [iterations]    Run for N iterations (default: 20)"
        echo "  ~/.claude/scripts/ralph/ralph.sh --dry-run       Show what would happen"
        echo "  ~/.claude/scripts/ralph/ralph.sh --status        Show current status"
        echo "  ~/.claude/scripts/ralph/ralph.sh --cleanup       Remove worktree and branch"
        echo "  ~/.claude/scripts/ralph/ralph.sh --help          Show this help"
        ;;
    *)
        main "${1:-20}"
        ;;
esac
