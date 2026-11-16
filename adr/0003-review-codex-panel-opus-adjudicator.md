# ADR-0003: Code review = 3 parallel codex lens reviewers + one Opus adjudicator

- **Status:** Accepted
- **Date:** 2026-09-04

## Context
Review must be independent of the implementing model and must fix, not only report.

## Decision
`review-flow-only.js` runs codex reviewers on lenses `correctness`, `resilience`, `tests` in parallel (round 1), then one Opus adjudicator (full model ID, effort high) that judges findings and applies fixes; rounds 2+ use a single codex re-reviewer until plateau. Haiku seats are thin wrappers that build the codex prompt and transcribe its report; they are not reviewers. `commands/exec/review-panel.md` and `review-loop.md` are deprecated as commands but remain the prompt source the wrappers paste into codex (codex can't read `~/.claude`), so editing them changes codex's prompt. Fireworks is the fallback when codex is unavailable.

## Alternatives
- Same-family Claude reviewers: correlated blind spots.
- Report-only panel: leaves fixing to the user, breaking ADR-0004.

## Consequences
- Do not read the `haiku` pins as "Haiku reviews".
- Do not delete the two md files while the workflow reads them.
