---
name: flow
description: Workflow-native Ralph — implement a SPEC/ACTIVE task via ralph-flow.js (structured status, no markers), then review via ralph-pipeline.sh --skip-ralph
argument-hint: [task-dir] [max-iterations]
---

Run the Ralph loop through the Workflow tool instead of `ralph.sh`'s bash loop.
Same validated shape (SPEC/ACTIVE contract, fresh context per iteration, shared
worktree, independent review after), new transport: structured `item_done` /
`all_done` / `blocked` output replaces `<ralph>` marker grepping, iteration
history is journaled harness-side, and one retry covers transient agent death.

You are the orchestrator: you never edit code yourself. A full feature takes
~1–2 h; this session must stay alive throughout (run it in tmux, and with
permissions that allow agents to write to the worktree — e.g. a
`--dangerously-skip-permissions` session, same as `ralph-pipeline.sh` today).

## Steps

1. **Resolve the task.** If `$ARGUMENTS` starts with a `NNNN-*` name, use it.
   Otherwise `SPEC/ACTIVE/` must contain exactly one `NNNN-*` dir — with zero
   or several, stop and ask; never silently pick one. A trailing numeric
   argument is `maxIterations` (default 20).

2. **Provision the worktree.**
   `~/.claude/scripts/ralph/worktree-setup.sh "$PWD" <task-dir>` — idempotent;
   capture the worktree path it prints on stdout.

3. **Launch the implement loop.** Invoke the Workflow tool with
   `scriptPath: ~/.claude/workflows/ralph-flow.js` and
   `args: { projectRoot: "$PWD", taskDir, worktreePath, maxIterations }`
   (optionally `model` — full model ID only; default `claude-sonnet-5`).
   It runs in the background: wait for the completion notification. Do not
   poll, and never report results before the notification arrives.

4. **Act on the outcome** (the workflow's return value):
   - **`all_done`** — guard first: confirm `<worktree>/.runs/<task>/SUMMARY.md`
     exists and `git -C <worktree> status --porcelain` shows no uncommitted
     source changes (untracked `.runs/` is fine). If either fails, treat as
     incomplete and say so. Then run the review stage as a **background** Bash
     task (~35 min, exceeds the foreground timeout):
     `cd <projectRoot> && RALPH_TASK=<task-dir> ~/.claude/scripts/ralph/ralph-pipeline.sh --skip-ralph`
     Wait for its notification, then relay the review verdict from its output
     (review log path is printed by the pipeline).
   - **`blocked`** — report `blockedReason` verbatim plus what the human must
     do; after they resolve it they re-run `/ralph:flow` (on-disk state
     carries — no resume machinery needed).
   - **`max_iterations` / `agent_error`** — report iteration history and tell
     the user to re-run `/ralph:flow` to continue.

5. **Final report.** Branch `ralph/<task-dir>`, commits made, review verdict,
   and next steps: review + merge the branch, then `ralph.sh --cleanup` and
   `git mv SPEC/ACTIVE/<task-dir> SPEC/OLD/`.

## Notes

- The review stage stays on `ralph-pipeline.sh --skip-ralph` deliberately:
  `review-flow-only` assumes its session cwd is the repo under review, and the
  pipeline provides that by launching its head session inside the worktree.
  Folding it into ralph-flow.js needs a `repoRoot` arg in review-flow-only
  first (v2).
- `ralph.sh` remains usable standalone; this command is the A/B alternative
  (see `~/.claude/notes/harness-tuning-log.md` for the comparison culture).
