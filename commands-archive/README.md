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
- `exec/review-loop.md`, `exec/review-panel.md` — the review stage is `review-flow-only`
  (opus adjudicator); their two-seat triage/fixer policy had diverged from it. The part
  still in use — codex reviewer prompt, lenses, committed-range mode — moved to
  `scripts/review/prompts/CODE_REVIEW_POLICY.md`.
- `ralph/ralph.md` — `/ralph:ship` / `/ralph:flow` replaced the bash loop as the entry
  point. `scripts/ralph/ralph.sh` and `ralph-pipeline.sh` stay for terminal use and
  `ralph.sh --cleanup`; `/ralph:flow` now reviews via `review-flow-only` directly.
- `plan/bug.md` — last of the `### T{N}` planners (siblings archived 09-04); no executor
  reads its output. Bugs go `/spec:bug-report` → `/ralph:ship`; its regression-test and
  surgical-fix rules moved into `ralph/strategic-plan.md`.
- `ralph/flow.md` — `/ralph:ship` now resumes a started spec itself (skips the task
  folder, reuses the worktree), which was flow's only remaining job.

To restore one:

    git mv commands-archive/<ns>/<name>.md commands/<ns>/<name>.md

Deliberately NOT archived despite zero invocations — each is called by something live:

| Command | Called by |
|---|---|
| `spec:advanced-discovery` | `workflows/discovery-flow.js` |
