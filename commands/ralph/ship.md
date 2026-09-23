---
name: ship
description: One kickoff from spec to reviewed branch — plan (strategic-plan) → implement (ralph-flow, isolated worktree) → codex review & fix (review-flow-only). No argument = the newest spec under SPEC/.
argument-hint: [spec-path]
---

You are a thin orchestrator. You resolve the spec, plan it in a fresh context,
provision a worktree, run the Ralph implement loop, run the codex review loop,
commit the reviewed state, and report. You never edit code or docs yourself
(one exception in Step 2). A full run takes 1–3 h and this session must stay
alive throughout: run it in tmux with permissions that let agents write to the
worktree (`--dangerously-skip-permissions`, same as `/ralph:flow`).

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
3. **Re-ship guard.** `SPEC_REL` = the spec path relative to `PROJECT_ROOT`.
   `HIT=$(grep -l -F "$SPEC_REL" SPEC/ACTIVE/*/plan.md SPEC/ARCHIVE/*/plan.md 2>/dev/null | head -1)`
   — key on the output, not the exit code (an empty `SPEC/ARCHIVE` glob makes
   grep exit 2 even on a hit). `HIT` non-empty → STOP: "`<spec>` is already planned as `<task-dir>`. Continue it with
   `/ralph:flow <task-dir>`, or pass a different spec path." The newest spec
   being already planned means no new spec was written — never fall through to
   an older one.
4. Print one line: `Shipping: <SPEC_REL> (modified <mtime>) from <BASE_BRANCH>`.

## Step 2 — Plan (fresh context)

Launch the **Agent** tool, `subagent_type: general-purpose`, **no `model`
override** (inherits the session model; the `opus` alias silently runs the
session model anyway). Prompt:

> Read `~/.claude/commands/ralph/strategic-plan.md` and execute it exactly as
> written, with `$ARGUMENTS` = `<absolute spec path>`. Project root:
> `<PROJECT_ROOT>` — run `next-task-number.sh` from there and create the task
> under `<PROJECT_ROOT>/SPEC/ACTIVE/`. `plan.md` must carry
> ``**Source spec:** `<SPEC_REL>` `` directly under its title. Do not create git
> commits. Your final message is ONLY the task directory name (`NNNN-name`).

Wait for the notification, then verify `SPEC/ACTIVE/<task>/{plan,tasks,context}.md`
exist and `plan.md` contains the `**Source spec:**` line (append it if missing —
the only edit you make yourself; the re-ship guard and the review stage depend on it).

If `SPEC/` is tracked in this project (`git ls-files SPEC | head -1` prints
something): `git add SPEC/ACTIVE/<task> "$SPEC_REL" && git commit -m "docs(spec): plan <task>"`.
The worktree branches from HEAD, so this puts the plan on the feature branch and
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
  STOP. After they resolve it: `/ralph:flow <task>` (on-disk state carries).
- **`max_iterations` / `agent_error`** — report the iteration history; STOP.
  Continue with `/ralph:flow <task>`.

## Step 5 — Review

`BASE_REF=$(git -C "$WORKTREE" merge-base "$BASE_BRANCH" HEAD)` — empty → STOP
(Ralph commits every iteration, so the uncommitted diff is empty and a panel
would PASS on nothing).

Paths for the review: use the worktree copy of `plan.md` and the spec when they
exist there (tracked `SPEC/`), else the `PROJECT_ROOT` copies.

**Workflow** tool: `scriptPath: ~/.claude/workflows/review-flow-only.js`,
`args: { "planPath": "<abs plan.md>", "specPath": "<abs spec>", "repoRoot": "<WORKTREE>", "baseRef": "<BASE_REF>", "validate": "off" }`.
`repoRoot` is what lets the panel review the worktree from this session; never
omit it. Wait for the notification. Never fall back to `exec:review-loop` or
`exec:review-panel`.

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
rule: amend the spec/plan (the sanctioned lever) or accept the plan's letter,
then re-run only the review with the same `review-flow-only` args.
`review: UNRESOLVED` because codex was unavailable → the fixes are unverified;
say so and give the same re-run.

## Rules

- **Stay thin.** Never read a diff, test log, or plan body into your own context;
  the agents do that. Debug a strange result from the workflow's `journal.jsonl`.
- **Parallel ships** are safe at the git level (own worktree, own branch) but
  share dev-server ports and databases. Run two at once only when the project's
  CLAUDE.md defines per-worktree isolation for those; otherwise sequential.
- The two commits this command makes (`docs(spec)` on the base branch, `fix(review)`
  on the feature branch) are the whole of its git writes. No merges, no pushes.
