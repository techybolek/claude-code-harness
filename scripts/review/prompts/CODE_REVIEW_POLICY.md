# Code-review policy — codex reviewer prompt + lenses

Single source of truth for what the codex code reviewers check. Read at runtime by the
wrapper agents in `~/.claude/workflows/review-flow-only.js` and
`~/.claude/workflows/codex-panel-report.js`, which paste it into codex's prompt (codex
cannot read `~/.claude`). The REALISM_RULE and round-2+ severity floor live in
`review-flow-only.js`, as does the fix policy (the opus adjudicator's prompt).
Extracted 2026-09-23 from the archived `exec:review-loop` / `exec:review-panel` commands.

## Committed-range mode

When a `baseRef` is given, the diff under review is `git diff {baseRef}` — the working tree
vs that base, covering committed work plus any later uncommitted fix edits. Everywhere the
reviewer prompt says "the uncommitted changes", substitute "all changes since {baseRef}
(committed and uncommitted)".

## Reviewer prompt

`{plan-file-path}` / `{spec-file-path}`: when absent, omit the plan-/spec-specific instructions.

```
Critically review the uncommitted changes{ implementing the plan at {plan-file-path}}.

Your value is adversarial analysis, NOT test execution. The implementor has already run the tests — re-running the existing suite proves nothing and is a waste. Read the code and think hard about what could be wrong, from multiple angles. Run a test ONLY to confirm a specific suspicion you formed from reading (e.g. "I think this branch is never hit — let me prove it"), never as a blanket "do the tests pass" check.

## Inputs & their roles
- **Plan** ({plan-file-path}) — the scope boundary and acceptance gate for THIS diff. Its per-task "Done when" criteria are what the diff must satisfy.
- **Spec** ({spec-file-path}) — the source intent. Use it for EXACTLY two checks, nothing more: (a) does the diff *contradict* a spec Acceptance Criterion or Edge Case it actually touches? (b) does the diff do something the spec marks **Out of Scope**? Do NOT flag spec requirements that other tasks or plans are responsible for — the plan defines this diff's slice. Spec-level "missing feature" complaints that fall outside the plan's tasks are NOT blocking.

## Instructions
1. {If a plan file exists:} Read the plan file — especially each task's "Done when" criteria. {If a spec file exists:} Read the spec's Acceptance Criteria, Edge Cases, and Out of Scope sections for the two intent checks above.
2. Run `git diff` — or, when a baseRef is set, `git diff {baseRef}` (working tree vs base) — (and `git status` for untracked files; read new files in full). Read enough of the SURROUNDING code (callers, callees, siblings) to judge the change in context, not just the diff hunks in isolation.
3. Review critically from each of these angles. For every angle, state what you checked — don't skip silently:
   - **Correctness:** logic errors, off-by-one, inverted conditions, wrong operator, copy-paste mistakes.
   - **Edge cases:** empty/null/undefined inputs, zero/negative/huge values, missing keys, empty arrays, first/last iteration, concurrent access.
   - **Error & failure paths:** unhandled rejections, swallowed errors, what happens when a dependency throws or returns nothing, partial failure.
   - **Behavioral regressions:** does this change what existing callers receive? Trace the callers. Did a contract (return shape, status code, ordering) change silently?
   - **Security:** injection, auth/authz gaps, data exposure, unsafe logging of untrusted input. (Known trap in this repo: logging `req.query` directly crashes Express 5 — null-prototype object.)
   - **Consistency:** does it match the conventions, error-handling, and idioms of the surrounding code?
   - **Test quality:** do the new/changed tests actually exercise the new behavior and would they FAIL if the code were wrong? Flag tests that mock then assert the mock's own hardcoded data (catch zero real bugs), tests that assert nothing meaningful, or new behavior with no test at all. Weak tests that mask bugs ARE blocking.
4. Classify each finding:
   - **Blocking:** a real bug, security issue, regression, missed "Done when" criterion, a test that would let a real bug through, or (from the spec) a diff that contradicts a touched Acceptance Criterion/Edge Case or does Out-of-Scope work. **Also blocking:** a *user-visible defect* — rendered output that is wrong, inconsistent, misaligned, or contradicts a stated design/parity goal; "it's only cosmetic" does NOT downgrade something the user actually sees.
   - **Plan deviation:** the code contradicts the plan's *letter* (a mechanism prescription, a Hard Invariant's wording, an enumerated list) but is behaviorally defensible — because fixing toward the plan would violate another plan clause/invariant, contradict the spec's intent, or degrade real behavior; because the plan's clauses are mutually unsatisfiable on this point (the spec's intent is the tiebreaker for which side the code may keep); or because the deviation is documented (e.g. context.md) and sound on its own merits. Authority hierarchy: **spec (intent) > plan (Done-when, invariants) > mechanism prescriptions**. Also file here: an *internal contradiction* between plan tasks, or between plan and spec — do NOT silently pick a side; state which clauses conflict and which intent each side serves. Label each `PLAN-DEVIATION:` — these are escalated for HUMAN decision, never auto-fixed. NOT a plan deviation: code failing a Done-when because it is genuinely broken or incomplete — that is Blocking. When uncertain whether it's a defect or a deviation, classify Blocking.
   - **Nit:** code-hygiene items with **zero** user-visible or behavioral effect — internal naming, comments, micro-optimizations. A subjective preference with no intent reference ("I'd add padding") stays a nit; a visible inconsistency or an unmet stated goal does not. List nits; they do not block.
5. Be specific and falsifiable. For each blocking finding, give the concrete input/scenario that breaks it and the expected fix. A vague "this might be fragile" is not blocking — either prove it or downgrade to a nit.
6. Be realistic as well as concrete. The scenario must be reachable by an actual user or caller through the app's real entry points — the UI as built or the documented API contract. Inputs the UI cannot produce, concurrency the deployment does not actually exhibit, or data magnitudes outside the domain's real ranges are nits. Rigor machinery (locks, concurrency proofs, fault injection, extra precision handling) is warranted only where the spec/plan explicitly asks for it — an unrequested rigor upgrade is a nit, never blocking.
6. Do NOT modify any files. You are read-only.

## Report
Report EXACTLY:

### Review
**VERDICT:** PASS or NEEDS_WORK
**Angles checked:** {one line per angle above — what you verified and why it's OK, or a pointer to the finding}
**Blocking:** {numbered list: file:line — what's wrong — the input/scenario that triggers it — expected fix. Or "None"}
**Plan deviations:** {numbered list: PLAN-DEVIATION: file:line — which plan clause vs which code reality — why fixing toward the plan's letter would be wrong. Or "None"}
**Nits:** {numbered list, or "None"}
```


Plan deviations do not affect the VERDICT — a review whose only findings are deviations is PASS.

## Lenses

| Key | Focus (each panelist runs ALL the reviewer prompt's angles, but digs deepest here) |
|---|---|
| `correctness` | Correctness, edge cases, behavioral regressions — logic errors, off-by-one, inverted conditions; empty/null/zero/huge inputs, first/last iteration; trace existing callers for silently changed contracts (return shape, status codes, ordering). **Framework wiring the compiler can't see:** Angular constructor DI decorators are NOT inherited — a subclass constructor that omits a base's injected param and calls `super()` without it compiles fine and silently injects null; check every changed component subclass constructor against its base's. For any claim that a route/page renders something, never trust a component's name — trace the route config to the component it ACTUALLY renders and that component's own template/inheritance chain. |
| `resilience` | Error & failure paths, security, consistency — unhandled rejections, swallowed errors, partial failure, what happens when a dependency throws; injection, auth/authz gaps, data exposure, unsafe logging; deviations from surrounding idioms. |
| `tests` | Test quality — would each new/changed test FAIL if the code were wrong? Mock-then-assert-the-mock tests, assertions that assert nothing, new behavior with no test, mocks bleeding into real-integration test files. Weak tests that mask bugs ARE blocking. Two forced checks (greps, not judgment): (1) **Contract-change sweep** — if the diff alters a param/response contract (renamed request params, changed response keys), grep the whole test tree for the OLD names; a pre-existing test still sending them is a silent no-op the code now ignores — BLOCKING, even though it's outside the diff. (2) **Coverage-by-deletion** — for each behavior the diff adds (including propagation into export/count/totals paths), name the specific test that would fail if that behavior were removed; "an adjacent suite passes" is not coverage. |
