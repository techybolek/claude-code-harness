---
description: "Panel Review & Fix Loop: 3 parallel lens reviewers over uncommitted changes, then fix — a zero-findings PASS from one reviewer is ambiguous; a panel PASS is evidence"
---

# Panel Review & Fix Loop

You are an orchestrator. Same job as `~/.claude/commands/exec/review-loop.md` — an automated review→fix loop on uncommitted changes — but round 1 runs a **panel of 3 parallel reviewers with distinct lenses** instead of one reviewer. Independent perspectives catch what a single pass misses; every defect exists from the start, and one reviewer only ever sees a subset.

**Single source of truth:** the reviewer prompt, fixer prompt, classification rules (blocking vs nit), and report formats all live in `review-loop.md`. This command adds ONLY the panel structure on top. Do not restate or fork its prompts — read them from that file. Improve the reviewer there and this command inherits it.

## Input
$ARGUMENTS

Same as `review-loop.md`: up to two paths, `<plan> [spec]`, both optional.

## Protocol

### Step 0: Resolve Input

Execute `review-loop.md` **Step 0** exactly (resolve plan/spec paths, confirm uncommitted changes exist; STOP if not).

## Lenses

| Key | Focus (each panelist runs ALL of review-loop.md's angles, but digs deepest here) |
|---|---|
| `correctness` | Correctness, edge cases, behavioral regressions — logic errors, off-by-one, inverted conditions; empty/null/zero/huge inputs, first/last iteration; trace existing callers for silently changed contracts (return shape, status codes, ordering). |
| `resilience` | Error & failure paths, security, consistency — unhandled rejections, swallowed errors, partial failure, what happens when a dependency throws; injection, auth/authz gaps, data exposure, unsafe logging; deviations from surrounding idioms. |
| `tests` | Test quality — would each new/changed test FAIL if the code were wrong? Mock-then-assert-the-mock tests, assertions that assert nothing, new behavior with no test, mocks bleeding into real-integration test files. Weak tests that mask bugs ARE blocking. |

### Step 1: Panel Review

Spawn **3 reviewer subagents in parallel** (one message, three Agent calls) with `subagent_type: "general-purpose"` and `model: "opus"`. Each gets:

```
You are one of 3 parallel independent reviewers of the same uncommitted changes, each with a different focus.

1. Read ~/.claude/commands/exec/review-loop.md in full.
2. Execute its Step 1 reviewer prompt exactly, with {plan-file-path} = {plan} and {spec-file-path} = {spec}.
3. Your lens — {key}: {focus from the table above}. Run ALL the angles, but dig deepest on your lens. Report every blocking finding you can see, regardless of lens — each finding you hold back costs a full extra round.

Report in review-loop.md's exact "### Review" format.
```

**Merge the 3 reports yourself (no subagent):**
- **VERDICT:** NEEDS_WORK if any panelist reports a blocking finding; PASS only if all three PASS.
- **Blocking:** union of the three lists. Where two panelists describe the same defect, keep one entry (note the overlap — independent detection is signal, not noise).
- **Nits:** union.

**If merged verdict is PASS:** record `Review: PASS (panel)` (or `PASS (panel, after {N} fix rounds)`) and go to Step 3.

### Step 2: Fix

Execute `review-loop.md` **Step 2** exactly, passing the merged Blocking list to its fixer prompt, with one addition to the prompt: "Findings come from independent parallel reviewers and may overlap — where two describe the same defect, fix it once."

#### Loop

After the fixer reports, re-review. **Rounds 2+ use a SINGLE full reviewer** (review-loop.md Step 1 verbatim, no lens) — the panel is for the wide first sweep; later rounds verify the fixes landed without regressions. **Maximum 2 fix rounds**, same as review-loop.md: still NEEDS_WORK after the second fix round, or a fixer FAILURE → record `Review: UNRESOLVED` with remaining findings and go to Step 3.

### Step 3: Report

Print `review-loop.md`'s **Step 3** report format, with one extra line:

```
- **Panel:** correctness: {N blocking}/{M nits} · resilience: {N}/{M} · tests: {N}/{M}
```

## Rules

All of `review-loop.md`'s rules apply verbatim (lightweight orchestrator; review is critical analysis, not test execution; reviewers read-only, only fixers touch code; nits never trigger a fix round; fixers verify only their fix; no commits). Plus:

- **Never inline the base prompts.** If you find yourself pasting reviewer instructions into this file, stop — they belong in `review-loop.md`.
- **Panel only on round 1.** Three reviewers re-verifying a two-line fix is waste; one full reviewer is the right check for fix rounds.
- **Overlapping findings are corroboration.** Two panelists independently flagging the same line raises confidence — merge to one entry but you may note it when reporting.
