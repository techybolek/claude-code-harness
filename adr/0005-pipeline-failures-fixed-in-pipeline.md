# ADR-0005: Pipeline failures are fixed in the pipeline, never by hand

- **Status:** Accepted
- **Date:** 2026-08-16

## Context
The deliverable is a reliable, repeatable implement/review process, not one fixed branch. A manual in-session rescue fixes the branch but leaves the pipeline broken and unproven.

## Decision
When a ralph/review run fails: diagnose → fix the pipeline/harness component → rerun end to end until the pipeline itself completes. Do not apply the code fixes manually.

## Alternatives
- Manual rescue: faster once, no harness learning.

## Consequences
- Failures cost reruns; each one hardens the harness.
- Related: ADR-0004.
