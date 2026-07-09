---
description: "Workflow-driven pipeline: spec or plan → plan review → parallel-wave implement → validate → review → fix (deterministic orchestration via the Workflow tool)"
---

# Workflow-Driven End-to-End Pipeline

You are a **thin entry point**. All orchestration — the plan review→revise loop, dependency waves, per-task retries, final validation, the code review→fix loop — lives in the workflow script at `~/.claude/workflows/run-review-flow.js`, as deterministic JavaScript rather than prose protocol. Your job: resolve the input, launch the workflow, handle its human gates, print the summary. You do no planning, coding, or reviewing yourself, and you never read a diff or test log into your own context.

This is the Workflow-tool port of `exec:run-review`. Policy still lives in the canonical files — the script's agents read `~/.claude/commands/exec/plan-review.md` and `~/.claude/commands/exec/review-loop.md` for the reviewer/reviser/fixer roles (with `~/.claude/commands/exec/review-panel.md` defining the code-review lens panel), so improvements there flow here automatically.

## Input
$ARGUMENTS

## Protocol

### Step 1: Resolve Input

1. If `$ARGUMENTS` is a plan file (path contains `SPEC/PLAN/` or ends in `.md` with a `## Tasks` section): `inputType = "plan"`.
2. If `$ARGUMENTS` is a spec file (path contains `SPEC/REQUIREMENTS/`, `SPEC/FEATURE-REQUEST/`, `SPEC/BUG-REPORT/`, or `SPEC/TECHNICAL/`): `inputType = "spec"`.
3. If the file doesn't exist, **STOP**: "File not found: {path}"

### Step 2: Launch the Workflow

Invoke the **Workflow tool** with:

- `scriptPath`: `/home/tromanow/.claude/workflows/run-review-flow.js`
- `args`: `{ "inputPath": "{absolute path}", "inputType": "plan" | "spec" }` — pass this as a real JSON object, NOT a JSON-encoded string (the script tolerates a stringified fallback, but don't rely on it).

Record the `runId` from the tool result — you need it for resume. The workflow runs in the background and you will be notified when it completes; do **not** poll it in a loop. The user can watch live progress via `/workflows`.

### Step 3: Handle the Result

The workflow returns a structured summary. Branch on `status`:

- **`NEEDS_DECISION`** — the plan has contradictions only a human can settle. Present each `{conflict, options}` via **AskUserQuestion** (one question per conflict, its options as the choices). Then relaunch the Workflow tool with the **same** `scriptPath`, `resumeFromRunId` = the recorded runId, and the **same args plus** `"decisions": [{"conflict": "...", "resolution": "the chosen option"}]`. Everything before plan review returns cached; only the review re-runs with the decisions injected. Repeat this step on the new result.
- **`UNRESOLVED_PLAN`** — **STOP.** Report the remaining findings. Offer the user only: (a) re-plan/split the flagged task, or (b) apply the final DETERMINED fixes and re-run. **Never offer to execute the plan as-is.**
- **`FAILED`** — report the failed `stage` and `reason`, then stop.
- **`PARTIAL` / `VALIDATION_FAILED` / `COMPLETE`** — print the Execution Summary (Step 4).

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
- **Nits (non-blocking):** {nits + planNits, or "None"}
```

## Rules

- **Stay thin.** Resolve input, launch, ask, resume, report. Control flow lives in the script; policy lives in `plan-review.md`/`review-loop.md`. Do not re-implement any protocol step inline.
- **Resume, don't restart.** After a `NEEDS_DECISION` stop (or if you stop the run and edit the script), always relaunch with `resumeFromRunId` — completed agents return cached instantly. Resume is same-session only; if the session was lost, relaunch fresh.
- **Debugging a weird result:** read `journal.jsonl` in the workflow's transcript directory (path in the tool result) — it records each agent's actual return value. Do not pull diffs or test logs into your own context.
- **No commits.** The workflow's agents are instructed not to commit; you don't either. Leave all changes uncommitted.
