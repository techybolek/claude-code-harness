# Bug Planning

Create a plan in `SPEC/PLAN/*.md` to fix the bug described below.

## Instructions

- Research the codebase to understand and reproduce the bug.
- Be surgical — fix the root cause with minimal changes. Don't scope-creep.
- Include creating/updating automated tests as explicit steps in the plan. The task is not done until all tests pass with no regressions.
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

## Step by Step Tasks
<h3 headers with bullet points, ordered foundationally. Include steps to create/update automated tests that cover the fix. Last step: run the Validation Commands.>

## Validation Commands
<commands to run the full test suite and confirm no regressions. Include reproduction before/after. Discover the test runner from CLAUDE.md. All tests must pass.>

## Notes
<additional context, new dependencies, etc.>
```

## Bug
$ARGUMENTS

## Report
- Summarize what you did in concise bullet points.
- Include the path to the plan file.
