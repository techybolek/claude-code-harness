# ADR-0001: Record harness decisions as ADRs

- **Status:** Accepted
- **Date:** 2026-11-15

## Context
Decision rationale is scattered across feedback memories, `notes/harness-tuning-log.md` verdicts and specs. Memories load into every session, so long rationale there costs context, and an absolute rule without its reason gets applied too broadly. Agents (and the planned harness steward) need to know which choices are deliberate so they don't "fix" them.

## Decision
Deliberate, hard-to-reverse harness decisions get a short ADR in `adr/NNNN-title.md`. ADRs are immutable: a changed decision gets a new ADR that supersedes the old one, and the old one's status is updated. `index.md` lists ADRs in force. Memories that state a rule keep one line and link the ADR.

## Alternatives
- Keep rationale in memories: always-loaded, no supersession trail.
- Tuning log only: chronological, hard to tell what is still in force.

## Consequences
- An ADR that is no longer true misleads agents, so superseding it is mandatory when the decision changes.
- Routine choices do not get ADRs.
