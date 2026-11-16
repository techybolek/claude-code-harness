# ADR-0004: The spec is the decision boundary; pipeline runs are autonomous

- **Status:** Accepted
- **Date:** 2026-07-25 (extended 2026-07-26)

## Context
Specs are written interactively with the user, so user decisions are captured there. Mid-run questions stall the pipeline, and the user often lacks context for internal contract/rigor questions. Specs will always have gaps.

## Decision
Once plan → implement → validate → review starts, it runs to completion without escalating to the user. Disputes (severity, rigor, scope) resolve against the spec; unrequested rigor is YAGNI. The pipeline absorbs spec defects itself (capable reviser/adjudicator); specs are not hand-fixed to force convergence.

## Alternatives
- Mid-run AskUserQuestion gates: defeat autonomy.
- Hand-curating specs until the pipeline converges: outsources the hard job to a human, never ends.

## Consequences
- Paying a review round to re-derive a spec gap is accepted cost.
- Persisting reviewer-derived resolutions across re-plans is a legitimate future lever; per-spec manual edits are not.
- Confirm-first still applies to harness edits (ADR-0006).
