# New Project Planning

Create a plan to build the project described below.

## Output Location

1. From the project root, run `~/.claude/scripts/next-task-number.sh` — it prints a zero-padded `NNNN`, allocated across `SPEC/ACTIVE/` and `SPEC/ARCHIVE/`.
2. Write the plan to `SPEC/ACTIVE/NNNN-<short-kebab-name>/plan.md`.

Same task-dir convention as `/ralph:strategic-plan`, so both harnesses share one inbox and one numbering sequence. Archive finished work with `git mv SPEC/ACTIVE/<task-dir> SPEC/ARCHIVE/`.

## Instructions

- Define a clean, simple architecture appropriate for the project scope.
- Keep it simple — build only what's needed initially.
- Each task's **Tests** field is its gate, scoped to that task's change — name the specific test files/specs to write or run plus the cheapest covering check (typecheck/build). Do NOT write "run the full suite" per task: presentation/config-only tasks gate on build + preserved load-bearing selectors; logic tasks run only the impacted tests. The full suite runs at the end (`Validation Commands`).
- List required dependencies in the `Notes` section.

## Plan Format

```md
# Project: <project name>

## Project Description
<what the project does and why it's valuable>

## Problem Statement
<the problem or need this project addresses>

## Solution Approach
<proposed approach>

## Requirements
<functional and non-functional requirements>

## Design Decisions
<key design decisions, trade-offs, and rationale>

## Project Structure
<directory structure and files with brief descriptions>

## Tasks

### T1: <title>
- **What:** <concrete deliverable>
- **Files:** <files to create/modify>
- **Tests:** <the SCOPED gate for THIS task: specific test files/specs to write or run + cheapest covering check (typecheck/build); not the whole suite. Presentation/config-only → build + assert load-bearing selectors preserved.>
- **Done when:** <specific, measurable acceptance criteria>
- **Depends on:** <task IDs, or "none">

<as many tasks as needed — no fixed number>

## Validation Commands
<commands to run the full test suite. All tests must pass.>

## Notes
<additional context, dependencies, etc.>
```

## Project
$ARGUMENTS

## Report
- Summarize what you did in concise bullet points.
- Include the path to the plan file.
