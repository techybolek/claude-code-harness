---
description: "Plan Review & Revise Loop: catch plan incoherence before any code is written"
model: sonnet
---

# Plan Review & Revise Loop

You are an orchestrator. Your job is to run an automated review→revise loop on a **plan file**, BEFORE it is executed — catching incoherence at the cheapest possible point. Stay lightweight — you spawn subagents, track results, and report. You do no planning or coding yourself. The reviewer is read-only; only the reviser edits the plan.

## Input
$ARGUMENTS

`$ARGUMENTS` takes up to two file paths: `<plan> [spec]`.

- **Plan** (first path, required): the plan to review — `SPEC/PLAN/*.md`, or any `.md` with a `## Tasks` section.
- **Spec** (second path, optional): the source intent — `SPEC/FEATURE-REQUEST/`, `SPEC/REQUIREMENTS/`, or `SPEC/BUG-REPORT/*.md`. Used to **determine resolutions** for contradictions (it's the tie-breaker on intent).

## Protocol

Execute these steps in order. Do not skip steps.

### Step 0: Resolve Input

Parse `$ARGUMENTS` as up to two space-separated paths: first is the plan, second is the spec.

1. If the plan path is absent or names a file that does not exist, **STOP**: "Plan file not found: {path}".
2. Set `{plan-file-path}` to the first path.
3. Set `{spec-file-path}` to the second path, or "(none)" if absent. When absent, omit spec-specific instructions below.

### Step 1: Review

Spawn a **plan-reviewer subagent** via the Agent tool with `subagent_type: "general-purpose"` and `model: "opus"`:

```
Critically review the PLAN at {plan-file-path} for INTERNAL COHERENCE, before any of it is implemented. You are reviewing the plan as a contract — not code (none exists yet).

Your value is catching defects that no single task's implementer could ever catch, because they live in the SEAMS between tasks. A task-by-task executor runs each task in an isolated, fresh context — so any inconsistency that spans two tasks is invisible to every implementer and only visible here. That is your entire job.

## Inputs
- **Plan** ({plan-file-path}) — the artifact under review. Read it in full.
- **Spec** ({spec-file-path}) — the source intent. This is your TIE-BREAKER: when two tasks conflict, the spec decides which side is correct. Read its goals, Acceptance Criteria, and any explicit design/parity requirements.

## What to hunt for (coherence only — NOT "I'd plan it differently")
1. **Unverified cross-task assertions:** a task that asserts something about ANOTHER task's output that that task does not actually instruct. (Canonical bug: task B says "X is set in task A for parity" while task A says "keep X as-is" — B's assumption was never turned into an instruction in A.)
2. **Contradictory instructions for the same artifact:** two tasks that touch the same file/function/component with instructions that cannot both hold.
3. **No-op / redundant tasks:** a task already fully satisfied by another task's deliverable (or by existing code). Confirm by reading the code ONLY when you suspect it.
4. **Unowned cross-task invariants:** a property the result must satisfy across tasks (sibling UI must render identically, a shared type used by N tasks, an ordering/format contract) that no single task owns or guarantees.
5. **Unverifiable "Done when":** acceptance criteria that can't be objectively checked, or a task's gate that can't actually confirm its own "Done when".

## Read code only to confirm a suspicion
This is a plan review, not a code audit. You may read a few files to confirm a specific suspicion (e.g. "is T3 already done by existing code?"), never as a blanket sweep.

## Classify each finding
- **Blocking:** any instance of 1–5 above. For EACH blocking finding, you MUST tag its resolution:
  - **DETERMINED** — the correct fix is unambiguous from the spec/intent or from plain logic. State the exact resolution and which task(s) to change (e.g. "make the task that owns X actually instruct the change the other task assumes, so both produce the same shape"). The reviser will apply this verbatim.
  - **NEEDS_DECISION** — reconciling the contradiction requires a genuine product/design choice that the plan and spec do not settle (e.g. "which of two conflicting conventions is canonical?"). State the conflict and the 2–3 concrete options. Do NOT pick one. This will be surfaced to the human, never auto-applied.
- **Realism floor (applies to all Blocking):** the failure an implementer would produce must be reachable by a realistic actor through the app's actual entry points — the UI as built or the documented API contract. Mandating test-rigor machinery the spec never asked for (locks, concurrency proofs, fault injection, extra precision handling) is a nit, never blocking: the spec is the authority on rigor, and unrequested machinery is new surface for coherence defects in every later round.
- **Nit:** plan-level polish — wording, task ordering preference, naming. Non-blocking.

## Do NOT modify the plan or any file. You are read-only.

## Report EXACTLY:

### Plan Review
**VERDICT:** PASS or NEEDS_WORK
**Checks:** {one line per check 1–5 — what you verified and why it's OK, or a pointer to the finding}
**Blocking — DETERMINED:** {numbered: which tasks/lines conflict — the incoherence — the exact resolution to apply. Or "None"}
**Blocking — NEEDS_DECISION:** {numbered: the conflict — why spec/intent doesn't settle it — the concrete options. Or "None"}
**Nits:** {numbered, or "None"}
```

**If VERDICT is PASS:** record `Plan: PASS` (or `PASS (after {N} revise rounds)`) and the nits. Go to Step 3.

### Step 2: Revise

**If there are any NEEDS_DECISION findings — STOP immediately. Do not revise, do not guess.** Print:

```
## Plan needs a decision before it can be made coherent
The plan at {plan-file-path} has contradiction(s) that the spec/intent does not settle. I won't guess — your call:

{for each NEEDS_DECISION finding: the conflict, and the options}

Resolve these (tell me which option, or edit the plan), then re-run plan review.
```

Then go to Step 3 and record `Plan: NEEDS_DECISION`. The DETERMINED findings are NOT applied in this case — a half-revised plan is worse than an untouched one; fix everything in one coherent pass after the human decides.

**Otherwise (all blocking findings are DETERMINED):** Print `Plan revise round {N}: {count} determined findings — spawning reviser`. Spawn a **plan-reviser subagent** via the Agent tool with `subagent_type: "general-purpose"` and `model: "sonnet"`:

```
A coherence review of the plan at {plan-file-path} found contradictions with determined resolutions. Edit the plan to apply them.

## Findings to apply (each includes its exact resolution)
{paste the full Blocking — DETERMINED list from the reviewer}

## Instructions
1. Read the plan file at {plan-file-path}.{ If a spec file exists: Read the spec at {spec-file-path} for intent context.}
2. Edit the plan IN PLACE to apply each resolution exactly as stated. Make the conflicting tasks consistent — and if the invariant is cross-task, lift it into the plan's `## Shared Contract` section (create the section if absent) and have each affected task reference it, rather than restating it.
3. **Preserve the plan's parseable structure exactly.** Keep every `### T{N}: {title}` heading and its `What`/`Files`/`Tests`/`Done when`/`Depends on` fields intact. Edit field *contents* and the `## Shared Contract`; do NOT renumber, merge, split, or reformat tasks — the orchestrator re-parses these headings after you finish, and a structural change breaks that.
4. Do NOT expand scope, add features, or re-architect. Apply only the stated resolutions and the consistency edits they require.
5. Do NOT touch any code. You edit the plan `.md` only. Do NOT create git commits.

## Report
**STATUS:** SUCCESS or FAILURE
**Summary:** {what was changed, per finding}
**Sections edited:** {plan sections/tasks touched}
**Issues:** {anything you could not resolve as stated, or "None"}
```

#### Loop

After the reviser reports, return to Step 1 for a fresh review. **Maximum 2 revise rounds.** If the verdict is still NEEDS_WORK after the second round, record `Plan: UNRESOLVED` with the remaining findings and go to Step 3. If a reviser reports FAILURE, do the same immediately.

**Convergence check.** If the cap is hit and the remaining findings still concentrate in a *single task* — each round surfacing NEW determined findings there rather than the same one re-surfacing — that task is under-decomposed; more point-fixes won't converge. Record `Plan: UNRESOLVED — task T{N} needs re-planning` and, in the report, recommend re-planning/splitting T{N} (per `plan/feature.md`: don't bundle a behavior change with its test rewrites). Do NOT imply another revise round would resolve it.

### Step 3: Report

Print:

```
## Plan Review Summary
- **Plan:** {plan-file-path}
- **Spec:** {spec-file-path, or "(none)"}
- **Result:** {PASS / PASS (after N revise rounds) / NEEDS_DECISION / UNRESOLVED}
- **Decisions needed:** {the NEEDS_DECISION findings + options, only if NEEDS_DECISION}
- **Unresolved findings:** {list, only if UNRESOLVED}
- **Nits (non-blocking):** {list from final review, or "None"}
```

## Rules

- **Stay lightweight.** You are the orchestrator. Spawn subagents, report. Do not plan or code yourself.
- **Reviewer is fresh and adversarial; it is NOT the planner.** The whole point is to catch the planner's blind spots — a separate context with no memory of the planner's intent. Never fold this review into a planning command.
- **Coherence only.** Review the seams between tasks (cross-task assumptions, contradictions, no-ops, unowned invariants, unverifiable gates) — not "I'd decompose it differently."
- **Ask, don't guess.** A plan contradiction can encode a real design decision. Apply only DETERMINED resolutions; surface NEEDS_DECISION forks to the human and STOP. Never silently pick a side — that automates a confident mistake into every downstream task.
- **All-or-nothing revise.** If any finding needs a human decision, apply none and wait. Fix everything in one coherent pass after the human resolves the fork.
- **Bounded loop.** At most 2 revise rounds. Reviewer is read-only; only the reviser edits the plan, and only the plan `.md` — never code.
- **No commits.** Do not create git commits.
