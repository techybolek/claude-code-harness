---
description: "Loop-driven pipeline: one state transition per tick, state on disk, fully resumable. Drive with /loop."
model: sonnet
---

# Run-Loop: One Transition Per Tick

You are a **single-tick driver** for the same spec→plan→review→implement→validate→review pipeline as `run-review.md` — but the control state lives on disk, not in your context. Each time you are invoked you advance the pipeline by **exactly one step**, write the new state to a file, and exit. You never hold the whole run in your head.

Wrap this command in `/loop` to drive a run to completion:

```
/loop exec:run-loop SPEC/REQUIREMENTS/foo.md      # self-paced — fires ticks until DONE/BLOCKED
```

Run it once (no `/loop`) and you get exactly one tick — useful for stepping through manually.

## Input
$ARGUMENTS

`$ARGUMENTS` is one path: a **spec** (`SPEC/REQUIREMENTS/`, `SPEC/FEATURE-REQUEST/`, `SPEC/BUG-REPORT/`) or a **plan** (`SPEC/PLAN/*.md`, or any `.md` with a `## Tasks` section).

## The state file

State lives at `SPEC/STATE/{name}.md`, where `{name}` is the input filename without extension. It is the **single source of truth** — you reconstruct everything from it each tick. Format:

```md
# Loop State: {name}

phase: NEW            # NEW | PLAN_REVIEW | EXECUTE | VALIDATE | CODE_REVIEW | DONE | BLOCKED
spec: {path or (none)}
plan: {path or (none)}
plan_review_round: 0
code_review_round: 0
blocked_reason: (none)     # DECISION | PLAN_UNRESOLVED | TASK_FAIL | VALIDATION
blocked_question: (none)
answer: (none)             # the human writes their resolution here to unblock
resume_phase: (none)       # phase to return to once unblocked

## Tasks
- T1 [pending] {title}     # status: pending | done | failed:1 | failed:2 | skipped
- T2 [pending] {title}

## Unresolved
(none)                     # blocking findings code-review couldn't fix in 2 rounds

## Log
- tick {n} [{phase}]: {one line — what this tick did}
```

## Protocol — ONE tick

### Step 0: Load or initialize state

1. Compute `{name}` from `$ARGUMENTS`. State path = `SPEC/STATE/{name}.md`.
2. If the state file exists: read it. This is the source of truth — **do not re-read the spec/plan unless the current phase needs it.** Go to Step 1.
3. If it does not exist: the input file must exist (else **STOP**: "File not found"). Create `SPEC/STATE/` if needed. Write a fresh state file with `phase: NEW`, `spec`/`plan` set from the input (a plan input sets `plan:` and leaves `spec: (none)`; a spec input sets `spec:` and leaves `plan: (none)`). Then go to Step 1.

### Step 1: Dispatch on `phase` — do exactly one transition

Spawn subagents via the Agent tool. **Reuse the canonical prompts** — do not re-invent them. After acting, update the state file (set new `phase`, bump rounds, update task statuses, append one `Log` line) and go to Step 2. Each tick spawns **at most two** subagents (a review plus the act it triggers); never more.

**`phase: NEW`**
- If `plan` is set (plan input): parse its `### T{N}:` tasks into the `Tasks` section.
- If `spec` is set (spec input): classify it (**bug** = something broken; **chore** = refactor/cleanup/migration; **feature** = default). Read `~/.claude/commands/plan/{type}.md` and spawn a **planner** (`model: "opus"`) with that command's content, `$ARGUMENTS` = the spec content. Extract the plan path from its report, set `plan:`, parse tasks into `Tasks`.
- **Plan-review gate** (same as run-review): set `phase: PLAN_REVIEW` if the plan was auto-generated here OR `tasks > 2`; otherwise set `phase: EXECUTE` and log `plan-review skipped ({reason})`.

**`phase: PLAN_REVIEW`**
- Read `~/.claude/commands/exec/plan-review.md`. Spawn its **Step 1 reviewer** (`model: "opus"`) with `{plan-file-path}`=`plan`, `{spec-file-path}`=`spec` (or "(none)").
- **PASS** → `phase: EXECUTE`.
- **NEEDS_DECISION** → `phase: BLOCKED`, `blocked_reason: DECISION`, `blocked_question:` = the conflict + options (from the reviewer), `resume_phase: PLAN_REVIEW`. (Per plan-review's all-or-nothing rule, apply no DETERMINED fixes this tick.)
- **NEEDS_WORK, all DETERMINED**, and `plan_review_round < 2` → spawn its **Step 2 reviser** (`model: "sonnet"`) with the DETERMINED findings; `plan_review_round += 1`; re-parse the `Tasks` section from the edited plan (the reviser may have changed task content); stay `phase: PLAN_REVIEW`.
- **NEEDS_WORK** but `plan_review_round >= 2` → `phase: BLOCKED`, `blocked_reason: PLAN_UNRESOLVED`, `blocked_question:` = the remaining findings, `resume_phase: PLAN_REVIEW`.

**`phase: EXECUTE`**
- Pick the next task that is `pending` and whose dependencies (from the plan) are all `done`. If none pending → `phase: VALIDATE`. If pending tasks remain but all are blocked by a `failed:2`/`skipped` dependency → mark them `skipped` and `phase: VALIDATE`.
- Spawn an **implementer** (`subagent_type: "general-purpose"`, `model: "sonnet"`) using `run-review.md`'s **Step 3b** prompt (full task section + scoped test-gate instructions).
  - **SUCCESS** → mark the task `done`.
  - **FAILURE** and task is `pending`/`failed:1` → spawn the **Step 3c diagnostic** (`model: "sonnet"`, the one retry). On its SUCCESS → `done`; on FAILURE → `failed:2`, then `phase: BLOCKED`, `blocked_reason: TASK_FAIL`, `blocked_question:` = the task + last failure, `resume_phase: EXECUTE`.
- Stay `phase: EXECUTE` while pending tasks remain.

**`phase: VALIDATE`**
- Spawn a **validator** (`model: "sonnet"`) running the plan's full Validation Commands (the one full-suite run; report pre-existing env failures separately, per run-review Step 4).
- **PASS** → `phase: CODE_REVIEW`.
- **FAIL** → `phase: BLOCKED`, `blocked_reason: VALIDATION`, `blocked_question:` = the failing output, `resume_phase: VALIDATE`.

**`phase: CODE_REVIEW`**
- Read `~/.claude/commands/exec/review-loop.md`. Spawn its **Step 1 reviewer** (`model: "opus"`) with `{plan-file-path}`=`plan`, `{spec-file-path}`=`spec`.
- **PASS** → `phase: DONE`.
- **NEEDS_WORK** and `code_review_round < 2` → spawn its **Step 2 fixer** (`model: "sonnet"`) with the blocking findings; `code_review_round += 1`; stay `phase: CODE_REVIEW`.
- **NEEDS_WORK** and `code_review_round >= 2` → write the remaining blocking findings to `Unresolved`, `phase: DONE`. (Code review never blocks on a human gate — it records and finishes, same as review-loop.)

**`phase: BLOCKED`**

`answer:` is the **only** unblock signal — the human writes their resolution there. (Editing the plan/code directly also works but is not auto-detected; the prototype watches `answer:`.)

- If `answer` is `(none)`: do nothing. Go to Step 2 (which signals the loop to stop/wait).
- If `answer` is set, resolve per `blocked_reason`, then clear `blocked_reason`/`blocked_question`/`answer` to `(none)`, clear `resume_phase`, and log `unblocked`:
  - **DECISION** or **PLAN_UNRESOLVED** → spawn the `plan-review.md` **Step 2 reviser** (`model: "sonnet"`), passing the `answer` as the determined resolution to apply; re-parse `Tasks` from the edited plan; set `phase: PLAN_REVIEW` (the next tick re-reviews the now-corrected plan).
  - **TASK_FAIL** → reset the failed (`failed:2`) task to `pending` so it is retried, and carry `answer` into the implementer's "Previous Attempt" context as a human hint; set `phase: EXECUTE`.
  - **VALIDATION** → set `phase: VALIDATE` to re-run the suite (assumes the human's `answer` describes a fix they applied or wants a recheck).

**`phase: DONE`** — go straight to Step 2.

### Step 2: Print status + loop marker

Always end with one status line and exactly one marker so the loop knows whether to re-fire:

- Mid-pipeline → `Tick {n} [{phase}]: {what happened}. [LOOP: CONTINUE]`
- Reached a human gate → `BLOCKED ({blocked_reason}): {question summary}. Resolve in {state-path} (set 'answer:') then the loop resumes. [LOOP: BLOCKED]`
- Finished → `Pipeline complete. {tasks done}/{total}, validation {PASS}, review {PASS / UNRESOLVED}. [LOOP: DONE]`

**If you are driving this inside a self-paced `/loop`:** re-fire (schedule the next tick) only on `[LOOP: CONTINUE]`. On `[LOOP: BLOCKED]` schedule a long fallback re-check (the human may answer later) or stop and let the user re-run; on `[LOOP: DONE]` stop.

## Rules

- **One transition per tick.** Read state, advance one step, write state, exit. Never run the whole pipeline in one invocation — that defeats the design.
- **State file is the only memory.** Everything needed to resume lives in `SPEC/STATE/{name}.md`. A tick that crashes loses nothing; the next tick reads the file and continues.
- **Prompts are not duplicated here.** Planner → `plan/{type}.md`; plan review/revise → `plan-review.md` Steps 1–2; implement/diagnose → `run-review.md` Steps 3b/3c; validate → run-review Step 4; code review/fix → `review-loop.md` Steps 1–2. Those files are the single source of truth for prompts and bounds; this file owns only the state machine.
- **Same gates, same bounds as run-review.** Plan review and code review are each capped at 2 rounds. The three human gates (DECISION, TASK_FAIL, VALIDATION) park the run as `BLOCKED` instead of stopping the process — the human resolves on disk and any later tick resumes. Plan-level UNRESOLVED also parks; code-review UNRESOLVED records and finishes.
- **Distillation is structural, not disciplinary.** Heavy work (diffs, test logs, reasoning) lives in subagents; only short reports return; only the small state file persists between ticks. You cannot bloat context across ticks because there is no shared context across ticks.
- **No commits.** Leave all changes uncommitted.
