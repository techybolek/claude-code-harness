---
description: "Ad-hoc in-session review: codex lens panel over this session's changes, findings triaged here with the user — no spec needed"
---

# Ad-hoc Review

Review the work done in THIS session with the `codex-panel-report` workflow, then triage the findings here. You keep the conversation context; you are the fixer, but only for findings the user picks.

## Input
$ARGUMENTS

Optional: a git ref (`HEAD~3`, a sha), or `session` — overrides the default scope below.

## Steps

1. **Scope.** `repoRoot` = `git rev-parse --show-toplevel`. Pick `baseRef` (first match):
   - ref argument → that ref
   - `session` argument → parent of the earliest commit this session made (`<sha>^`); covers all session commits plus uncommitted edits
   - uncommitted changes (`git status --porcelain`) → none (uncommitted mode)
   - else → `HEAD~1` (latest commit)
   Default = the work just done, not the whole session. State the scope and the files in it (one line), don't ask.
2. **Intent.** Write `{scratchpad}/review-intent.md` from the conversation, covering only the task(s) behind the diff in scope: what the user asked for, decisions made (and rejected alternatives), what is deliberately out of scope. ≤30 lines, facts only. This is the scope authority — the reviewer judges the diff against it.
3. **Launch.** `Workflow({name: 'codex-panel-report', args: {planPath: <intent path>, repoRoot, baseRef?}})`, wait for completion. Check each non-UNAVAILABLE panelist's `codexCommand` contains `-C {repoRoot}`; otherwise it is INVALID, not a pass. 0/3 up → say codex is down, stop.
4. **Triage.** Merge duplicates (multiple lenses = corroboration). Verify each finding against the code and the intent before presenting. Print a numbered list, most severe first: `N. [fix|skip|disagree] file:line — issue — why` with your recommendation. Nits in one collapsed line.
5. **Stop and wait** for the user to pick numbers. Fix only those, then offer to re-run `/exec:review`.

## Rules

- Never fix before the user picks. No report file — findings live in the conversation.
- Don't commit fixes unless the user asks.
