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
#   ~/.claude/scripts/ralph/ralph-pipeline.sh <spec> [iterations]  # bare spec name
#   ~/.claude/scripts/ralph/ralph-pipeline.sh --task <spec>  # select spec when several are ACTIVE
#   ~/.claude/scripts/ralph/ralph-pipeline.sh --skip-ralph   # review-only, e.g. rerun
#   ~/.claude/scripts/ralph/ralph-pipeline.sh --validate <off|targeted|full>
#                                             # off       = review only, no suites
#                                             # targeted  = only what the diff can affect (DEFAULT)
#                                             # full      = every configured command
#   ~/.claude/scripts/ralph/ralph-pipeline.sh --skip-validation  # alias for --validate off
#
# Task selection: a bare non-numeric positional, --task <spec>, or
# RALPH_TASK=<spec>, where <spec> is the dir
# name or a path to its context.md (e.g. SPEC/ACTIVE/0001-x/context.md);
# otherwise SPEC/ACTIVE/ must contain exactly one NNNN- dir (multiple → hard
# error, never a silent pick).
#
# Per-project review config (optional), sourced from
# ~/.claude/scripts/ralph/project-config/<path-slug>.sh:
#   VALIDATION_COMMANDS=("cd backend && npm test" ...)  # for review-flow-only
#   REVIEW_MODEL=claude-...                             # review session model
#
# Exit codes: 0 = implemented + reviewed, 2 = ralph hit max iterations (no
# review run — rerun to continue), 3 = reviewed but plan deviations escalated
# (human ruling required; normal fixes still committed), 1 = error.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(pwd)"

# Shared logging, task resolution and worktree helpers
LOG_PREFIX="PIPELINE"
source "$SCRIPT_DIR/lib.sh"

SKIP_RALPH=0
# Ralph runs the project's suites during implementation, so the review stage does
# not re-run them wholesale: 'targeted' executes only what the diff can affect,
# which keeps the runtime-verification value without the repeat cost.
VALIDATE=targeted
ITERATIONS=20
while [ $# -gt 0 ]; do
    case "$1" in
        --skip-ralph) SKIP_RALPH=1 ;;
        --skip-validation) VALIDATE=off ;;
        --validate)
            if [ $# -lt 2 ]; then
                log_error "--validate requires a value (off|targeted|full)"
                exit 1
            fi
            VALIDATE="$2"
            shift
            ;;
        --validate=*)
            VALIDATE="${1#--validate=}"
            ;;
        --task)
            if [ $# -lt 2 ]; then
                log_error "--task requires a value (spec dir name in SPEC/ACTIVE/, or a path to its context.md)"
                exit 1
            fi
            RALPH_TASK="$2"
            shift
            ;;
        --task=*)
            RALPH_TASK="${1#--task=}"
            ;;
        --help|-h)
            # Print the whole header comment block (a fixed line range goes
            # stale every time the header grows)
            awk 'NR>1 { if (/^#/) { sub(/^# ?/, ""); print } else exit }' "$0"
            exit 0
            ;;
        *)
            if [[ "$1" =~ ^[0-9]+$ ]]; then
                ITERATIONS="$1"
            elif [[ "$1" == -* ]]; then
                log_error "Unrecognized option: '$1'"
                exit 1
            else
                # Bare non-numeric positional = the spec (same as --task)
                RALPH_TASK="$1"
            fi
            ;;
    esac
    shift
done

case "$VALIDATE" in
    off|targeted|full) ;;
    *) log_error "--validate must be one of: off, targeted, full (got '$VALIDATE')"; exit 1 ;;
esac

# Same task-selection rules as ralph.sh (shared resolve_active_task):
# --task/RALPH_TASK wins; otherwise exactly one NNNN- dir in SPEC/ACTIVE/.
TASK_DIR=$(resolve_active_task "$PROJECT_ROOT") || exit 1
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

# Ralph agents commit every iteration — the review target is the committed
# range (plus any later uncommitted fixer edits): working tree vs merge-base.
BASE_BRANCH=$(resolve_base_branch "$WORKTREE_PATH" || true)
BASE_REF=""
[ -n "$BASE_BRANCH" ] && BASE_REF=$(git -C "$WORKTREE_PATH" merge-base "$BASE_BRANCH" HEAD 2>/dev/null || true)
if [ -z "$BASE_REF" ]; then
    # Never degrade to the uncommitted diff here: ralph commits every
    # iteration, so that diff is empty and the panel would "PASS" on nothing.
    log_error "Cannot resolve a base ref in the worktree (base branch: ${BASE_BRANCH:-none found})"
    log_error "Review needs the committed range — refusing to review an empty diff."
    exit 1
fi
log_info "Review base: $BASE_BRANCH ($BASE_REF)"

# Source spec (intent authority above the plan): derived from plan.md's
# "**Source spec:**" header so the triage gate can adjudicate plan-vs-code
# conflicts up the hierarchy (spec intent > plan letter). Absent → omit.
SPEC_PATH=$(sed -n 's/^\*\*Source spec:\*\*[[:space:]]*`\{0,1\}\([^`]*\)`\{0,1\}.*$/\1/p' "$WORKTREE_PATH/$PLAN_PATH" | head -1 | sed 's/[[:space:]]*$//')
if [ -n "$SPEC_PATH" ] && [ ! -f "$WORKTREE_PATH/$SPEC_PATH" ]; then
    log_warn "Source spec named in plan.md not found in worktree: $SPEC_PATH — reviewing without spec"
    SPEC_PATH=""
fi

REVIEW_ARGS=$(python3 - "$PLAN_PATH" "$VALIDATE" "$BASE_REF" "$SPEC_PATH" "${VALIDATION_COMMANDS[@]+"${VALIDATION_COMMANDS[@]}"}" <<'EOF'
import json, sys
plan, validate, base, spec, cmds = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4], sys.argv[5:]
args = {"planPath": plan, "validate": validate}
if base:
    args["baseRef"] = base
if spec:
    args["specPath"] = spec
# Always pass the commands: in targeted/full mode they are the candidate set the
# validator scopes down from. In 'off' mode the workflow ignores them.
if cmds:
    args["validationCommands"] = cmds
print(json.dumps(args))
EOF
)

REVIEW_LOG="$WORKTREE_PATH/.runs/${TASK_DIR}/review_$(date +%Y%m%d-%H%M%S).log"
mkdir -p "$(dirname "$REVIEW_LOG")"
log_info "Stage: review-flow-only (log: $REVIEW_LOG)"
log_info "Args: $REVIEW_ARGS"

# The headless session dies (taking a still-running workflow with it) if the
# model ends its turn with a promise instead of a result — observed 2026-08-16
# on 0002-customer-shop-membership: "workflow is running in the background,
# I'll let you know" killed the workflow mid-fix-round. The contract below makes
# an incomplete run detectable: no REVIEW_VERDICT line → treat as killed.
REVIEW_CONTRACT='This is a headless -p run: your final message ends the CLI process and kills any still-running background workflow. After launching the review workflow, never end a turn by promising future results ("running in the background", "I will let you know") — wait for the workflow completion notification instead. Your final message MUST begin with the line "REVIEW_VERDICT:" followed by the workflow'"'"'s returned JSON verbatim.'

review_rc=0
pushd "$WORKTREE_PATH" > /dev/null
# The panel+triage+fixer workflow runs well past claude -p's default 10-minute
# background-wait ceiling (v2.1.182+), which kills the workflow mid-run and was
# the actual cause of the two 2026-08-16 mid-fix deaths. A 60-min cap then killed
# a third run at 10:58 that was legitimately still fixing (triage of ~25 findings
# + a 19-file fix round takes >1h). The workflow itself is bounded (max 4 fix
# rounds, codex timeouts), so 0 = wait indefinitely is safe and is the default.
CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS="${REVIEW_WAIT_CEILING_MS:-0}" \
claude --dangerously-skip-permissions \
    --model "${REVIEW_MODEL:-claude-sonnet-5}" \
    --verbose \
    --output-format stream-json \
    --append-system-prompt "$REVIEW_CONTRACT" \
    -p "/review-flow-only $REVIEW_ARGS" > "$REVIEW_LOG" 2>&1 || review_rc=$?
popd > /dev/null

kill_worktree_orphans "$WORKTREE_PATH"

if [ $review_rc -ne 0 ]; then
    log_error "Review session exited with code $review_rc — see $REVIEW_LOG"
    exit 1
fi

FINAL_MSG=$(grep '"type":"result"' "$REVIEW_LOG" | tail -1 | jq -r '.result // ""' 2>/dev/null)
if ! printf '%s' "$FINAL_MSG" | grep -q 'REVIEW_VERDICT:'; then
    log_error "Review session ended without a REVIEW_VERDICT line — the workflow was likely killed mid-run; NOT committing anything. See $REVIEW_LOG"
    exit 1
fi

# Findings report: the verdict otherwise survives only in terminal scrollback
# and the multi-hundred-KB stream-json session log, so escalated plan deviations
# became unreadable once the terminal closed. Written beside the plan; SPEC/ is
# untracked here so it never dirties the worktree. Non-fatal by design.
REPORT_PATH="$WORKTREE_PATH/SPEC/ACTIVE/${TASK_DIR}/review-findings.md"
if printf '%s' "$FINAL_MSG" | python3 "$SCRIPT_DIR/write-review-report.py" \
        "$REPORT_PATH" "$TASK_DIR" "ralph/$TASK_DIR" "${BASE_BRANCH:-?}" \
        "$BASE_REF" "$(date '+%Y-%m-%d %H:%M:%S %Z')" > /dev/null 2>&1; then
    log_info "Findings report: SPEC/ACTIVE/${TASK_DIR}/review-findings.md"
else
    log_warn "Could not write the findings report (continuing)"
fi

# ---- Stage 4: commit the reviewed state --------------------------------------
# The REVIEW_VERDICT gate above proves the workflow ran to completion, and the
# panel reviewed the WHOLE diff vs baseRef — tracked and untracked alike. Commit
# exactly that reviewed state (everything except .runs/ logs) so the branch tip
# equals what the panel judged. The old tracked-mods-only + pre-dirt-snapshot
# policy withheld reviewed content: it excluded fixer-created files (ed01b99
# shipped an import of an uncommitted util) and excluded a previous killed
# attempt's fixer edits that the rerun's panel had re-reviewed. Real env copies
# are gitignored and never reach git status; .runs/ is excluded by path.
pushd "$WORKTREE_PATH" > /dev/null
git add -A -- ':!.runs'
if ! git diff --cached --quiet; then
    git commit -m "fix(review): apply review-flow-only panel findings" --quiet
    log_success "Committed reviewed state: $(git log -1 --format=%h)"
else
    log_info "Worktree already matches the reviewed state (nothing to commit)"
fi
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
# FINAL_MSG is the session's result record — the same final assistant message
# the old log-rescan reconstructed, and the REVIEW_VERDICT gate above already
# proved it is present and complete.
printf '%s\n' "$FINAL_MSG"
echo "───────────────────────────────────────────────"

# Plan deviations: triage-escalated plan-vs-code conflicts the pipeline is NOT
# allowed to auto-fix — they require a human ruling (amend the spec/plan, or
# accept the plan's letter and rerun). Non-empty → exit 3.
DEVIATIONS=$(printf '%s' "$FINAL_MSG" | python3 -c '
import json, sys
txt = sys.stdin.read()
i = txt.find("REVIEW_VERDICT:")
obj = None
if i >= 0:
    payload = txt[i + len("REVIEW_VERDICT:"):]
    dec = json.JSONDecoder()
    for j, ch in enumerate(payload):
        if ch == "{":
            try:
                obj, _ = dec.raw_decode(payload[j:])
                break
            except Exception:
                continue
for d in (obj or {}).get("planDeviations") or []:
    print(f"  - {d}")
')
PIPELINE_RC=0
if [ -n "$DEVIATIONS" ]; then
    echo ""
    log_warn "⚠ Plan deviations — human decision required (escalated, NOT auto-fixed):"
    printf '%s\n' "$DEVIATIONS"
    log_warn "Rule: amend the spec/plan (sanctioned lever) or accept the plan's letter, then rerun --skip-ralph."
    PIPELINE_RC=3
fi
echo ""
echo "  Findings: SPEC/ACTIVE/$TASK_DIR/review-findings.md"
echo ""
echo "  Next steps:"
echo "    git -C $PROJECT_ROOT log ${BASE_BRANCH}..ralph/$TASK_DIR"
echo "    review, then merge and: ~/.claude/scripts/ralph/ralph.sh --cleanup"
echo ""
exit $PIPELINE_RC
