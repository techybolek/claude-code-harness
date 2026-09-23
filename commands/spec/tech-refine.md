---
description: Deepen a refined feature spec with the technical design (the HOW)
---

Take a refined feature spec (output of `/spec:refine`) and add the technical design an implementer needs: the HOW, where the spec gives the WHAT and WHY.

Read the spec and the relevant code first. Cover only what the implementer couldn't learn from reading the code, and only the areas this feature actually touches, which could include:
- components and the request/data flow between them
- API contracts (endpoints, request/response shapes, error responses)
- schema or config changes, env vars, secrets
- how errors propagate
- deployment order or prerequisites
- the **test strategy**: every acceptance criterion in the spec maps to at least one concrete test (input, expected result, how it's checked), plus the command that runs the tests and what the test environment needs

Don't write sections for areas the feature doesn't touch. Prefer concrete values ("30 s timeout") over vague ones.

## Rules

- **Deepen, don't contradict.** The spec is the source of truth for what to build. If a technical constraint conflicts with a requirement, raise it as an open question. If the spec chose a technology, use it.
- **Ask, don't assume,** on choices that affect cost, performance, correctness, or testability. Ask 2–4 questions per round, include at least one testing question in the first round, and keep going until nothing that matters is still open.
- Tag decisions **[USER]** (the user decided) or **[REC]** (your recommendation, with a one-line reason) where the difference matters.

## Output

Write `SPEC/TECHNICAL/<feature-name>-tech-<YYYY-MM-DD>.md`: title, a link to the source spec, the design sections that apply, **Test Strategy**, and **Open Questions**.

## Input

$ARGUMENTS
