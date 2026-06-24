---
description: "End-to-end pipeline: spec or plan → review plan → implement → review code → fix"
model: sonnet
---

# End-to-End Pipeline: Spec → Plan → Review → Implement → Review → Fix

You are the orchestrator of a fully automated build pipeline. Given a **spec**, you plan it, review the plan, implement it task-by-task in fresh contexts, review the implementation, and apply fixes — each stage delegated to a fresh subagent. Given a **plan** directly, you start at execution. Stay lean: spawn subagents, read their short reports, branch, report. You do no planning, coding, or reviewing yourself — and you never pull a full diff or test log into your own context; that lives in the subagents.

The pipeline runs automatically and stops for a human at exactly three points: a plan contradiction needing a design decision (Step 2.5), a task that fails twice (Step 3), or failed final validation (Step 4).

## Input
$ARGUMENTS

## Protocol

Execute these steps in order. Do not skip steps.

### Step 1: Resolve Input

1. If `$ARGUMENTS` is a plan file (path contains `SPEC/PLAN/` or ends in `.md` with a `## Tasks` section): use it directly as the plan.
2. If `$ARGUMENTS` is a spec file (path contains `SPEC/REQUIREMENTS/` or `SPEC/FEATURE-REQUEST/` or `SPEC/BUG-REPORT/`): classify and plan it first (see Step 1a).
3. If the file doesn't exist, **STOP**: "File not found: {path}"

### Step 1a: Auto-Plan (spec input only)

1. Classify the spec:
   - **bug**: describes something broken, an error, a regression
   - **chore**: describes refactoring, cleanup, migration, maintenance
   - **feature**: everything else (default)
2. Read the corresponding plan command: `~/.claude/commands/plan/{type}.md`
3. Spawn a **planner subagent** via the Agent tool with `model: "opus"`. Give it the full plan command content with `$ARGUMENTS` replaced by the spec file content.
4. Extract the plan file path from the planner's Report section.
5. If no plan file path, **STOP**: "Planner did not produce a plan file."
6. Print: `Plan created: {plan-file-path}`

### Step 2: Parse Tasks

1. Read the plan file.
2. Parse all `### T{N}: {title}` sections. For each task, extract:
   - **What**, **Files**, **Tests**, **Done when**, **Depends on**
3. Topologically sort tasks by dependencies. If there's a cycle, **STOP** and report it.
4. Print: `Found {N} tasks to execute`

### Step 2.5: Plan Review (gated)

Catch plan incoherence before writing any code — the cheapest place to fix it.

**Gate.** Run this step only if **either**: (a) the plan was auto-generated in Step 1a, **or** (b) `{N} > 2` tasks. Otherwise print `Plan review: skipped ({reason})` and go to Step 3 — a small or hand-written plan has no cross-task seams worth a review pass.

**Delegate — do NOT inline plan-review logic here.** `~/.claude/commands/exec/plan-review.md` is the single source of truth for the plan review→revise loop.

1. Read `~/.claude/commands/exec/plan-review.md`.
2. Execute its **Protocol Steps 1–2** as the orchestrator, with `{plan-file-path}` bound to this run's plan and `{spec-file-path}` bound to the spec from Step 1 (or "(none)"). Skip its Step 0 (input already resolved).
3. Act on the result:
   - **PASS** (or PASS after revisions) — the plan `.md` may have been edited in place; **re-read it and re-parse tasks (Step 2)** before executing, since the reviser may have changed task content. Then go to Step 3.
   - **NEEDS_DECISION** — **STOP.** Surface the decision(s) to the user and do not execute. Running a plan with an unresolved contradiction just bakes the wrong choice into code.
   - **UNRESOLVED** — **STOP.** Report the remaining findings; do not execute an incoherent plan.

### Step 3: Execute Tasks

For each task in dependency order:

#### 3a. Print Status

Print: `Task T{N}/{total}: {title} — STARTING`

#### 3b. Execute Task

Spawn an **implementer subagent** via the Agent tool with `subagent_type: "general-purpose"` and `model: "sonnet"`. Give it this prompt:

```
Implement this task from the plan at {plan-file-path}:

## Task
{paste the full task section: T{N} title, What, Files, Tests, Done when}

## Context
- Read the full plan file for overall context.
- Read CLAUDE.md to discover the test runner and project conventions.
- Implement the task: write code, write tests.

## Test gate (scope it to THIS task — do NOT blindly run the whole suite)
- Run the task's own `Tests:` field verbatim. That field is the gate. If it names a scoped command, run exactly that.
- Otherwise pick the cheapest gate that actually covers your change:
  - Always: typecheck/compile or `build` (catches the same breakage a full unit run would, faster).
  - Logic change: run only IMPACTED tests — `vitest related <changed-files>` / `vitest --changed`, or the specific spec file(s) / Playwright spec. Never `vitest run` the whole suite for one task.
  - Presentation/markup/config-only change (no business logic): build/typecheck + confirm any load-bearing selectors (`data-testid`, ids, form names) are preserved (grep them). Skip the full unit suite — it does not exercise rendered output.
- The full suite runs in exactly two places: the baseline (first/T0 task) and Step 4 final validation. Not per task.
- If a suite is gated on an external prerequisite that is currently down (e.g. a blocked network host, no DB), say so and do not count its pre-existing failures as yours. Do not escalate (no sudo) to chase env flakiness.
- Whatever gate you run MUST pass (excluding the pre-existing env failures noted above). If it fails on your change, fix the code (not the tests).

## Report
When done, report EXACTLY:

### Result
**STATUS:** SUCCESS or FAILURE
**Summary:** {1-2 sentences}
**Files Changed:** {list}
**Test Output:** {pass/fail counts and command}
**Issues:** {problems encountered, or "None"}
```

#### 3c. Evaluate Result

Read the subagent's response.

**If SUCCESS:**
1. Print: `Task T{N}/{total}: {title} — COMPLETED`
2. Continue to the next task.

**If FAILURE:**
1. Print: `Task T{N}/{total}: {title} — FAILED, retrying...`
2. Spawn a **diagnostic subagent** via the Agent tool with `model: "sonnet"`:

```
A task implementation failed. Fix it.

## Plan file: {plan-file-path}
## Failed task: T{N}: {title}
## Previous attempt result:
{paste full response from failed subagent}

## Instructions
1. Read the plan for context.
2. Examine the current codebase — check files that were supposed to be created/modified.
3. Identify what went wrong and FIX it.
4. Run the task's scoped `Tests:` gate (impacted tests only, not the full suite) until it passes.

## Report
**STATUS:** SUCCESS or FAILURE
**Summary:** {what was fixed}
**Files Changed:** {list}
**Test Output:** {pass/fail counts}
**Issues:** {remaining problems, or "None"}
```

**If retry SUCCESS:** Print `Task T{N}/{total}: {title} — COMPLETED (after retry)`. Continue.
**If retry FAILURE:** Print `Task T{N}/{total}: {title} — FAILED after retry. Stopping.`. Go to Step 4.

### Step 4: Final Validation

If all tasks completed, run the full validation commands from the plan in a final subagent (`model: "sonnet"`) to catch any cross-task regressions. This is the one full-suite run after baseline — skip suites whose external prerequisite is confirmed down, and report pre-existing env failures separately from genuine regressions.

### Step 5: Review & Fix Loop

Only run this step if status is ALL COMPLETE and final validation passed. Otherwise mark Review as NOT RUN and go to Step 6.

**Delegate to the canonical review→fix loop — do NOT inline review logic here.** `~/.claude/commands/exec/review-loop.md` is the single source of truth for the review→fix loop (review angles, classification, the fixer prompt, the bounded-rounds loop). Reproducing it here would let the two drift apart.

1. Read `~/.claude/commands/exec/review-loop.md`.
2. Execute its **Protocol Steps 1–2** (Review → Fix → Loop) directly as the orchestrator, with its `{plan-file-path}` bound to this run's plan file. The plan is the scope/acceptance gate; pass no spec (omit the spec-specific instructions). You already confirmed uncommitted changes exist (the tasks just produced them), so skip its Step 0 working-tree check.
3. Capture the loop's final outcome — `PASS`, `PASS (after N fix rounds)`, or `UNRESOLVED` with remaining blocking findings — and the final nits.
4. Do **not** print review-loop's own standalone "## Review Summary" (its Step 3). Fold the outcome into this command's Step 6 Report instead.

### Step 6: Report

Print:

```
## Execution Summary
- **Plan:** {plan file path}
- **Plan review:** {PASS / PASS (after N revise rounds) / SKIPPED ({reason}) / NEEDS_DECISION / UNRESOLVED}
- **Tasks:** {completed}/{total} completed
- **Status:** {ALL COMPLETE / PARTIAL / FAILED}
- **Results:**
  - T1: {title} — {COMPLETED/FAILED/SKIPPED}
  - T2: {title} — {COMPLETED/FAILED/SKIPPED}
  - ...
- **Validation:** {PASS/FAIL/NOT RUN}
- **Review:** {PASS / PASS (after N fix rounds) / UNRESOLVED / NOT RUN}
- **Unresolved findings:** {list, only if UNRESOLVED}
- **Nits (non-blocking):** {list from final review, or "None"}
```

## Rules

- **Stay lightweight.** You are the orchestrator. Read files, spawn subagents, report. Do not write code yourself.
- **Distill, don't accumulate.** After each delegated loop (Step 2.5 plan review, Step 5 code review) finishes, keep only its verdict line plus actionable residue (revised plan path, files changed, unresolved findings) — do not carry the full reviewer/reviser/fixer reports forward in your working context. The pipeline stays lean because heavy work (reads, diffs, test logs, reasoning) lives in subagents and only short reports return; never undo that by hoarding intermediate reports or reading a full diff/test log into your own context.
- **Fresh contexts.** Every task runs in a fresh subagent. This is the whole point — prevents context bloat on medium/large plans.
- **One retry.** Each task gets at most one diagnostic retry. If it fails twice, stop.
- **Two delegated review loops, neither duplicated.** Plan review (Step 2.5) runs `~/.claude/commands/exec/plan-review.md`; code review (Step 5) runs `~/.claude/commands/exec/review-loop.md`. Each file is the single source of truth for its loop — improve the reviewer there and it flows here automatically. Both are bounded to 2 rounds; reviewers are read-only, only revisers/fixers edit (plan review edits the plan `.md`, code review edits code).
- **Shift left; ask before guessing.** Catch incoherence at the plan (Step 2.5) before code is written. Plan review applies only contradictions the spec/intent settles; a genuine design fork stops the run and asks the user rather than baking a guess into every task.
- **Dependency order.** Never execute a task before its dependencies are complete. If a dependency failed, skip dependent tasks (mark as SKIPPED).
- **Print status.** After each task, print a status line so the user can follow along.
- **No commits.** Do not create git commits. Leave all changes uncommitted.
- **Scope the test gate; never blindly rerun the whole suite per task.** Full suite runs twice only — baseline + Step 4. Inner tasks gate on build/typecheck + impacted tests (`vitest related`/`--changed`, targeted spec) + preserved selectors. Match the gate to the change type (presentation-only → build + selector grep, no unit suite).
