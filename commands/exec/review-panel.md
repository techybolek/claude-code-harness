---
description: "Panel Review & Fix Loop: 3 parallel lens reviewers + a cross-model Codex reviewer over uncommitted changes, then fix — a zero-findings PASS from one reviewer is ambiguous; a panel PASS is evidence"
---

# Panel Review & Fix Loop

You are an orchestrator. Same job as `~/.claude/commands/exec/review-loop.md` — an automated review→fix loop on the changes under review — but round 1 runs a **panel of 3 parallel reviewers with distinct lenses plus a cross-model Codex reviewer** instead of one reviewer. Independent perspectives catch what a single pass misses; every defect exists from the start, and one reviewer only ever sees a subset. The Codex panelist exists because same-model reviewers share priors and therefore blind spots — a different model with an end-to-end-trace process has repeatedly caught absence defects (stale no-op tests, dead-code vestiges) that all three lens reviewers missed.

**Single source of truth:** the reviewer prompt, fixer prompt, classification rules (blocking vs nit), and report formats all live in `review-loop.md`. This command adds ONLY the panel structure on top. Do not restate or fork its prompts — read them from that file. Improve the reviewer there and this command inherits it.

## Input
$ARGUMENTS

Same as `review-loop.md`: up to two paths, `<plan> [spec]`, both optional, plus the optional `baseRef=<ref>` token (committed-range mode — see review-loop.md).

## Protocol

### Step 0: Resolve Input

Execute `review-loop.md` **Step 0** exactly (resolve plan/spec paths and diff scope; confirm the diff under review is non-empty — uncommitted changes, or `git diff <baseRef>` when a baseRef is given; STOP if not).

## Lenses

| Key | Focus (each panelist runs ALL of review-loop.md's angles, but digs deepest here) |
|---|---|
| `correctness` | Correctness, edge cases, behavioral regressions — logic errors, off-by-one, inverted conditions; empty/null/zero/huge inputs, first/last iteration; trace existing callers for silently changed contracts (return shape, status codes, ordering). **Framework wiring the compiler can't see:** Angular constructor DI decorators are NOT inherited — a subclass constructor that omits a base's injected param and calls `super()` without it compiles fine and silently injects null; check every changed component subclass constructor against its base's. For any claim that a route/page renders something, never trust a component's name — trace the route config to the component it ACTUALLY renders and that component's own template/inheritance chain. |
| `resilience` | Error & failure paths, security, consistency — unhandled rejections, swallowed errors, partial failure, what happens when a dependency throws; injection, auth/authz gaps, data exposure, unsafe logging; deviations from surrounding idioms. |
| `tests` | Test quality — would each new/changed test FAIL if the code were wrong? Mock-then-assert-the-mock tests, assertions that assert nothing, new behavior with no test, mocks bleeding into real-integration test files. Weak tests that mask bugs ARE blocking. Two forced checks (greps, not judgment): (1) **Contract-change sweep** — if the diff alters a param/response contract (renamed request params, changed response keys), grep the whole test tree for the OLD names; a pre-existing test still sending them is a silent no-op the code now ignores — BLOCKING, even though it's outside the diff. (2) **Coverage-by-deletion** — for each behavior the diff adds (including propagation into export/count/totals paths), name the specific test that would fail if that behavior were removed; "an adjacent suite passes" is not coverage. |

### Step 1: Panel Review

Spawn **3 reviewer subagents and the Codex reviewer in parallel** (one message: three Agent calls with `subagent_type: "general-purpose"` and `model: "opus"`, plus one background Bash call). Each Agent gets:

```
You are one of 4 parallel independent reviewers of the same changes under review, each with a different focus.

1. Read ~/.claude/commands/exec/review-loop.md in full.
2. Execute its Step 1 reviewer prompt exactly, with {plan-file-path} = {plan} and {spec-file-path} = {spec}, and, if a baseRef was given, baseRef = {baseRef} (review-loop.md's committed-range mode: the diff under review is `git diff {baseRef}`).
3. Your lens — {key}: {focus from the table above}. Run ALL the angles, but dig deepest on your lens. Report every blocking finding you can see, regardless of lens — each finding you hold back costs a full extra round.

Report in review-loop.md's exact "### Review" format.
```

**The Codex panelist** is a Bash call (`run_in_background: true`):

```
codex exec --sandbox read-only --ephemeral -C {repo-root} -o {scratchpad}/codex-review.md - < {scratchpad}/codex-prompt.md
```

where `{scratchpad}/codex-prompt.md` is written first (stdin via `-` avoids shell-quoting the prompt) and contains: {the same reviewer prompt as above, with lens: cross-model end-to-end trace — trace each changed behavior end-to-end (request params → route validation → controller/SQL → response keys → UI/export consumers) instead of reading diff hunks; hunt absence defects: behavior with no test that would fail if it were removed, pre-existing tests/code obsoleted by a contract change in the diff}

Read `{scratchpad}/codex-review.md` when it finishes. **Availability-tolerant:** if `codex` is missing, errors, or hasn't finished within ~10 minutes of the three Agent panelists completing, kill it and proceed with the 3-panel merge — never block the pipeline on the external CLI; record `codex: unavailable` in the report.

**Merge the reports yourself (no subagent):**
- **VERDICT:** NEEDS_WORK if any panelist reports a blocking finding; PASS only if all available panelists PASS.
- **Blocking:** union of the lists. Where two panelists describe the same defect, keep one entry (note the overlap — independent detection is signal, not noise).
- **Nits:** union.
- **Codex findings get the same treatment as any panelist's, including orchestrator verification before the fixer is dispatched — its findings are usually real but its suggested remediations are not gospel; pass the verified defect to the fixer, not Codex's patch.**

**If merged verdict is PASS:** record `Review: PASS (panel)` (or `PASS (panel, after {N} fix rounds)`) and go to Step 3.

### Step 2: Fix

Execute `review-loop.md` **Step 2** exactly, passing the merged Blocking list to its fixer prompt, with one addition to the prompt: "Findings come from independent parallel reviewers and may overlap — where two describe the same defect, fix it once."

#### Loop

After the fixer reports, re-review. **Rounds 2+ use a SINGLE full reviewer** (review-loop.md Step 1 verbatim, no lens) — the panel is for the wide first sweep; later rounds verify the fixes landed without regressions. **Maximum 2 fix rounds**, same as review-loop.md: still NEEDS_WORK after the second fix round, or a fixer FAILURE → record `Review: UNRESOLVED` with remaining findings and go to Step 3.

### Step 3: Report

Print `review-loop.md`'s **Step 3** report format, with one extra line:

```
- **Panel:** correctness: {N blocking}/{M nits} · resilience: {N}/{M} · tests: {N}/{M} · codex: {N}/{M} (or "unavailable")
```

## Rules

All of `review-loop.md`'s rules apply verbatim (lightweight orchestrator; review is critical analysis, not test execution; reviewers read-only, only fixers touch code; nits never trigger a fix round; fixers verify only their fix; no commits). Plus:

- **Never inline the base prompts.** If you find yourself pasting reviewer instructions into this file, stop — they belong in `review-loop.md`.
- **Panel only on round 1.** Four reviewers re-verifying a two-line fix is waste; one full reviewer is the right check for fix rounds.
- **Codex is read-only and optional.** It runs under `--sandbox read-only` (enforced, satisfying the reviewers-read-only rule) and its absence never fails the review — 3 lens reports are a quorum.
- **Overlapping findings are corroboration.** Two panelists independently flagging the same line raises confidence — merge to one entry but you may note it when reporting.
