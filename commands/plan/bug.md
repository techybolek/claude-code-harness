# Bug Planning

Create a plan in `SPEC/PLAN/*.md` to fix the bug described below.

## Instructions

- Research the codebase to understand and reproduce the bug.
- Be surgical — fix the root cause with minimal changes. Don't scope-creep.
- If the fix spans more than one task and they must agree on something (a shared type, a format/rendering convention, an ordering), hoist that invariant into a `## Shared Contract` section and have each task reference it — never let one task assume what another does without instructing it. (Single-task fixes can omit the section.)
- Each task's **Tests** field is its gate, scoped to that task's change — name the specific test files/specs (a bug fix should include a regression test that fails before / passes after) plus the cheapest covering check (typecheck/build). Do NOT write "run the full suite" per task; run only the impacted tests. The full suite runs in two places only — a first baseline task (if a green starting point matters) and the end (`Validation Commands`).
- Reference tests by their `describe`/`it` name or file — **never by line number**. Line numbers drift and read as plan defects to the reviewer, generating a fresh finding on every review pass.
- When a behavior change forces several existing tests to change, give the test updates their own task (or a Shared-Contract invariant the test task references) rather than enumerating per-assertion edits inside the behavior task. An overloaded "change behavior + rewrite its tests" task is the most common plan-review non-convergence cause: each adversarial review pass surfaces a new layer of fixes in it faster than the revise loop can drain them.
- If you need a new library, note it in the `Notes` section.

## Plan Format

```md
# Bug: <bug name>

## Bug Description
<describe the bug: symptoms, expected vs actual behavior>

## Problem Statement
<the specific problem to solve>

## Solution Statement
<proposed fix approach>

## Steps to Reproduce
<exact reproduction steps>

## Root Cause Analysis
<what's actually causing the bug>

## Relevant Files
<list files relevant to the bug with brief rationale. New files go under an h3 'New Files' section.>

## Shared Contract
<invariants that span MORE THAN ONE task — properties the tasks must AGREE on: shared types/enums, a format/rendering convention, ordering, API/return shapes. Define each ONCE here; tasks reference it instead of restating or assuming it. Omit this section for single-task fixes or when no task depends on another's output convention.>

## Tasks

### T1: <title>
- **What:** <concrete deliverable>
- **Files:** <files to create/modify>
- **Tests:** <the SCOPED gate for THIS task: specific test files/specs to write or run + cheapest covering check (typecheck/build); not the whole suite. Presentation/config-only → build + assert load-bearing selectors preserved.>
- **Done when:** <specific, measurable acceptance criteria>
- **Depends on:** <task IDs, or "none">

<as many tasks as needed — no fixed number>

## Validation Commands
<EXECUTABLE shell commands ONLY — every line here is run verbatim by the validation agent, and a gate that is not a runnable command does not exist. Prose, preconditions, and aspirational gates go under Notes. Commands run the full test suite and confirm no regressions; include reproduction before/after. Discover the test runner from CLAUDE.md. All tests must pass.>

## Runtime Verification
<REQUIRED when the bug (or its fix) is user-visible; omit otherwise. Steps the validation agent executes LIVE with the playwright-cli skill — route to open, element/behavior that must actually render, action to perform, expected observable result (typically: reproduce the reported symptom's path and observe it fixed). Equal in force to Validation Commands: a step that cannot be executed fails validation. Keep the set MINIMAL — each step is an LLM-driven browser session re-paid on every validation pass: the symptom's path, plus at most the wiring proofs the compiler cannot see. Additional branch/edge steps earn a place ONLY when they own an acceptance criterion no automated test in this repo can cover — the regression test in Validation Commands owns branch coverage wherever a test layer can express it. Do NOT plan new Playwright .spec.ts files unless this repo's CI actually runs them — an authored-but-never-run spec is a fake gate.>

## Notes
<additional context, new dependencies, etc.>
```

## Bug
$ARGUMENTS

## Report
- Summarize what you did in concise bullet points.
- Include the path to the plan file.
