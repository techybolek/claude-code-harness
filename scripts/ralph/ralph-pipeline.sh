#!/bin/bash
#
# ralph-pipeline.sh - Ralph implement loop + code-review loop
# ============================================================
#
# The hybrid pipeline validated on 2026-07-28 (see notes/harness-tuning-log.md):
#   1. Provision worktree (worktree-setup.sh: env copy, local state, project hook)
#   2. ralph.sh — iterative implementation on branch ralph/<task>
#   3. On completion: /review-flow-only in the worktree (validate + panel + fixer)
#   4. Commit the fixer's changes on the ralph branch
#
# Usage:
#   cd <project_root> && ~/.claude/scripts/ralph/ralph-pipeline.sh [iterations]
#   ~/.claude/scripts/ralph/ralph-pipeline.sh --task <spec>  # select spec when several are ACTIVE
#   ~/.claude/scripts/ralph/ralph-pipeline.sh --skip-ralph   # review-only, e.g. rerun
#
# Task selection: --task <name> or RALPH_TASK=<name>; otherwise SPEC/ACTIVE/
# must contain exactly one NNNN- dir (multiple → hard error, never a silent pick).
#
# Per-project review config (optional), sourced from
# ~/.claude/scripts/ralph/project-config/<path-slug>.sh:
#   VALIDATION_COMMANDS=("cd backend && npm test" ...)  # for review-flow-only
#   REVIEW_MODEL=claude-...                             # review session model
#
# Exit codes: 0 = implemented + reviewed, 2 = ralph hit max iterations (no
# review run — rerun to continue), 1 = error.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(pwd)"

BLUE='\033[0;34m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'
log_info() { echo -e "${BLUE}[PIPELINE]${NC} $1"; }
log_success() { echo -e "${GREEN}[PIPELINE]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[PIPELINE]${NC} $1"; }
log_error() { echo -e "${RED}[PIPELINE]${NC} $1"; }

SKIP_RALPH=0
ITERATIONS=20
while [ $# -gt 0 ]; do
    case "$1" in
        --skip-ralph) SKIP_RALPH=1 ;;
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
            sed -n '2,25p' "$0" | sed 's/^# \{0,1\}//'
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

# Same task-selection rules as ralph.sh: --task/RALPH_TASK wins; otherwise
# exactly one NNNN- dir must be in SPEC/ACTIVE/ — several is a hard error,
# never a silent lowest-number pick.
CANDIDATES=$(ls -1 "$PROJECT_ROOT/SPEC/ACTIVE/" 2>/dev/null | grep -E '^[0-9]{4}-' | sort)
if [ -n "${RALPH_TASK:-}" ]; then
    if ! echo "$CANDIDATES" | grep -qxF "$RALPH_TASK"; then
        log_error "Task '$RALPH_TASK' not found in SPEC/ACTIVE/. Available:"
        echo "$CANDIDATES" | sed 's/^/  /'
        exit 1
    fi
    TASK_DIR="$RALPH_TASK"
else
    COUNT=$(echo -n "$CANDIDATES" | grep -c . || true)
    if [ "$COUNT" -eq 0 ]; then
        log_error "No active tasks found in SPEC/ACTIVE/"
        exit 1
    fi
    if [ "$COUNT" -gt 1 ]; then
        log_error "Multiple tasks in SPEC/ACTIVE/ — select one with --task <name> (or RALPH_TASK env):"
        echo "$CANDIDATES" | sed 's/^/  /'
        exit 1
    fi
    TASK_DIR="$CANDIDATES"
fi
log_info "Task: $TASK_DIR"

# Per-project review config (validation commands, model overrides)
PROJECT_SLUG="$(echo "$PROJECT_ROOT" | tr / -)"
PROJECT_CONFIG="$HOME/.claude/scripts/ralph/project-config/${PROJECT_SLUG}.sh"
VALIDATION_COMMANDS=()
if [ -f "$PROJECT_CONFIG" ]; then
    log_info "Loading project config: $PROJECT_CONFIG"
    # shellcheck source=/dev/null
    source "$PROJECT_CONFIG"
fi

# ---- Stage 1+2: provision + implement -------------------------------------
if [ "$SKIP_RALPH" -eq 0 ]; then
    log_info "Stage: ralph implement loop (max $ITERATIONS iterations)"
    ralph_rc=0
    "$SCRIPT_DIR/ralph.sh" --task "$TASK_DIR" "$ITERATIONS" || ralph_rc=$?
    case $ralph_rc in
        0) log_success "Ralph completed all tasks" ;;
        2) log_warn "Ralph hit max iterations — NOT running review over an incomplete build."
           log_warn "Rerun the pipeline to continue."
           exit 2 ;;
        *) log_error "Ralph failed (exit $ralph_rc)"
           exit 1 ;;
    esac
else
    log_info "Skipping ralph (review-only mode)"
fi

WORKTREE_PATH="$PROJECT_ROOT/worktrees/${TASK_DIR}"
if [ ! -f "$WORKTREE_PATH/.git" ]; then
    log_error "No worktree at $WORKTREE_PATH"
    exit 1
fi

# ---- Stage 3: code-review loop ---------------------------------------------
PLAN_PATH="SPEC/ACTIVE/${TASK_DIR}/plan.md"
if [ ! -f "$WORKTREE_PATH/$PLAN_PATH" ]; then
    log_error "Plan not found in worktree: $PLAN_PATH"
    exit 1
fi

REVIEW_ARGS=$(python3 - "$PLAN_PATH" "${VALIDATION_COMMANDS[@]+"${VALIDATION_COMMANDS[@]}"}" <<'EOF'
import json, sys
plan, cmds = sys.argv[1], sys.argv[2:]
args = {"planPath": plan}
if cmds:
    args["validationCommands"] = cmds
print(json.dumps(args))
EOF
)

REVIEW_LOG="$WORKTREE_PATH/.runs/${TASK_DIR}/review_$(date +%Y%m%d-%H%M%S).log"
mkdir -p "$(dirname "$REVIEW_LOG")"
log_info "Stage: review-flow-only (log: $REVIEW_LOG)"
log_info "Args: $REVIEW_ARGS"

review_rc=0
pushd "$WORKTREE_PATH" > /dev/null
claude --dangerously-skip-permissions \
    --model "${REVIEW_MODEL:-claude-sonnet-5}" \
    --verbose \
    --output-format stream-json \
    -p "/review-flow-only $REVIEW_ARGS" > "$REVIEW_LOG" 2>&1 || review_rc=$?
popd > /dev/null

if [ $review_rc -ne 0 ]; then
    log_error "Review session exited with code $review_rc — see $REVIEW_LOG"
    exit 1
fi

# ---- Stage 4: commit fixer output ------------------------------------------
# Tracked modifications only (git add -u): the worktree also holds untracked
# non-fixer files — .runs/ logs, env copies, hook-placed artifacts — that a
# blanket add -A would commit. New files the fixer created are listed below
# for a manual decision instead.
pushd "$WORKTREE_PATH" > /dev/null
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
    git add -u
    git commit -m "fix(review): apply review-flow-only panel findings" --quiet
    log_success "Committed fixer changes: $(git log -1 --format=%h)"
else
    log_info "Review made no tracked changes (nothing to commit)"
fi
UNTRACKED=$(git status --porcelain | grep '^??' | grep -v '^?? \.runs/' || true)
popd > /dev/null

# ---- Final report ------------------------------------------------------------
echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║        PIPELINE — IMPLEMENT + REVIEW DONE    ║"
echo "╚══════════════════════════════════════════════╝"
echo ""
echo "  Task:     $TASK_DIR"
echo "  Branch:   ralph/$TASK_DIR"
echo "  Worktree: $WORKTREE_PATH"
echo ""
echo "── Review verdict (final message) ─────────────"
python3 - "$REVIEW_LOG" <<'EOF'
import json, sys
last = ""
for line in open(sys.argv[1], errors="ignore"):
    try:
        e = json.loads(line)
    except Exception:
        continue
    if e.get("type") == "assistant":
        c = (e.get("message") or {}).get("content")
        if isinstance(c, list):
            t = " ".join(x.get("text", "") for x in c if x.get("type") == "text").strip()
            if t:
                last = t
print(last or "(no final message found — inspect the review log)")
EOF
echo "───────────────────────────────────────────────"
if [ -n "$UNTRACKED" ]; then
    echo ""
    log_warn "Untracked files left in worktree (NOT committed — review manually):"
    echo "$UNTRACKED"
fi
echo ""
echo "  Next steps:"
echo "    git -C $PROJECT_ROOT log main..ralph/$TASK_DIR"
echo "    review, then merge and: ~/.claude/scripts/ralph/ralph.sh --cleanup"
echo ""
