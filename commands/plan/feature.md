# Feature Planning

Create a plan in `SPEC/PLAN/*.md` to implement the feature described below.

## Instructions

- Research the codebase to understand existing patterns, architecture, and conventions.
- Follow existing patterns. Don't reinvent the wheel.
- Hoist cross-task invariants into a `## Shared Contract` section. If two or more tasks must agree on something — a shared type/enum, a rendering or formatting convention sibling outputs must match, an ordering, an API shape — state it ONCE there and have each task reference it. Never let one task *assume* what another task does without instructing that other task to do it (that contradiction is invisible to per-task implementers and is the most common plan defect).
- Each task's **Tests** field is its gate, scoped to that task's change — name the specific test files/specs to write or run plus the cheapest covering check (typecheck/build). Do NOT write "run the full suite" per task: presentation/config-only tasks gate on build + preserved load-bearing selectors (`data-testid`, ids, form names); logic tasks run only the impacted tests (`vitest related`/`--changed`, the specific spec). The full suite runs in two places only — a first baseline task (if a green starting point matters) and the end (`Validation Commands`).
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
<commands to run the full test suite and confirm no regressions. Discover the test runner from CLAUDE.md. Include end-to-end testing. All tests must pass.>

## Notes
<additional context, future considerations, new dependencies, etc.>
```

## Feature
$ARGUMENTS

## Report
- Summarize what you did in concise bullet points.
- Include the path to the plan file.
