---
description: "Pre-implementation review: codex lens panel fact-checks this session's research findings and critiques the proposed plan, triaged here with the user — nothing is implemented"
---

# Plan Review

Review the findings and plan you just presented, before anyone acts on them. Use the `codex-panel-report` workflow in plan mode, then triage the results here. Nothing gets implemented in this command.

## Input
$ARGUMENTS

Optional: a path to a plan/spec file to review instead of the latest proposal in the conversation, and/or a root dir (default below).

## Steps

1. **Snapshot.** Write `{scratchpad}/plan-under-review.md` with two sections:
   - `## Context`: what the user asked for, their constraints (ownership, environments that are off-limits, "not in prod yet" and the like), and decisions already made or rejected. ≤30 lines, facts only, from the conversation.
   - `## Proposal`: your most recent findings + plan message(s), **copied verbatim**. Never summarise or paraphrase, because claims get lost. If a file path was given, paste that file here instead.
2. **Root.** `root` = the dir argument if given; otherwise the closest common ancestor of the paths the proposal names (it may span repos and need not be a git repo). State the root and the snapshot path in one line; don't ask.
3. **Launch.** `Workflow({name: 'codex-panel-report', args: {planPath: <snapshot path>, repoRoot: root, mode: 'plan'}})` and wait for it to finish. Each non-UNAVAILABLE panelist's `codexCommand` must contain `-C {root}`, otherwise it is INVALID, not a pass. If 0/3 are up, say codex is down and stop.
4. **Triage.** Merge duplicates; agreement across lenses counts as corroboration. Check each finding yourself against the code before presenting it, and don't defend your own proposal by reflex. Print:
   - **Claims:** only the WRONG and UNVERIFIABLE ones, one line each with the evidence. Then a single count, e.g. `14 confirmed`.
   - **Findings:** a numbered list, most severe first: `N. [accept|reject] step/claim — issue — why`, with your recommendation. Nits on one collapsed line.
   - Any replacement you propose (a new mechanism, endpoint or approach) must be checked against the code before you present it. If you can't check it, label it `UNVERIFIED`. Triage must not bring in new claims nobody has reviewed.
   - `[reject]` only when the finding is wrong, outside the scope the Context sets, or already covered by the plan. "Already known" is not a reason to reject; a known but unaddressed problem still belongs in the plan.
5. **Stop and wait** for the user to pick numbers. Then print the **revised plan**: the full plan with the accepted changes applied and changed steps marked. Stop again. Implementation starts only when the user explicitly says go.

## Rules

- Read-only until the user says go: no code edits, commits, deploys or remote writes. The only file you write is the snapshot.
- No report file; the findings live in the conversation.
