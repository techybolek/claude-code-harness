# Archived commands

Commands with zero invocations in the transcript window (2026-08-05 → 2026-09-04)
and no inbound references from any other command, skill, or workflow.

Archived 2026-09-04. Not listed by Claude Code while they live here.

## Archived 2026-09-18 — the run-flow pipeline

`exec/run-flow.md`, `workflows/run-review-flow.js`, `workflows/parse-plan.cjs`.
Its spec mode delegated planning to `plan/feature.md` / `plan/chore.md`, archived
above on 09-04, so a feature spec failed at the planner; and its parser only
accepts flat `### T{N}` task headings, while `/ralph:strategic-plan` (the planner
actually in use) emits phases plus `tasks.md`. Successor: `/ralph:ship`
(strategic-plan → ralph-flow in a worktree → review-flow-only with `repoRoot`).
The 2026-07-28 A/B notes in `notes/harness-tuning-log.md` still describe what
run-flow did well (plan review, parallel waves, write-time hardening).

## Archived 2026-09-23 — post-ship cleanup

- `exec/run.md`, `scripts/run_plan.py` — executors of the `### T{N}` plan format.
  Nothing produces it any more (`/ralph:strategic-plan` emits phases + `tasks.md`).

To restore one:

    git mv commands-archive/<ns>/<name>.md commands/<ns>/<name>.md

Deliberately NOT archived despite zero invocations — each is called by something live:

| Command | Called by |
|---|---|
| `exec:review-loop`, `exec:review-panel` | `ralph:continue-dev` |
| `ralph:flow` | `spec:advanced-discovery`, `workflows/ralph-flow.js` |
| `spec:advanced-discovery` | `workflows/discovery-flow.js` |
| `ralph:ralph` | README only; kept as the namesake of the ralph pipeline |
