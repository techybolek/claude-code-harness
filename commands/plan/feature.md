# Feature Planning

Create a plan in `SPEC/PLAN/*.md` to implement the feature described below.

## Instructions

- Research the codebase to understand existing patterns, architecture, and conventions.
- Follow existing patterns. Don't reinvent the wheel.
- Each task must include its tests. A task is not done until its tests pass with no regressions.
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

## Tasks

### T1: <title>
- **What:** <concrete deliverable>
- **Files:** <files to create/modify>
- **Tests:** <test files to write, what they assert>
- **E2E:** <if this task needs E2E verification, describe the test steps here. E2E tests are executed interactively via `playwright-cli`, NOT as .spec.ts files. If an E2E command file is needed, create it in `.claude/commands/e2e/`. Otherwise write "none".>
- **Done when:** <specific, measurable acceptance criteria>
- **Depends on:** <task IDs, or "none">

### T2: <title>
- **What:** <concrete deliverable>
- **Files:** <files to create/modify>
- **Tests:** <test files to write, what they assert>
- **E2E:** <see above>
- **Done when:** <specific, measurable acceptance criteria>
- **Depends on:** <task IDs, or "none">

<as many tasks as needed — no fixed number>

## Acceptance Criteria
<overall feature-level criteria — the feature is complete when ALL of these are true>

## Validation Commands
<commands to run the full test suite and confirm no regressions. Discover the test runner from CLAUDE.md. All tests must pass.>

## E2E Testing
E2E tests in this project are interactive `playwright-cli` sessions, NOT .spec.ts files. If the feature needs E2E coverage:
1. Create a test command file in `.claude/commands/e2e/<test_name>.md` with User Story, Test Steps, and Success Criteria.
2. Execute it via `/test_e2e` which runs the steps interactively with `playwright-cli`.
Do NOT generate Playwright .spec.ts test files for E2E testing.

## Notes
<additional context, future considerations, new dependencies, etc.>
```

## Feature
$ARGUMENTS

## Report
- Summarize what you did in concise bullet points.
- Include the path to the plan file.
