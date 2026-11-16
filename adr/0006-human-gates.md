# ADR-0006: Human gates on global harness edits and commits

- **Status:** Accepted
- **Date:** 2026-07-24 (harness edits), 2026-10-28 (commits)

## Context
Global files (`~/.claude/workflows`, `commands`, shared skills) affect every project and are under active tuning. An unrequested workflow edit (2026-07-24) and an unrequested commit (2026-10-28) were both rejected.

## Decision
- Global harness edits are confirm-first: propose the concrete diff, wait for an explicit yes. Discussing an optimization is not authorization.
- Never commit without an explicit yes for that specific commit; an earlier yes does not carry over. Leave changes uncommitted for review.
- Project files that were the agreed topic may be edited once the conversation converges on "do it".

## Alternatives
- Agent autonomy over harness files: faster, but unreviewed drift in shared infrastructure.

## Consequences
- Applies to the planned harness steward: it proposes, the user approves, nothing is committed.
- Does not apply to in-pipeline decisions (ADR-0004); `/ralph:ship` commits on its own branch by design.
