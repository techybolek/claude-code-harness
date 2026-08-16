---
description: "Workflow-driven pipeline: spec or plan → plan review → parallel-wave implement → validate → review → fix (deterministic orchestration via the Workflow tool)"
---

# Workflow-Driven End-to-End Pipeline

You are a **thin entry point**. All orchestration — the plan review→revise loop, dependency waves, per-task retries, final validation, the code review→fix loop — lives in the workflow script at `~/.claude/workflows/run-review-flow.js`, as deterministic JavaScript rather than prose protocol. Your job: resolve the input, launch the workflow, handle its human gates, print the summary. You do no planning, coding, or reviewing yourself, and you never read a diff or test log into your own context.

Policy lives in the canonical files — the script's agents read `~/.claude/commands/exec/plan-review.md` and `~/.claude/commands/exec/review-loop.md` for the reviewer/reviser/fixer roles (with `~/.claude/commands/exec/review-panel.md` defining the code-review lens panel), so improvements there flow here automatically.

## Input
$ARGUMENTS

## Protocol

### Step 1: Resolve Input

1. If `$ARGUMENTS` is a plan file (path contains `SPEC/ACTIVE/` or the legacy `SPEC/PLAN/`, or ends in `.md` with a `## Tasks` section): `inputType = "plan"`.
2. If `$ARGUMENTS` is a spec file (path contains `SPEC/REQUIREMENTS/`, `SPEC/FEATURE-REQUEST/`, `SPEC/BUG-REPORT/`, or `SPEC/TECHNICAL/`): `inputType = "spec"`.
3. If the file doesn't exist, **STOP**: "File not found: {path}"

### Step 2: Launch the Workflow

Invoke the **Workflow tool** with:

- `scriptPath`: `/home/tromanow/.claude/workflows/run-review-flow.js`
- `args`: `{ "inputPath": "{absolute path}", "inputType": "plan" | "spec" }` — pass this as a real JSON object, NOT a JSON-encoded string (the script tolerates a stringified fallback, but don't rely on it).

Record the `runId` from the tool result — you need it for resume. The workflow runs in the background and you will be notified when it completes; do **not** poll it in a loop. The user can watch live progress via `/workflows`.

### Step 3: Handle the Result

The workflow returns a structured summary. Branch on `status`:

- **`NEEDS_DECISION`** — the plan has contradictions. Default to resolving each one yourself: pick the option that (a) stays consistent with the spec's own Locked Decisions and existing codebase patterns, (b) is lowest-risk/most reversible, and (c) matches the reporting reviewer's own lean, if it expressed one. Only fall back to **AskUserQuestion** when a conflict is a genuine product/business tradeoff with no technically-correct answer (e.g., which behavior end users should see) — not for internal contract/schema/format ambiguities, which you resolve yourself. Then relaunch the Workflow tool with the **same** `scriptPath`, `resumeFromRunId` = the recorded runId, and the **same args plus** `"decisions": [{"conflict": "...", "resolution": "the chosen option"}]` **and** `"carriedFindings"`: the `determined` list from the NEEDS_DECISION result, passed back **verbatim** (do not summarize or filter it) — **and**, when the result includes them, `"appliedResolutions"` and `"knownNits"`, also verbatim: they restore the paused loop's already-applied context, and without them a mid-loop pause resumes with a re-reviewer that re-litigates finished work. Everything before plan review returns cached; the decisions + carried findings go straight to a reviser pass, then a single full re-review round verifies the revised plan. Repeat this step on the new result. Record every self-resolved decision (conflict + resolution + one-line reason) for the **Decisions made** section of the Step 4 report.
- **`UNRESOLVED_PLAN`** — **STOP.** Report the remaining findings. Offer the user exactly these two options, worded so they can't be mixed:
  - **(a) Re-plan** — launch the **planner** again (fresh session or `inputType: "spec"` run) so it authors a **new plan from the spec**, splitting the flagged task (right call when repeats cluster on one overloaded task, e.g. a terminal audit-everything task, or one bundling a behavior change with its own test-injection/cleanup design). Only a **planner-authored** plan may enter full plan review again. Hand-editing the existing plan does NOT count as re-planning, no matter how large the edit.
  - **(b) Apply + skip** — apply the final DETERMINED + repeat fixes to the plan yourself, then relaunch **fresh** with the same args plus `"skipPlanReview": true` — the run proceeds straight to Execute.
  The invariant behind both: **a plan that any human or orchestrator hand-edited must never re-enter plan review.** A fresh launch resets the round counter and applied-resolutions list, so the panel gets a clean slate to ratchet stricter standards forever (observed 2026-07-24: 3 full review cycles, zero code; observed again 2026-07-25 via the hand-edit-then-re-review loophole: 8 rounds, zero code — the residual real findings surface fine in Execute's code review instead). If you use AskUserQuestion here, the option descriptions must carry the (a)/(b) definitions above verbatim in spirit — never offer "apply fixes then re-run plan review". **Never execute the plan with findings unapplied.**
- **`FAILED`** — report the failed `stage` and `reason`, then stop.
- **`PARTIAL` / `VALIDATION_FAILED` / `COMPLETE`** — print the Execution Summary (Step 4). When resuming a `PARTIAL` run to retry failed tasks, relaunch with `resumeFromRunId` and the previous invocation's args **byte-identical** — do not rewrite, compress, or enrich `carriedFindings` or anything else. Any changed arg busts the cache from the reviser onward and re-runs the whole plan-review loop plus every completed task live. Enrichment belongs only in a resume that intends a re-revise.
- **After any manual fix** (a `VALIDATION_FAILED` you or the user repaired by hand, or hand-applied changes to the implementation): the ONLY sanctioned re-verify paths are (a) resume with `resumeFromRunId` + byte-identical args, or (b) launch `~/.claude/workflows/review-flow-only.js` via `scriptPath` with `args: {planPath, validationCommands, changedFiles}` — the standalone Validate + Code-review extraction running the same codex panel and fixer loop. When a FULL validation pass already ran and the manual fix is the only change since, pass `changedFiles`: the exact files touched since that pass — validation then delta-scopes, skipping suites and runtime steps the delta provably cannot affect (skips are justified per-item in its testOutput). Omit `changedFiles` when no prior full pass exists, or when you cannot enumerate the delta completely — an incomplete list silently unscopes real regressions. **Never** fall back to `exec:review-loop` / `exec:review-panel` — single/Claude-seat reviewers, weaker than the codex panel by the 2026-07-23 decision (observed 2026-07-25: an `exec:review-loop` fallback silently ran on the wrong model and stopped short, and the manual fix shipped unreviewed).

### Step 4: Report

Print (values come straight from the workflow's returned object):

```
## Execution Summary
- **Plan:** {planPath}
- **Plan review:** {planReview}
- **Tasks:** {completed}/{total} completed
- **Status:** {COMPLETE → ALL COMPLETE / PARTIAL / VALIDATION_FAILED}
- **Results:**
  - T1: {title} — {result}
  - ...
- **Validation:** {validation}{ — validationIssues if FAIL}
- **Review:** {review}
- **Unresolved findings:** {unresolvedFindings, only if UNRESOLVED}
- **Plan deviations (human decision required):** {planDeviations — plan-vs-code conflicts the triage gate escalated instead of auto-fixing, each with which clause conflicts and why fixing toward the plan's letter would be wrong; omit section if empty}
- **Triage-rejected findings:** {triageRejected — panel findings the triage gate rejected as stale/duplicate/unrealistic, with rationale; omit section if empty}
- **Nits (non-blocking):** {nits + planNits, or "None"}
- **Decisions made (no human input needed):** {conflict → resolution → reason, one per line; omit section if none}
```

## Rules

- **Stay thin.** Resolve input, launch, ask, resume, report. Control flow lives in the script; policy lives in `plan-review.md`/`review-loop.md`. Do not re-implement any protocol step inline.
- **Resume, don't restart.** After a `NEEDS_DECISION` stop (or if you stop the run and edit the script), always relaunch with `resumeFromRunId` — completed agents return cached instantly. Resume is same-session only; if the session was lost, relaunch fresh.
- **Debugging a weird result:** read `journal.jsonl` in the workflow's transcript directory (path in the tool result) — it records each agent's actual return value. Do not pull diffs or test logs into your own context.
- **No commits.** The workflow's agents are instructed not to commit; you don't either. Leave all changes uncommitted.
