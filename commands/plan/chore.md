# Chore Planning

Create a plan in `SPEC/PLAN/*.md` to accomplish the chore described below.

## Instructions

- Research the codebase to understand existing patterns before planning.
- Keep it simple and thorough — get it right in one pass.
- Each task must include its tests. A task is not done until its tests pass with no regressions.

## Plan Format

```md
# Chore: <chore name>

## Chore Description
<describe the chore in detail>

## Relevant Files
<list files relevant to the chore with brief rationale. New files go under an h3 'New Files' section.>

## Tasks

### T1: <title>
- **What:** <concrete deliverable>
- **Files:** <files to create/modify>
- **Tests:** <test files to write, what they assert>
- **Done when:** <specific, measurable acceptance criteria>
- **Depends on:** <task IDs, or "none">

<as many tasks as needed — no fixed number>

## Validation Commands
<commands to run the full test suite and confirm no regressions. Discover the test runner from CLAUDE.md. All tests must pass.>

## E2E Testing
If the chore needs E2E verification, create a test command in `.claude/commands/e2e/` and execute via `/test_e2e` using `playwright-cli`. Do NOT write .spec.ts files.

## Notes
<additional context, new dependencies, etc.>
```

## Chore
$ARGUMENTS

## Report
- Summarize what you did in concise bullet points.
- Include the path to the plan file.
