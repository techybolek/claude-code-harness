# Archived commands

Commands with zero invocations in the transcript window (2026-08-05 → 2026-09-04)
and no inbound references from any other command, skill, or workflow.

Archived 2026-09-04. Not listed by Claude Code while they live here.

To restore one:

    git mv commands-archive/<ns>/<name>.md commands/<ns>/<name>.md

Deliberately NOT archived despite zero invocations — each is called by something live:

| Command | Called by |
|---|---|
| `exec:review-loop`, `exec:review-panel` | `ralph:continue-dev` |
| `ralph:flow` | `spec:advanced-discovery`, `workflows/ralph-flow.js` |
| `spec:advanced-discovery` | `workflows/discovery-flow.js` |
| `exec:run`, `exec:run-flow` | entry points for the `run-review-flow` workflow |
| `ralph:ralph` | README only; kept as the namesake of the ralph pipeline |
