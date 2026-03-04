# Chore Planning

Create a plan in `SPEC/PLAN/*.md` to accomplish the chore described below.

## Instructions

- Research the codebase to understand existing patterns before planning.
- Keep it simple and thorough — get it right in one pass.
- Include creating/updating automated tests as explicit steps in the plan. The task is not done until all tests pass with no regressions.

## Plan Format

```md
# Chore: <chore name>

## Chore Description
<describe the chore in detail>

## Relevant Files
<list files relevant to the chore with brief rationale. New files go under an h3 'New Files' section.>

## Step by Step Tasks
<h3 headers with bullet points, ordered foundationally. Include steps to create/update automated tests that cover the changes. Last step: run the Validation Commands.>

## Validation Commands
<commands to run the full test suite and confirm no regressions. Discover the test runner from CLAUDE.md. All tests must pass.>

## Notes
<additional context, new dependencies, etc.>
```

## Chore
$ARGUMENTS

## Report
- Summarize what you did in concise bullet points.
- Include the path to the plan file.
