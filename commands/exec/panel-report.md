---
description: "Report-only Codex lens panel: 3 parallel codex reviewers over uncommitted changes, findings saved to a markdown report next to the plan — no triage, no fixer"
---

# Codex Panel — Report Only

You are a thin launcher for the `codex-panel-report` named workflow. It runs the same 3-lens codex panel as `review-flow-only.js`'s round 1 (correctness / resilience / tests), but stops after the review: findings go into a markdown report for the user to read. Nothing is fixed, nothing is committed; codex runs under `--sandbox read-only`.

## Input
$ARGUMENTS

Optional: a plan path. If absent, use the most recently modified `SPEC/ACTIVE/*/plan.md` under the repo root and state which one you picked (don't ask).

## Steps

1. **Resolve.** `repoRoot` = `git rev-parse --show-toplevel` from cwd; resolve `planPath` to an absolute path. Confirm uncommitted changes exist (`git status --porcelain`) — STOP with a message if the tree is clean.
2. **Launch.** `Workflow({name: 'codex-panel-report', args: {planPath, repoRoot}})` and wait for the completion notification. Never inline or fork the panel prompts — they live in the workflow file, in lockstep with `review-flow-only.js`.
3. **Verify before trusting.** For each non-UNAVAILABLE panelist, check its `codexCommand` contains `-C {repoRoot}`. A PASS whose command reviewed a different path is INVALID, not a pass — report it as such (this exact failure produced false PASSes on 2026-08-04).
4. **Write the report** to `{plan dir}/codex-panel-report.md`:
   - header: date, repo root, plan path, `git status --porcelain` file list
   - per-lens section: verdict + blocking findings + nits, verbatim (UNAVAILABLE/INVALID noted as such)
   - merged summary: union of blocking findings, duplicates collapsed to one entry with the overlapping lenses noted (independent detection is corroboration)
5. **Print** the report path and a one-line per-lens verdict/count summary.

## Rules

- Report-only: no triage gate, no fixer, no re-review rounds. The only file you write is the report.
- UNAVAILABLE panelists don't fail the run — 2/3 is still useful signal; 0/3 means the codex CLI is down: say so instead of writing an empty report.
- This is the manual-inspection path. For the automated review→fix pipeline use `review-flow-only` (post-fix re-verify) or `exec:run-flow`.
