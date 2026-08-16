---
description: "Review & Fix Loop: automated review→fix on uncommitted changes"
model: sonnet
---

# Review & Fix Loop

> **Lockstep note (for editors, not executors):** code-review policy is duplicated across 4 files that must be edited together — this file, `review-panel.md` (lenses + codex wrapper), and the embedded prompt copies in `~/.claude/workflows/run-review-flow.js` and `~/.claude/workflows/review-flow-only.js` (REALISM_RULE, triage/fixer prompts, severity floors). A change landed in only some of them means the workflow and standalone paths review to different standards. Plan-review policy has the same split: `plan-review.md` + `run-review-flow.js`.

You are an orchestrator. Your job is to run an automated review→fix loop on the changes under review (the uncommitted changes by default; `git diff <baseRef>` when a baseRef is given). Stay lightweight — you spawn subagents, track results, and report. You do no coding yourself. Reviewers are read-only; only fixers touch code.

## Input
$ARGUMENTS

`$ARGUMENTS` is optional and takes up to two file paths: `<plan> [spec]`.

It also accepts an optional `baseRef=<git-ref>` token anywhere in the arguments: committed-range mode. The diff under review becomes `git diff <baseRef>` — the working tree vs that base — which covers committed work **plus** any later uncommitted fix edits (fix rounds re-diff against the same base). Callers such as the Ralph pipeline pass the feature branch's merge-base with main.

- **Plan** (first path): the implementation contract — `SPEC/ACTIVE/NNNN-*/plan.md` (or the legacy `SPEC/PLAN/*.md`), or any `.md` with a `## Tasks` section. Defines this diff's scope and its per-task "Done when" gates.
- **Spec** (second path): the source intent — `SPEC/FEATURE-REQUEST/`, `SPEC/REQUIREMENTS/`, or `SPEC/BUG-REPORT/*.md`. Used for intent-drift and out-of-scope checks only.

Either may be omitted. With neither, review the uncommitted changes on their own merits.

## Protocol

Execute these steps in order. Do not skip steps.

### Step 0: Resolve Input

Parse `$ARGUMENTS` as up to two space-separated paths (first is the plan, second is the spec), plus an optional `baseRef=<ref>` token.

1. For each path provided, if it names a file that does not exist, **STOP**: "File not found: {path}".
2. Set `{plan-file-path}` to the first path, or "(none — review changes on their own merits)" if absent. When absent, omit plan-specific instructions below.
3. Set `{spec-file-path}` to the second path, or "(none)" if absent. When absent, omit spec-specific instructions below.

If a `baseRef` was provided: verify it resolves (`git rev-parse --verify <baseRef>`; **STOP** if not: "Bad baseRef: {ref}") and confirm `git diff <baseRef>` is non-empty — if empty, **STOP**: "No changes vs {baseRef} to review." Otherwise confirm there are uncommitted changes (`git status`). If the working tree is clean, **STOP**: "No uncommitted changes to review."

### Step 1: Review

When a `baseRef` is set, everywhere the reviewer and fixer prompts below say "the uncommitted changes", substitute "all changes since {baseRef} (committed and uncommitted)".

Spawn a **reviewer subagent** via the Agent tool with `subagent_type: "general-purpose"` and `model: "opus"`:

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

Plan deviations do not affect the VERDICT (a review whose only findings are deviations is PASS) — they are escalated in the Step 3 summary for human ruling.

**If VERDICT is PASS:** record `Review: PASS` (or `PASS (after {N} fix rounds)`) and the nits. Go to Step 3.

### Step 2: Fix

**If VERDICT is NEEDS_WORK:** Print `Review round {N}: {count} blocking findings — spawning fixer`. Pass ONLY the Blocking list to the fixer — plan deviations NEVER enter the fixer's input (they are human-decision items, not fix work; this is why "dispute" doesn't need to cover them). Spawn a **fixer subagent** via the Agent tool with `subagent_type: "general-purpose"` and `model: "sonnet"`:

```
A code review of the uncommitted changes{ implementing the plan at {plan-file-path}} found blocking issues. Fix all of them.

## Blocking findings
{paste the full Blocking list from the reviewer}

## Instructions
1. {If a plan file exists:} Read the plan for context. {If a spec file exists:} The spec at {spec-file-path} is read-only context for intent — consult it to understand a finding, but DO NOT expand work beyond the plan's tasks. Stay within this diff's scope. Examine the current code at each finding's location.
2. For each blocking finding, either FIX it or DISPUTE it. Do not address nits.
   - **Dispute** a finding only when its failure scenario is not reachable through the app's actual entry points (inputs the UI cannot produce, concurrency the deployment does not exhibit, magnitudes outside the domain's real data), or it demands rigor machinery (locks, concurrency proofs, fault injection, precision handling) the spec/plan never asked for. List it under **Disputed** verbatim plus a one-line rationale grounded in the spec/plan or the code. A dispute is a scope judgment — never dispute a finding merely because it is hard.
3. Verify the finding's FAILURE SCENARIO, not just your edit:
   - Logic fixes: typecheck/build the touched files and run the single test(s) that cover your fix (write one if the finding was a missing/weak test). Do not re-run the whole suite — that adds no signal.
   - Rendering/wiring/reachability fixes (element not rendered, provider not injected, route never reaches the code): typecheck/build is NOT sufficient — such defects are invisible to the compiler by construction (e.g. Angular constructor DI is not inherited; a subclass that drops a base's injected param compiles fine and injects null). Trace the actual chain — route config → the component the route REALLY renders → its template/inheritance chain — citing file:line per hop, and confirm your fix lies ON that chain. If the finding names a component, verify it is the one the route renders BEFORE fixing it; if it is not, fix the one that is and say so. If verification genuinely requires running the app, state exactly what runtime evidence is missing under Issues — never report a wiring fix as verified on a compile alone.
4. Do not create git commits.

## Report
**STATUS:** SUCCESS or FAILURE
**Summary:** {what was fixed, per finding — include the reachability trace for wiring fixes}
**Files Changed:** {list}
**Verification:** {the specific check you ran for your fix and its result}
**Disputed:** {findings declined as unrealistic/out-of-scope, each with its rationale, or "None"}
**Issues:** {remaining problems, or "None"}
```

#### Loop

After the fixer reports, return to Step 1 for a fresh review. Pass the fixer's **Disputed** list (if any) into the next reviewer prompt as context: a disputed finding may be re-reported as blocking ONLY with a concrete trigger path through the app's real entry points that refutes the dispute rationale; otherwise it stays disputed and does not count as blocking. Carry all disputes into the Step 3 summary. Also pass accumulated **Plan deviations** as a separate context block ("already escalated for human decision — do not re-report"); collect any new ones each round. **Maximum 2 fix rounds.** If the verdict is still NEEDS_WORK after the second fix round, record `Review: UNRESOLVED` with the remaining blocking findings and go to Step 3. If a fixer reports FAILURE, do the same immediately.

### Step 3: Report

Print:

```
## Review Summary
- **Plan:** {plan file path, or "(none)"}
- **Spec:** {spec file path, or "(none)"}
- **Review:** {PASS / PASS (after N fix rounds) / UNRESOLVED}{; append " (N plan deviations escalated)" when any}
- **Unresolved findings:** {list, only if UNRESOLVED}
- **Plan deviations (human decision required):** {accumulated list, or "None"}
- **Nits (non-blocking):** {list from final review, or "None"}
```

## Rules

- **Stay lightweight.** You are the orchestrator. Spawn subagents, report. Do not write code yourself.
- **Review is critical analysis, not test execution.** The implementor already ran the tests. The reviewer's job is to read the code and find what's wrong from multiple angles. Re-running the existing suite to ask "do tests pass?" adds no signal and is forbidden — run a test only to confirm a specific suspicion.
- **Bounded loop.** The review→fix loop runs at most 2 fix rounds. Reviewers are read-only; only fixers touch code. Nits never trigger a fix round.
- **Fixers verify the finding's scenario, scoped to their fix.** Typecheck the touched files and run the single covering test — never the full suite. Wiring/rendering fixes additionally require the route→component→template trace; a compile alone never verifies them.
- **Fixers may dispute, not silently skip.** Unrealistic or spec-unrequested-rigor findings are returned as Disputed with a rationale; they re-block only when a reviewer refutes the rationale with a concrete trigger path.
- **Plan deviations are escalated, never auto-fixed.** They never enter a fixer's input, never count toward blocking or convergence, and never disappear silently — every deviation appears in the Step 3 summary for human ruling. The spec's intent outranks the plan's letter; the plan outranks its own mechanism prescriptions.
- **Plan bounds scope; spec checks direction.** The plan's tasks define what this diff is responsible for — that's the acceptance gate. The spec is used only to catch intent contradictions and out-of-scope work the plan can't self-check. Never flag (or fix) feature-level work the plan deferred to other tasks.
- **No commits.** Do not create git commits. Leave all changes uncommitted.
