# Feature Planning

Create a plan in `SPEC/PLAN/*.md` to implement the feature described below.

## Instructions

- Research the codebase to understand existing patterns, architecture, and conventions.
- Follow existing patterns. Don't reinvent the wheel.
- Hoist cross-task invariants into a `## Shared Contract` section. If two or more tasks must agree on something — a shared type/enum, a rendering or formatting convention sibling outputs must match, an ordering, an API shape — state it ONCE there and have each task reference it. Never let one task *assume* what another task does without instructing that other task to do it (that contradiction is invisible to per-task implementers and is the most common plan defect).
- Each task's **Tests** field is its gate, scoped to that task's change — name the specific test files/specs to write or run plus the cheapest covering check (typecheck/build). Do NOT write "run the full suite" per task: presentation/config-only tasks gate on build + preserved load-bearing selectors (`data-testid`, ids, form names); logic tasks run only the impacted tests (`vitest related`/`--changed`, the specific spec). The full suite runs in two places only — a first baseline task (if a green starting point matters) and the end (`Validation Commands`).
- Reference tests by their `describe`/`it` name or file — **never by line number**. Line numbers drift and read as plan defects to the reviewer, generating a fresh finding on every review pass.
- When a behavior change forces several existing tests to change, give the test updates their own task (or a Shared-Contract invariant the test task references) rather than enumerating per-assertion edits inside the behavior task. An overloaded "change behavior + rewrite its tests" task is the most common plan-review non-convergence cause: each adversarial review pass surfaces a new layer of fixes in it faster than the revise loop can drain them.
- UI-facing acceptance criteria are gated by the `Runtime Verification` section — live playwright-cli steps the validation agent executes against the running app — never by authored Playwright `.spec.ts` files unless this repo's CI actually runs them. An authored-but-never-run spec is a fake gate: it skips silently and passes by omission, while build/tsc cannot see framework wiring (DI, routing, template rendering) by construction.
- Produce as many or as few tasks as the work requires. Don't force structure.

## Plan Format

```md
# Feature: <feature name>

## Feature Description
<describe the feature: purpose and value to users>

## User Story
As a <type of user>
I want to <action/goal>
So that <benefit/value>

## Problem Statement
<the problem or opportunity this feature addresses>

## Solution Approach
<proposed approach and how it solves the problem>

## Relevant Files
<list files relevant to the feature with brief rationale. New files go under an h3 'New Files' section.>

## Shared Contract
<invariants that span MORE THAN ONE task — properties the tasks must AGREE on: a shared type/enum, a rendering or formatting convention that sibling outputs must match, an ordering, an API/return shape. Define each ONCE here; tasks reference it instead of restating or assuming it. Omit this section only if no task depends on another task's output convention.>

## Tasks

### T1: <title>
- **What:** <concrete deliverable>
- **Files:** <files to create/modify>
- **Tests:** <the SCOPED gate for THIS task: specific test files/specs to write or run + cheapest covering check (typecheck/build); not the whole suite. Presentation/config-only → build + assert load-bearing selectors preserved.>
- **Done when:** <specific, measurable acceptance criteria>
- **Depends on:** <task IDs, or "none">

### T2: <title>
- **What:** <concrete deliverable>
- **Files:** <files to create/modify>
- **Tests:** <the SCOPED gate for THIS task: specific test files/specs to write or run + cheapest covering check (typecheck/build); not the whole suite. Presentation/config-only → build + assert load-bearing selectors preserved.>
- **Done when:** <specific, measurable acceptance criteria>
- **Depends on:** <task IDs, or "none">

<as many tasks as needed — no fixed number>

## Acceptance Criteria
<overall feature-level criteria — the feature is complete when ALL of these are true>

## Validation Commands
<EXECUTABLE shell commands ONLY — every line here is run verbatim by the validation agent, and a gate that is not a runnable command does not exist (a "# Frontend E2E ..." comment inside this block was once silently skipped and a feature shipped that never rendered). Prose, preconditions, and aspirational gates go under Notes. Commands run the full test suite and confirm no regressions; discover the test runner from CLAUDE.md. All tests must pass.>

## Runtime Verification
<REQUIRED whenever the feature changes anything user-visible; omit only when nothing user-visible changed. Steps the validation agent executes LIVE with the playwright-cli skill — for each step: the route to open, the element/behavior that must actually render, the action to perform, the expected observable result. These gates are equal in force to Validation Commands: a step that cannot be executed fails validation.>

## Notes
<additional context, future considerations, new dependencies, etc.>
```

## Feature
$ARGUMENTS

## Report
- Summarize what you did in concise bullet points.
- Include the path to the plan file.
