# Chore Planning

Create a plan to accomplish the chore described below.

## Output Location

1. From the project root, run `~/.claude/scripts/next-task-number.sh` — it prints a zero-padded `NNNN`, allocated across `SPEC/ACTIVE/` and `SPEC/ARCHIVE/`.
2. Write the plan to `SPEC/ACTIVE/NNNN-<short-kebab-name>/plan.md`.

Same task-dir convention as `/ralph:strategic-plan`, so both harnesses share one inbox and one numbering sequence. Archive finished work with `git mv SPEC/ACTIVE/<task-dir> SPEC/ARCHIVE/`.

## Instructions

- Research the codebase to understand existing patterns before planning.
- Keep it simple and thorough — get it right in one pass.
- Hoist cross-task invariants into a `## Shared Contract` section. If two or more tasks must agree on something — a shared type/enum, a format/rendering convention, an ordering, an API shape — state it ONCE there and have each task reference it. Never let one task assume what another does without instructing that other task to do it.
- Each task's **Tests** field is its gate, scoped to that task's change — name the specific test files/specs to write or run plus the cheapest covering check (typecheck/build). Do NOT write "run the full suite" per task: presentation/config-only tasks gate on build + preserved load-bearing selectors; logic tasks run only the impacted tests. The full suite runs in two places only — a first baseline task (if a green starting point matters) and the end (`Validation Commands`).
- Reference tests by their `describe`/`it` name or file — **never by line number**. Line numbers drift and read as plan defects to the reviewer, generating a fresh finding on every review pass.
- When a behavior change forces several existing tests to change, give the test updates their own task (or a Shared-Contract invariant the test task references) rather than enumerating per-assertion edits inside the behavior task. An overloaded "change behavior + rewrite its tests" task is the most common plan-review non-convergence cause: each adversarial review pass surfaces a new layer of fixes in it faster than the revise loop can drain them.

## Plan Format

```md
# Chore: <chore name>

## Chore Description
<describe the chore in detail>

## Relevant Files
<list files relevant to the chore with brief rationale. New files go under an h3 'New Files' section.>

## Shared Contract
<invariants that span MORE THAN ONE task — properties the tasks must AGREE on: shared types/enums, a format/rendering convention, ordering, API/return shapes. Define each ONCE here; tasks reference it instead of restating or assuming it. Omit this section if no task depends on another task's output convention.>

## Tasks

### T1: <title>
- **What:** <concrete deliverable>
- **Files:** <files to create/modify>
- **Tests:** <the SCOPED gate for THIS task: specific test files/specs to write or run + cheapest covering check (typecheck/build); not the whole suite. Presentation/config-only → build + assert load-bearing selectors preserved.>
- **Done when:** <specific, measurable acceptance criteria>
- **Depends on:** <task IDs, or "none">

<as many tasks as needed — no fixed number>

## Validation Commands
<EXECUTABLE shell commands ONLY — every line here is run verbatim by the validation agent, and a gate that is not a runnable command does not exist. Prose, preconditions, and aspirational gates go under Notes. Commands run the full test suite and confirm no regressions; discover the test runner from CLAUDE.md. All tests must pass.>

## Runtime Verification
<only if the chore touches anything user-visible: steps the validation agent executes LIVE with the playwright-cli skill (route, element/behavior that must render, action, expected observable result). Equal in force to Validation Commands. Keep the set MINIMAL — each step is an LLM-driven browser session re-paid on every validation pass: one happy-path step per touched user-visible surface, plus at most the wiring proofs the compiler cannot see; branch coverage belongs in Validation Commands tests wherever a test layer can express it. Do NOT plan new Playwright .spec.ts files unless this repo's CI actually runs them. Omit for pure refactors/config work.>

## Notes
<additional context, new dependencies, etc.>
```

## Chore
$ARGUMENTS

## Report
- Summarize what you did in concise bullet points.
- Include the path to the plan file.
