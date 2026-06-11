---
description: "Review & Fix Loop: automated review→fix on uncommitted changes"
---

# Review & Fix Loop

You are an orchestrator. Your job is to run an automated review→fix loop on uncommitted changes. Stay lightweight — you spawn subagents, track results, and report. You do no coding yourself. Reviewers are read-only; only fixers touch code.

## Input
$ARGUMENTS

`$ARGUMENTS` is optional. If it points to a plan file (path contains `SPEC/PLAN/` or ends in `.md` with a `## Tasks` section), the review uses each task's "Done when" criteria. If empty, review the uncommitted changes on their own merits.

## Protocol

Execute these steps in order. Do not skip steps.

### Step 0: Resolve Input

1. If `$ARGUMENTS` names a file that exists, use it as the plan file. Set `{plan-file-path}`.
2. If `$ARGUMENTS` names a file that does not exist, **STOP**: "File not found: {path}".
3. If `$ARGUMENTS` is empty, set `{plan-file-path}` to "(none — review changes on their own merits)" and omit plan-specific instructions below.

Confirm there are uncommitted changes (`git status`). If the working tree is clean, **STOP**: "No uncommitted changes to review."

### Step 1: Review

Spawn a **reviewer subagent** via the Agent tool with `subagent_type: "general-purpose"` and `model: "opus"`:

```
Review the uncommitted changes{ implementing the plan at {plan-file-path}}.

## Instructions
1. {If a plan file exists:} Read the plan file — especially each task's "Done when" criteria.
2. Run `git diff` (and `git status` for untracked files; read new files in full). The uncommitted changes ARE the work product.
3. Review for BLOCKING issues only:
   - Actual bugs: logic errors, broken edge cases, runtime errors waiting to happen
   - Security issues
   - {If a plan file exists:} Missed "Done when" criteria from the plan
4. Style, naming, and comment-quality observations are NITS — list them, but they do not block.
5. Do NOT modify any files. You are read-only.

## Report
Report EXACTLY:

### Review
**VERDICT:** PASS or NEEDS_WORK
**Blocking:** {numbered list: file:line — what's wrong — expected fix. Or "None"}
**Nits:** {numbered list, or "None"}
```

**If VERDICT is PASS:** record `Review: PASS` (or `PASS (after {N} fix rounds)`) and the nits. Go to Step 3.

### Step 2: Fix

**If VERDICT is NEEDS_WORK:** Print `Review round {N}: {count} blocking findings — spawning fixer`. Spawn a **fixer subagent** via the Agent tool with `subagent_type: "general-purpose"` and `model: "haiku"`:

```
A code review of the uncommitted changes{ implementing the plan at {plan-file-path}} found blocking issues. Fix all of them.

## Blocking findings
{paste the full Blocking list from the reviewer}

## Instructions
1. {If a plan file exists:} Read the plan for context. Examine the current code at each finding's location.
2. Fix every blocking finding. Do not address nits.
3. Run the cheapest gate covering your changes (typecheck/build + impacted tests only — never the full suite). It must pass.
4. Do not create git commits.

## Report
**STATUS:** SUCCESS or FAILURE
**Summary:** {what was fixed}
**Files Changed:** {list}
**Test Output:** {pass/fail counts and command}
**Issues:** {remaining problems, or "None"}
```

#### Loop

After the fixer reports, return to Step 1 for a fresh review. **Maximum 2 fix rounds.** If the verdict is still NEEDS_WORK after the second fix round, record `Review: UNRESOLVED` with the remaining blocking findings and go to Step 3. If a fixer reports FAILURE, do the same immediately.

### Step 3: Report

Print:

```
## Review Summary
- **Plan:** {plan file path, or "(none)"}
- **Review:** {PASS / PASS (after N fix rounds) / UNRESOLVED}
- **Unresolved findings:** {list, only if UNRESOLVED}
- **Nits (non-blocking):** {list from final review, or "None"}
```

## Rules

- **Stay lightweight.** You are the orchestrator. Spawn subagents, report. Do not write code yourself.
- **Bounded loop.** The review→fix loop runs at most 2 fix rounds. Reviewers are read-only; only fixers touch code. Nits never trigger a fix round.
- **Scope the test gate.** Fixers gate on the cheapest covering gate (typecheck/build + impacted tests), never the full suite.
- **No commits.** Do not create git commits. Leave all changes uncommitted.
