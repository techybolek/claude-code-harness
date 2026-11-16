# ADR-0002: Ship pipeline = single-context implementer + independent cross-model review

- **Status:** Accepted
- **Date:** 2026-09-18 (evidence 2026-07-28 to 2026-08-02)

## Context
A/B on admin-financial-override (2026-07-28): run-flow (many fresh sonnet agents + review stages) scored 8 vs ralph 7 but cost ~2× (~$60 vs ~$31); ralph shipped a portal-visible bug. `review-flow-only` run over the ralph branch caught 3/4 known bugs including that one, plus 5 others, for ~$10–15. Retro-scoring on 2026-08-02 supported the same split. run-flow's spec mode was found dead on 2026-09-18.

## Decision
`/ralph:ship`: strategic plan → `ralph-flow` (one capable model, sequential fresh-context iterations in an isolated worktree) → `review-flow-only` (ADR-0003) → `fix(review)` commit. run-flow is archived.

## Alternatives
- run-flow (hardening by construction): better quality, ~2× cost, 83M cache-read tokens from many fresh contexts.
- ralph alone: cheaper, ships cross-app bugs with no fresh-eyes review.

## Consequences
- Review is post-hoc, so quality depends on the review panel.
- Open (tuning log): no plan review in the chain; ship commits even when review is UNRESOLVED (fail-closed is roadmap step 1, 2026-10-24).
