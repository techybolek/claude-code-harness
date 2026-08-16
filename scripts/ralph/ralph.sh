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
#   ~/.claude/scripts/ralph/ralph.sh --task <spec>   # Select spec when several are in SPEC/ACTIVE/
#   ~/.claude/scripts/ralph/ralph.sh --dry-run       # Show what would happen
#   ~/.claude/scripts/ralph/ralph.sh --status        # Show current status
#   ~/.claude/scripts/ralph/ralph.sh --cleanup       # Remove worktree and branch
#
# Task selection: --task <name> or RALPH_TASK=<name>; otherwise SPEC/ACTIVE/
# must contain exactly one NNNN- dir (multiple → hard error, never a silent pick).
#
# Prefer ralph-pipeline.sh for full runs (adds the code-review loop).
# Full docs: ~/.claude/scripts/ralph/README.md
# Exit codes: 0 = all tasks done, 2 = max iterations reached, 1 = error
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
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROMPTS_DIR="$HOME/.claude/scripts/ralph/prompts"
# Explicit model ID, not an alias — aliases silently resolve to the session
# model since CLI 2.1.219. Override per-run with RALPH_MODEL.
RALPH_MODEL="${RALPH_MODEL:-claude-sonnet-5}"

# Completion markers
TASK_ITEM_DONE="<ralph>TASK_ITEM_DONE</ralph>"
ALL_TASKS_DONE="<ralph>ALL_TASKS_DONE</ralph>"
ERROR_STOP="<ralph>ERROR_STOP</ralph>"

# Logging functions
log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Resolve the task to work on. Explicit selection via --task / RALPH_TASK wins;
# otherwise SPEC/ACTIVE/ must contain exactly ONE NNNN- dir — with several we
# fail loudly instead of silently picking the lowest number.
# Prints the task dir on stdout; on failure prints the reason to stderr and
# outputs nothing (callers treat empty as "stop").
find_active_task() {
    local candidates count
    candidates=$(ls -1 "$PROJECT_ROOT/SPEC/ACTIVE/" 2>/dev/null | grep -E '^[0-9]{4}-' | sort)

    if [ -n "${RALPH_TASK:-}" ]; then
        if echo "$candidates" | grep -qxF "$RALPH_TASK"; then
            echo "$RALPH_TASK"
        else
            log_error "Task '$RALPH_TASK' not found in SPEC/ACTIVE/. Available:" >&2
            echo "$candidates" | sed 's/^/  /' >&2
        fi
        return 0
    fi

    count=$(echo -n "$candidates" | grep -c . || true)
    if [ "$count" -eq 0 ]; then
        log_error "No active tasks found in SPEC/ACTIVE/ (need a NNNN- prefixed dir)" >&2
        log_info "Create a task with /ralph:strategic-plan first" >&2
        return 0
    fi
    if [ "$count" -gt 1 ]; then
        log_error "Multiple tasks in SPEC/ACTIVE/ — select one with --task <name> (or RALPH_TASK env):" >&2
        echo "$candidates" | sed 's/^/  /' >&2
        return 0
    fi
    echo "$candidates"
}

# Worktrees directory (inside project, gitignored)
WORKTREES_DIR="$PROJECT_ROOT/worktrees"

# Get worktree path for a task (uses full task dir name, e.g. 0001-task-name)
get_worktree_path() {
    local task_name="$1"
    echo "$WORKTREES_DIR/${task_name}"
}

# Check if worktree already exists
# A worktree "exists" only if it is both registered AND live on disk (.git link
# present) — a registration alone survives `rm -rf worktrees/` and would make us
# skip creation, leaving later steps to run against a hollow directory that git
# resolves to the MAIN repo.
worktree_exists() {
    local worktree_path="$1"
    git -C "$PROJECT_ROOT" worktree list | grep -q "$worktree_path" && [ -f "$worktree_path/.git" ]
}

# Get branch name for a task
get_branch_name() {
    echo "ralph/${1}"
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

    # Substitute the TASK_DIR placeholder so the agent never has to infer paths
    # from a raw template token (0002-customer-shop-membership, 2026-08-15:
    # eight iterations wrote SUMMARY.md under SPEC/ACTIVE/ instead of .runs/).
    prompt_template="${prompt_template//TASK_DIR/${task_dir}}"

    # Build file references
    local task_path="SPEC/ACTIVE/${task_dir}"
    local progress_file=".runs/${task_dir}/ralph_progress.txt"

    # Provisioning warnings from worktree-setup.sh health_check — may be stale
    # by later iterations (the agent may have run npm ci), hence "verify first".
    local health_section=""
    local health_file="${worktree_path}/.runs/worktree-health.txt"
    if [ -s "$health_file" ]; then
        health_section=$(printf 'Worktree provisioning warnings (verify each is still current, then fix before any test/build):\n%s\n\n' "$(cat "$health_file")")
    fi

    # Create prompt with context files
    cat <<PROMPT
@CLAUDE.md
@${task_path}/

Session ID: ${session_id}
Task: ${task_dir}
Worktree Path: ${worktree_path}
Progress File: ${progress_file}
Summary File (required before ALL_TASKS_DONE, exactly this path): .runs/${task_dir}/SUMMARY.md

${health_section}${prompt_template}
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
    if [ "$final_status" = "complete" ]; then
        echo "    git mv SPEC/ACTIVE/$task_dir SPEC/ARCHIVE/   # archive after merge —"
        echo "                                                 # specs left in ACTIVE make later runs ambiguous"
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

    local task_dir=$(find_active_task)
    [ -z "$task_dir" ] && return 1

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
    [ -z "$task_dir" ] && return 1

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
    [ -z "$task_dir" ] && return 1

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
    echo "  Bash(npm test:*) / Bash(npm run:*) / Bash(npx:*) / Bash(node:*)"
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

    # Find active task (find_active_task reports failures on stderr)
    local task_dir=$(find_active_task)
    [ -z "$task_dir" ] && exit 1

    log_info "Working on task: $task_dir"

    # Provision worktree (creation, env copy, machine-local state, project hook)
    local worktree_path=$("$SCRIPT_DIR/worktree-setup.sh" "$PROJECT_ROOT" "$task_dir")

    log_success "Worktree ready at: $worktree_path"

    # Ensure .runs directory exists inside worktree
    mkdir -p "$worktree_path/.runs/${task_dir}"

    # Log session start
    log_progress "$worktree_path" "$task_dir" "$session_id" "session_start" "Starting Ralph session with max $max_iterations iterations"

    # Build allowed tools restricted to worktree path
    local allowed_tools="Write(${worktree_path}/**),Edit(${worktree_path}/**),Read(*),Glob(*),Grep(*),Bash(pytest:*),Bash(python -m pytest:*),Bash(ruff check:*),Bash(ruff format:*),Bash(npm test:*),Bash(npm run:*),Bash(npx:*),Bash(node:*),Bash(git status:*),Bash(git diff:*),Bash(git add:*),Bash(git commit:*),Bash(ls:*),Bash(cat:*),Bash(head:*),Bash(tail:*)"

    # Main iteration loop
    local rejected_claims=0
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
        # Prompt via stdin, NOT argv: with -p "$prompt" the full prompt (marker
        # strings included) sits in /proc/*/cmdline, so any agent `ps` echoes it
        # into a tool result and thus into this log (0002-e2e-portal-pages,
        # 2026-08-02: false ALL_TASKS_DONE on iteration 1 of 20).
        printf '%s' "$prompt" | claude --dangerously-skip-permissions \
            --model "$RALPH_MODEL" \
            --verbose \
            --output-format stream-json \
            --allowedTools "$allowed_tools" \
            -p > "$log_file" 2>&1 &
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

        # Check for completion markers — ONLY in the agent's final result text.
        # A whole-log grep false-positives: tool results (ps output, cat of an
        # old iter log) can echo the prompt's marker instructions into the
        # stream-json log, which is exactly how 0002-e2e-portal-pages
        # (2026-08-02) exited all_complete on iteration 1 with ~10% of the
        # plan done.
        local branch_name=$(get_branch_name "$task_dir")
        local final_result
        final_result=$(grep '"type":"result"' "$log_file" | tail -1 | jq -r '.result // ""' 2>/dev/null)
        [ -z "$final_result" ] && log_warn "No result record found in $log_file"

        if printf '%s' "$final_result" | grep -qF "$ALL_TASKS_DONE"; then
            # ALL_TASKS_DONE is only valid with the SUMMARY.md the prompt makes
            # the agent write first — a completion claim without it is treated
            # as an unfinished iteration, not a completed run.
            if [ -f "$worktree_path/.runs/${task_dir}/SUMMARY.md" ]; then
                log_progress "$worktree_path" "$task_dir" "$session_id" "all_complete" "All tasks completed"
                print_summary "$worktree_path" "$task_dir" "$session_id" "complete"
                exit 0
            fi
            # Tell the NEXT iteration's agent exactly what is missing and where —
            # the progress file is the only channel it reads. A bare "without
            # SUMMARY.md" cost 7 iterations on 0002-customer-shop-membership
            # (2026-08-15): the summary sat under SPEC/ACTIVE/ and every fresh
            # agent assumed harness flakiness.
            local stray_summary
            stray_summary=$(find "$worktree_path" -name node_modules -prune -o -name SUMMARY.md -print 2>/dev/null | head -1)
            stray_summary="${stray_summary#"$worktree_path"/}"
            local reject_detail="Iteration $i claimed ALL_TASKS_DONE but .runs/${task_dir}/SUMMARY.md does not exist${stray_summary:+ — found SUMMARY.md at $stray_summary, which is the WRONG location; write it to .runs/${task_dir}/SUMMARY.md}"
            log_warn "$reject_detail"
            log_progress "$worktree_path" "$task_dir" "$session_id" "no_marker" "$reject_detail — continuing"
            rejected_claims=$((rejected_claims + 1))
            if [ "$rejected_claims" -ge 3 ]; then
                log_error "ALL_TASKS_DONE rejected $rejected_claims times in a row — stopping for human review instead of burning iterations"
                log_progress "$worktree_path" "$task_dir" "$session_id" "error_stop" "Completion claim rejected $rejected_claims consecutive times (missing .runs/${task_dir}/SUMMARY.md) — human review needed"
                print_summary "$worktree_path" "$task_dir" "$session_id" "error"
                exit 1
            fi
        elif printf '%s' "$final_result" | grep -qF "$ERROR_STOP"; then
            log_progress "$worktree_path" "$task_dir" "$session_id" "error_stop" "Agent encountered error and stopped"
            print_summary "$worktree_path" "$task_dir" "$session_id" "error"
            exit 1
        elif printf '%s' "$final_result" | grep -qF "$TASK_ITEM_DONE"; then
            log_success "Task item completed. Continuing to next..."
            log_progress "$worktree_path" "$task_dir" "$session_id" "item_complete" "Task item completed in iteration $i"
            rejected_claims=0
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
    # Distinct exit code so callers (ralph-pipeline.sh) can tell an incomplete
    # run from ALL_TASKS_DONE: 0 = complete, 2 = max iterations, 1 = error.
    exit 2
}

# Parse arguments
ACTION="run"
ITERATIONS=20
while [ $# -gt 0 ]; do
    case "$1" in
        --dry-run) ACTION="dry_run" ;;
        --status)  ACTION="status" ;;
        --cleanup) ACTION="cleanup" ;;
        --task)
            if [ $# -lt 2 ]; then
                log_error "--task requires a value (spec dir name in SPEC/ACTIVE/)"
                exit 1
            fi
            RALPH_TASK="$2"
            shift
            ;;
        --task=*)
            RALPH_TASK="${1#--task=}"
            ;;
        --help|-h)
            echo "Ralph - Self-Continuing Agent for SPEC/ACTIVE Tasks"
            echo ""
            echo "Usage:"
            echo "  ~/.claude/scripts/ralph/ralph.sh [iterations]     Run for N iterations (default: 20)"
            echo "  ~/.claude/scripts/ralph/ralph.sh --task <spec>    Select spec when SPEC/ACTIVE/ has several"
            echo "                                                    (env RALPH_TASK=<spec> also works)"
            echo "  ~/.claude/scripts/ralph/ralph.sh --dry-run        Show what would happen"
            echo "  ~/.claude/scripts/ralph/ralph.sh --status         Show current status"
            echo "  ~/.claude/scripts/ralph/ralph.sh --cleanup        Remove worktree and branch"
            echo "  ~/.claude/scripts/ralph/ralph.sh --help           Show this help"
            exit 0
            ;;
        *)
            if [[ "$1" =~ ^[0-9]+$ ]]; then
                ITERATIONS="$1"
            else
                log_error "Unrecognized argument: '$1'"
                log_error "The positional argument is the iteration count. To select a spec: --task $1"
                exit 1
            fi
            ;;
    esac
    shift
done

case "$ACTION" in
    dry_run) dry_run ;;
    status)  show_status ;;
    cleanup) cleanup ;;
    run)     main "$ITERATIONS" ;;
esac
