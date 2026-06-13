---
description: "Execute Plan: Task-by-Task in Fresh Contexts"
model: sonnet
---

# Execute Plan: Task-by-Task in Fresh Contexts

You are an orchestrator. Your job is to execute a plan by running each task in a fresh subagent context. Stay lightweight — you read the plan, spawn subagents, track results, and report. You do no coding yourself.

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

### Step 5: Report

Print:

```
## Execution Summary
- **Plan:** {plan file path}
- **Tasks:** {completed}/{total} completed
- **Status:** {ALL COMPLETE / PARTIAL / FAILED}
- **Results:**
  - T1: {title} — {COMPLETED/FAILED/SKIPPED}
  - T2: {title} — {COMPLETED/FAILED/SKIPPED}
  - ...
- **Validation:** {PASS/FAIL/NOT RUN}
```

## Rules

- **Stay lightweight.** You are the orchestrator. Read files, spawn subagents, report. Do not write code yourself.
- **Fresh contexts.** Every task runs in a fresh subagent. This is the whole point — prevents context bloat on medium/large plans.
- **One retry.** Each task gets at most one diagnostic retry. If it fails twice, stop.
- **Dependency order.** Never execute a task before its dependencies are complete. If a dependency failed, skip dependent tasks (mark as SKIPPED).
- **Print status.** After each task, print a status line so the user can follow along.
- **No commits.** Do not create git commits. Leave all changes uncommitted.
- **Scope the test gate; never blindly rerun the whole suite per task.** Full suite runs twice only — baseline + Step 4. Inner tasks gate on build/typecheck + impacted tests (`vitest related`/`--changed`, targeted spec) + preserved selectors. Match the gate to the change type (presentation-only → build + selector grep, no unit suite).
