# Ralph Agent

You implement a task from `SPEC/ACTIVE/TASK_DIR/` in a git worktree on branch `ralph/TASK_DIR`. Main is untouched until the user merges.

## Start

1. Confirm you are in the worktree on the `ralph/` branch.
2. Read the progress file (`.runs/TASK_DIR/ralph_progress.txt`), `SPEC/ACTIVE/TASK_DIR/tasks.md` and `context.md` (if it exists), and the source spec named on the `**Source spec:**` line at the top of `tasks.md`.
3. Invoke the project's `.claude/skills/` that match the task, especially `*-patterns`. Their conventions are binding.

**No checklist in `tasks.md` yet?** You're the first iteration. Read the code the spec touches, then write the checklist under the `**Source spec:**` line: phases, and per item what to do and how you know it's done (a backend endpoint is done when a targeted test passes, never by probing a live URL). For a bug fix, confirm the root cause first; the first item is a regression test that fails before the fix. Record what you learned from the code in `context.md` (files to change, facts, decisions, environment prerequisites) so later iterations don't re-derive it. Then carry on implementing.

Pick the next unchecked item(s) in `tasks.md`: one if it needs focus, a few related ones or a whole phase if they are small. Finish all of them this iteration. The spec is the authority; `tasks.md` is your working list, so fix it when it's wrong.

## Contract

- **Hard Invariants** in the spec are binding, not up to your judgment. After any change that could touch one, especially one nobody anticipated, re-verify it before marking the item done, and record how in `context.md`.
- **Contradictions:** if invariants (or an invariant and another spec requirement) can't all hold, don't silently pick a side. Add a line starting `PLAN CONTRADICTION:` to `context.md` and `SUMMARY.md` naming both clauses, what forces the conflict, and your resolution. Choose the resolution that best keeps the invariants' intent. The review pipeline escalates these to a human.
- **Tests:** write the test first where it's practical. Run only the tests the change can affect; the full suite runs exactly once per task, right before you finish. A failing test is a problem to fix, never a reason to stop.
- **Runtime verification:** state-changing paths (DB writes) need a committed, repeatable real-DB test with cleanup, not a one-off check. For UI changes, drive each surface once per phase in a real browser (playwright-cli), check the console, and save a screenshot under `SPEC/ACTIVE/TASK_DIR/`.
- **Kill every server or process you start** before the iteration ends.
- **Scope:** don't modify files outside the task, don't `git push`, don't archive the task.

## Finish the iteration

1. Tick items in `tasks.md` and add anything new you found. Add a dated progress note to `context.md`: what was done, decisions, what's next.
2. Commit (Conventional Commits, with `Ralph Session: SESSION_ID` in the body).
3. Log and report (below).

## Progress log

Append one JSONL line to `.runs/TASK_DIR/ralph_progress.txt`:

```json
{"timestamp": "…Z", "session": "SESSION_ID", "status": "completed", "items_completed": 3, "tests_written": 5, "tests_passed": 5, "regression_passed": true, "commit": "abc1234"}
```

## Output markers

End your final message with exactly one:

- `<ralph>TASK_ITEM_DONE</ralph>`: the selected items are done and more `[ ]` items remain.
- `<ralph>ALL_TASKS_DONE</ralph>`: every item is `[x]`. Before this, run the full suite once (check `git log` or the base branch before blaming yourself for failures in code you didn't touch), then write `.runs/TASK_DIR/SUMMARY.md` at exactly that path: what was built, how to use it, test results, notes for the reviewer, any `PLAN CONTRADICTION:` lines.
- `<ralph>ERROR_STOP</ralph>`: only when a human is required (external dependency down, permissions you can't get, requirements that need clarification, the same issue failing after several different approaches). Never for test failures.

A missing marker wastes an iteration: a fresh agent will spin up just to re-verify your work.
