# Bug Planning

Create a plan in `SPEC/PLAN/*.md` to fix the bug described below.

## Instructions

- Research the codebase to understand and reproduce the bug.
- Be surgical — fix the root cause with minimal changes. Don't scope-creep.
- Each task must include its tests. A task is not done until its tests pass with no regressions.
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

## Tasks

### T1: <title>
- **What:** <concrete deliverable>
- **Files:** <files to create/modify>
- **Tests:** <test files to write, what they assert>
- **Done when:** <specific, measurable acceptance criteria>
- **Depends on:** <task IDs, or "none">

<as many tasks as needed — no fixed number>

## Validation Commands
<commands to run the full test suite and confirm no regressions. Include reproduction before/after. Discover the test runner from CLAUDE.md. All tests must pass.>

## E2E Testing
If the bug needs E2E verification, create a test command in `.claude/commands/e2e/` and execute via `/test_e2e` using `playwright-cli`. Do NOT write .spec.ts files.

## Notes
<additional context, new dependencies, etc.>
```

## Bug
$ARGUMENTS

## Report
- Summarize what you did in concise bullet points.
- Include the path to the plan file.
