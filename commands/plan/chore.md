# Chore Planning

Create a plan in `SPEC/PLAN/*.md` to accomplish the chore described below.

## Instructions

- Research the codebase to understand existing patterns before planning.
- Keep it simple and thorough — get it right in one pass.
- Each task's **Tests** field is its gate, scoped to that task's change — name the specific test files/specs to write or run plus the cheapest covering check (typecheck/build). Do NOT write "run the full suite" per task: presentation/config-only tasks gate on build + preserved load-bearing selectors; logic tasks run only the impacted tests. The full suite runs in two places only — a first baseline task (if a green starting point matters) and the end (`Validation Commands`).

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
- **Tests:** <the SCOPED gate for THIS task: specific test files/specs to write or run + cheapest covering check (typecheck/build); not the whole suite. Presentation/config-only → build + assert load-bearing selectors preserved.>
- **Done when:** <specific, measurable acceptance criteria>
- **Depends on:** <task IDs, or "none">

<as many tasks as needed — no fixed number>

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
