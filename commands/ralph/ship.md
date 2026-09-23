---
name: ship
description: One kickoff from spec to reviewed branch, and the resume path for a stopped run — implement (ralph-flow, isolated worktree; the implementer writes its own tasks.md) → codex review & fix (review-flow-only). No argument = the newest spec under SPEC/.
argument-hint: [spec-path]
---

You are a thin orchestrator. You resolve the spec, create the task folder,
provision a worktree, run the Ralph implement loop, run the codex review loop,
commit the reviewed state, and report. You never edit code or docs yourself
(beyond the one-line `tasks.md` stub in Step 2). A full run takes 1–3 h and this session must stay
alive throughout: run it in tmux with permissions that let agents write to the
worktree (`--dangerously-skip-permissions`).

Every Workflow/Agent step runs in the background — wait for its completion
notification. Never poll, never report a result before the notification arrives,
never end a turn with a promise.

## Step 1 — Resolve the spec

1. Must run from the **main checkout**, not a worktree:
   `test "$(git rev-parse --git-dir)" = "$(git rev-parse --git-common-dir)"` — else STOP.
   Record `PROJECT_ROOT=$(git rev-parse --show-toplevel)` and
   `BASE_BRANCH=$(git rev-parse --abbrev-ref HEAD)`.
2. Spec:
   - `$ARGUMENTS` names an existing `.md` → that is the spec.
   - Otherwise the newest spec by modification time:
     `ls -t SPEC/FEATURE-REQUEST/*.md SPEC/BUG-REPORT/*.md SPEC/CHORE/*.md SPEC/TECHNICAL/*.md SPEC/REQUIREMENTS/*.md 2>/dev/null | head -1`
     None → STOP: "No spec found under SPEC/."
3. **Resume check.** `SPEC_REL` = the spec path relative to `PROJECT_ROOT`.
   `HIT=$(grep -l -F "$SPEC_REL" SPEC/ACTIVE/*/tasks.md SPEC/ARCHIVE/*/tasks.md SPEC/ACTIVE/*/plan.md SPEC/ARCHIVE/*/plan.md 2>/dev/null | head -1)`
   — key on the output, not the exit code (an empty `SPEC/ARCHIVE` glob makes
   grep exit 2 even on a hit).
   - `HIT` under `SPEC/ARCHIVE/` → STOP: "`<spec>` already shipped as `<task-dir>`."
   - `HIT` under `SPEC/ACTIVE/` → **resume**: `<task>` = its directory name; skip
     Step 2 and continue at Step 3 (worktree setup is idempotent; tasks.md
     checkboxes and commits carry the implement state).
   - No `HIT` → new ship. Never fall through to an older spec.
4. Print one line: `Shipping: <SPEC_REL> (modified <mtime>) from <BASE_BRANCH>`,
   or `Resuming: <task> (<SPEC_REL>) from <BASE_BRANCH>`.

## Step 2 — Task folder

`NNNN=$(~/.claude/scripts/next-task-number.sh "$PROJECT_ROOT")`; `<task>` = `NNNN-<kebab name from the spec's filename, 2–4 words, date suffix dropped>`.
Create `SPEC/ACTIVE/<task>/tasks.md` containing only:

```
# Tasks — <task>

**Source spec:** `<SPEC_REL>`
```

No plan: the implementer reads the spec and writes the checklist itself. The
resume check, the implement loop and the review stage all resolve the spec
from that line.

If `SPEC/` is tracked in this project (`git ls-files SPEC | head -1` prints
something): `git add SPEC/ACTIVE/<task> "$SPEC_REL" && git commit -m "docs(spec): start <task>"`.
The worktree branches from HEAD, so this puts the spec on the feature branch and
keeps the later merge clean. Gitignored `SPEC/` → skip; the docs live only here.

## Step 3 — Worktree

`WORKTREE=$(~/.claude/scripts/ralph/worktree-setup.sh "$PROJECT_ROOT" <task>)`
— idempotent; branch `ralph/<task>`; env/local state propagated by the
project's worktree hook. Print the path. Health-check warnings it prints are
for the human; the implement loop carries them itself.

## Step 4 — Implement

**Workflow** tool: `scriptPath: ~/.claude/workflows/ralph-flow.js`,
`args: { "projectRoot": "<PROJECT_ROOT>", "taskDir": "<task>", "worktreePath": "<WORKTREE>", "maxIterations": 20 }`
— a real JSON object, not a string. Wait for the notification. Branch on `outcome`:

- **`all_done`** — guard: `<WORKTREE>/.runs/<task>/SUMMARY.md` exists and
  `git -C <WORKTREE> status --porcelain` shows no uncommitted source changes
  (untracked `.runs/` is fine). Either fails → treat as incomplete, report, STOP.
  Otherwise continue.
- **`blocked`** — report `blockedReason` verbatim plus what the human must do.
  STOP. After they resolve it: `/ralph:ship <SPEC_REL>` resumes.
- **`max_iterations` / `agent_error`** — report the iteration history; STOP.
  Continue with `/ralph:ship <SPEC_REL>`.

## Step 5 — Review

`BASE_REF=$(git -C "$WORKTREE" merge-base "$BASE_BRANCH" HEAD)` — empty → STOP
(Ralph commits every iteration, so the uncommitted diff is empty and a panel
would PASS on nothing).

Path for the review: use the worktree copy of the spec when it exists there
(tracked `SPEC/`), else the `PROJECT_ROOT` copy.

**Workflow** tool: `scriptPath: ~/.claude/workflows/review-flow-only.js`,
`args: { "specPath": "<abs spec>", "repoRoot": "<WORKTREE>", "baseRef": "<BASE_REF>", "validate": "off" }`.
`repoRoot` is what lets the panel review the worktree from this session; never
omit it. Wait for the notification.

## Step 6 — Commit the reviewed state

The panel judged the whole diff vs `BASE_REF`, tracked and untracked alike, so
the branch tip must equal what it judged:

```bash
cd "$WORKTREE" && git add -A -- ':!.runs' && { git diff --cached --quiet || git commit -q -m "fix(review): apply review-flow-only panel findings"; }
```

Then write the findings report (non-fatal if it fails):

```bash
printf 'REVIEW_VERDICT: %s' '<review result JSON verbatim>' | python3 ~/.claude/scripts/ralph/write-review-report.py \
  "$PROJECT_ROOT/SPEC/ACTIVE/<task>/review-findings.md" <task> ralph/<task> "$BASE_BRANCH" "$BASE_REF" "$(date '+%Y-%m-%d %H:%M:%S %Z')"
```

## Step 7 — Report

```
## Ship summary
- Spec: <SPEC_REL>
- Task: <task>  ·  Branch: ralph/<task>  ·  Worktree: <WORKTREE>
- Implement: <iterations> iterations, <n> commits
- Review: <review>  (fixed <n> · rejected <n> · declined <n>)
- Declined (real, left unfixed): <list or None>
- Plan deviations — HUMAN RULING REQUIRED: <list or None>
- Unresolved: <list or None>
- Findings report: SPEC/ACTIVE/<task>/review-findings.md
- Next: inspect and merge `ralph/<task>` from the main checkout, then
  `~/.claude/scripts/ralph/ralph.sh --cleanup` and `git mv SPEC/ACTIVE/<task> SPEC/ARCHIVE/`.
```

Plan deviations non-empty → say plainly that the pipeline did not fix them by
rule: amend the spec (the sanctioned lever) or accept the code as it is,
then re-run only the review with the same `review-flow-only` args.
`review: UNRESOLVED` because codex was unavailable → the fixes are unverified;
say so and give the same re-run.

## Rules

- **Stay thin.** Never read a diff, test log, or spec body into your own context;
  the agents do that. Debug a strange result from the workflow's `journal.jsonl`.
- **Parallel ships** are safe at the git level (own worktree, own branch) but
  share dev-server ports and databases. Run two at once only when the project's
  CLAUDE.md defines per-worktree isolation for those; otherwise sequential.
- The two commits this command makes (a resume skips the first) — `docs(spec)` on the base branch, `fix(review)`
  on the feature branch — are the whole of its git writes. No merges, no pushes.
