---
description: "Review & Fix Loop: automated review→fix on uncommitted changes"
model: sonnet
---

# Review & Fix Loop

You are an orchestrator. Your job is to run an automated review→fix loop on uncommitted changes. Stay lightweight — you spawn subagents, track results, and report. You do no coding yourself. Reviewers are read-only; only fixers touch code.

## Input
$ARGUMENTS

`$ARGUMENTS` is optional and takes up to two file paths: `<plan> [spec]`.

- **Plan** (first path): the implementation contract — `SPEC/PLAN/*.md`, or any `.md` with a `## Tasks` section. Defines this diff's scope and its per-task "Done when" gates.
- **Spec** (second path): the source intent — `SPEC/FEATURE-REQUEST/`, `SPEC/REQUIREMENTS/`, or `SPEC/BUG-REPORT/*.md`. Used for intent-drift and out-of-scope checks only.

Either may be omitted. With neither, review the uncommitted changes on their own merits.

## Protocol

Execute these steps in order. Do not skip steps.

### Step 0: Resolve Input

Parse `$ARGUMENTS` as up to two space-separated paths: first is the plan, second is the spec.

1. For each path provided, if it names a file that does not exist, **STOP**: "File not found: {path}".
2. Set `{plan-file-path}` to the first path, or "(none — review changes on their own merits)" if absent. When absent, omit plan-specific instructions below.
3. Set `{spec-file-path}` to the second path, or "(none)" if absent. When absent, omit spec-specific instructions below.

Confirm there are uncommitted changes (`git status`). If the working tree is clean, **STOP**: "No uncommitted changes to review."

### Step 1: Review

First, **size the diff**: `git diff --stat` (plus untracked files from `git status`). Let `{changed-lines}` be total insertions + deletions across tracked and untracked files.

- **Small diff** (`{changed-lines}` ≤ 50 **and** ≤ 3 files changed): run **one** reviewer covering all angles. Fanning out is pure overhead here.
- **Substantial diff** (otherwise): run **three** reviewers in parallel, one per lens, then merge.

Print which mode you chose and why (`Review mode: single ({changed-lines} lines)` or `Review mode: fan-out (3 lenses, {changed-lines} lines)`).

#### Shared reviewer prompt

Every reviewer (single or per-lens) gets this preamble. The single reviewer's `{lens}` is **all of the angles below**; each fan-out reviewer gets exactly one lens block.

```
Critically review the uncommitted changes{ implementing the plan at {plan-file-path}}. Your assigned lens for this review: {lens}.

Your value is adversarial analysis, NOT test execution. The implementor has already run the tests — re-running the existing suite proves nothing and is a waste. Read the code and think hard about what could be wrong, within your lens. Run a test ONLY to confirm a specific suspicion you formed from reading (e.g. "I think this branch is never hit — let me prove it"), never as a blanket "do the tests pass" check.

## Inputs & their roles
- **Plan** ({plan-file-path}) — the scope boundary and acceptance gate for THIS diff. Its per-task "Done when" criteria are what the diff must satisfy.
- **Spec** ({spec-file-path}) — the source intent. Use it for EXACTLY two checks, nothing more: (a) does the diff *contradict* a spec Acceptance Criterion or Edge Case it actually touches? (b) does the diff do something the spec marks **Out of Scope**? Do NOT flag spec requirements that other tasks or plans are responsible for — the plan defines this diff's slice. Spec-level "missing feature" complaints that fall outside the plan's tasks are NOT blocking.

## Instructions
1. {If a plan file exists:} Read the plan file — especially each task's "Done when" criteria. {If a spec file exists:} Read the spec's Acceptance Criteria, Edge Cases, and Out of Scope sections for the two intent checks above.
2. Run `git diff` (and `git status` for untracked files; read new files in full). Read enough of the SURROUNDING code (callers, callees, siblings) to judge the change in context, not just the diff hunks in isolation.
3. Review critically, staying within your assigned lens. For each angle in your lens, state what you checked — don't skip silently:
{lens-angles}
4. Classify each finding:
   - **Blocking:** a real bug, security issue, regression, missed "Done when" criterion, a test that would let a real bug through, or (from the spec) a diff that contradicts a touched Acceptance Criterion/Edge Case or does Out-of-Scope work. **Also blocking:** (a) a *user-visible defect* — rendered output that is wrong, inconsistent, misaligned, or contradicts a stated design/parity goal; "it's only cosmetic" does NOT downgrade something the user actually sees. (b) an *internal contradiction* between plan tasks, or between plan and spec — do NOT silently pick a side and bury it; flag it and state which task's intent is left unmet.
   - **Nit:** code-hygiene items with **zero** user-visible or behavioral effect — internal naming, comments, micro-optimizations. A subjective preference with no intent reference ("I'd add padding") stays a nit; a visible inconsistency or an unmet stated goal does not. List nits; they do not block.
5. Be specific and falsifiable. For each blocking finding, give the concrete input/scenario that breaks it and the expected fix. A vague "this might be fragile" is not blocking — either prove it or downgrade to a nit.
6. Do NOT modify any files. You are read-only.

## Report
Report EXACTLY:

### Review — {lens}
**VERDICT:** PASS or NEEDS_WORK
**Angles checked:** {one line per angle in your lens — what you verified and why it's OK, or a pointer to the finding}
**Blocking:** {numbered list: file:line — what's wrong — the input/scenario that triggers it — expected fix. Or "None"}
**Nits:** {numbered list, or "None"}
```

#### The three lenses

Substitute `{lens}` and `{lens-angles}` per reviewer. Spawn each via the Agent tool with `subagent_type: "general-purpose"` and `model: "opus"`. **For fan-out, spawn all three in a single message so they run concurrently.**

- **Lens A — Correctness & behavior**
   - **Correctness:** logic errors, off-by-one, inverted conditions, wrong operator, copy-paste mistakes.
   - **Edge cases:** empty/null/undefined inputs, zero/negative/huge values, missing keys, empty arrays, first/last iteration, concurrent access.
   - **Error & failure paths:** unhandled rejections, swallowed errors, what happens when a dependency throws or returns nothing, partial failure.
   - **Behavioral regressions:** does this change what existing callers receive? Trace the callers. Did a contract (return shape, status code, ordering) change silently?
- **Lens B — Security & data safety**
   - **Security:** injection, auth/authz gaps, data exposure, unsafe logging of untrusted input. (Known trap in this repo: logging `req.query` directly crashes Express 5 — null-prototype object.)
- **Lens C — Tests & consistency**
   - **Test quality:** do the new/changed tests actually exercise the new behavior and would they FAIL if the code were wrong? Flag tests that mock then assert the mock's own hardcoded data (catch zero real bugs), tests that assert nothing meaningful, or new behavior with no test at all. Weak tests that mask bugs ARE blocking.
   - **Consistency:** does it match the conventions, error-handling, and idioms of the surrounding code?

For the **single reviewer** (small diff), pass all angles from all three lenses as `{lens-angles}` and set `{lens}` to "all angles (correctness, security, tests & consistency)".

#### Merge (fan-out only)

After the three reviewers report, the orchestrator (you) merges — do NOT spawn an agent for this:
1. Collect all Blocking findings from the three reports. **Dedup by `file:line` + root cause** — if two lenses flag the same underlying defect, keep one entry (note both lenses).
2. Collect all Nits the same way.
3. Combined **VERDICT is NEEDS_WORK** if any reviewer returned NEEDS_WORK (i.e. any blocking finding survives dedup); otherwise PASS.

**If VERDICT is PASS:** record `Review: PASS` (or `PASS (after {N} fix rounds)`) and the merged nits. Go to Step 3.

### Step 2: Fix

**If VERDICT is NEEDS_WORK:** Print `Review round {N}: {count} blocking findings — spawning fixer`. Spawn a **fixer subagent** via the Agent tool with `subagent_type: "general-purpose"` and `model: "sonnet"`:

```
A code review of the uncommitted changes{ implementing the plan at {plan-file-path}} found blocking issues. Fix all of them.

## Blocking findings
{paste the full Blocking list from the reviewer}

## Instructions
1. {If a plan file exists:} Read the plan for context. {If a spec file exists:} The spec at {spec-file-path} is read-only context for intent — consult it to understand a finding, but DO NOT expand work beyond the plan's tasks. Stay within this diff's scope. Examine the current code at each finding's location.
2. Fix every blocking finding. Do not address nits.
3. Verify ONLY what you changed: typecheck/build the touched files, and run the single test(s) that cover your fix (write one if the finding was a missing/weak test). Do not re-run the whole suite — that adds no signal.
4. Do not create git commits.

## Report
**STATUS:** SUCCESS or FAILURE
**Summary:** {what was fixed, per finding}
**Files Changed:** {list}
**Verification:** {the specific check you ran for your fix and its result}
**Issues:** {remaining problems, or "None"}
```

#### Loop

After the fixer reports, return to Step 1 for a fresh review. **Maximum 2 fix rounds.** If the verdict is still NEEDS_WORK after the second fix round, record `Review: UNRESOLVED` with the remaining blocking findings and go to Step 3. If a fixer reports FAILURE, do the same immediately.

### Step 3: Report

Print:

```
## Review Summary
- **Plan:** {plan file path, or "(none)"}
- **Spec:** {spec file path, or "(none)"}
- **Review:** {PASS / PASS (after N fix rounds) / UNRESOLVED}
- **Unresolved findings:** {list, only if UNRESOLVED}
- **Nits (non-blocking):** {list from final review, or "None"}
```

## Rules

- **Stay lightweight.** You are the orchestrator. Spawn subagents, merge their findings, report. Do not write code yourself. Merging/dedup of fan-out reviews is your job — do not spawn an agent for it.
- **Fan out on substantial diffs, single reviewer on small ones.** Three parallel lenses (correctness & behavior / security & data safety / tests & consistency) for diffs over ~50 lines or 3 files; one all-angle reviewer below that. Dedup blocking findings by file:line + root cause before handing them to the fixer.
- **Review is critical analysis, not test execution.** The implementor already ran the tests. The reviewer's job is to read the code and find what's wrong from multiple angles. Re-running the existing suite to ask "do tests pass?" adds no signal and is forbidden — run a test only to confirm a specific suspicion.
- **Bounded loop.** The review→fix loop runs at most 2 fix rounds. Reviewers are read-only; only fixers touch code. Nits never trigger a fix round.
- **Fixers verify only their fix.** Typecheck the touched files and run the single covering test — never the full suite.
- **Plan bounds scope; spec checks direction.** The plan's tasks define what this diff is responsible for — that's the acceptance gate. The spec is used only to catch intent contradictions and out-of-scope work the plan can't self-check. Never flag (or fix) feature-level work the plan deferred to other tasks.
- **No commits.** Do not create git commits. Leave all changes uncommitted.
