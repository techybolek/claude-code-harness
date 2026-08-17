---
name: ralph
description: Start the Ralph self-continuing agent for SPEC/ACTIVE tasks
argument-hint: [iterations|--dry-run|--status|--cleanup]
---

Ralph is a test-driven, self-continuing agent that implements a `SPEC/ACTIVE/`
task through an iterative loop in an isolated git worktree
(`worktrees/<task>/`, branch `ralph/<task>` — main stays protected until you
merge). Full docs: `~/.claude/scripts/ralph/README.md`.

## Run from a terminal, not the IDE

The scripts use `--dangerously-skip-permissions`, required for autonomous
operation. Under an IDE session (VS Code/Cursor), `.claude/settings.json`
permission prompts interrupt the loop. Safety hooks (`safety_validator.py`)
still run either way. If Ralph keeps stopping for approval, this is why —
switch to a terminal.

## Commands

```bash
# RECOMMENDED — implement loop + code-review loop + commit fixes:
~/.claude/scripts/ralph/ralph-pipeline.sh [iterations]

# Implement loop only (default 20 iterations):
~/.claude/scripts/ralph/ralph.sh [iterations]

# Select the spec when SPEC/ACTIVE/ has several
# (<spec> = dir name or a path to its context.md; RALPH_TASK env also works):
~/.claude/scripts/ralph/ralph.sh --task <spec>

~/.claude/scripts/ralph/ralph.sh --dry-run | --status | --cleanup
~/.claude/scripts/ralph/ralph-status.sh    # live peek at a running loop
```

## How it works

- Each iteration is a fresh `claude -p` session in the worktree, prompted with
  `prompts/AGENT_PROMPT.md` + the task files (test-first: define acceptance
  criteria and tests before implementing; fix failures and continue).
- Iterations end with a marker: `TASK_ITEM_DONE` (continue),
  `ALL_TASKS_DONE` (finish — requires `.runs/<task>/SUMMARY.md`), or
  `ERROR_STOP` (unrecoverable, human needed — never used for test failures).
- Exit codes (ralph.sh): 0 all done · 2 max iterations (rerun to continue) · 1 error.
- Model: `RALPH_MODEL` env, default `claude-sonnet-5` (full model IDs only —
  aliases silently resolve to the session model).
- Progress: `<worktree>/.runs/<task>/ralph_progress.txt` + per-iteration logs.

## After completion

The pipeline auto-reviews the finished branch (panel over
`git diff <merge-base>`) and commits fixes. Then, manually:

```bash
git log main..ralph/<task>                      # review
gh pr create --base main --head ralph/<task>    # or merge directly
~/.claude/scripts/ralph/ralph.sh --cleanup
git mv SPEC/ACTIVE/<task> SPEC/ARCHIVE/         # after merge — specs left in
                                                # ACTIVE make later runs ambiguous
```

## Prerequisites & troubleshooting

- Task created by `/ralph:strategic-plan` (`plan.md`, `context.md`, `tasks.md`
  in `SPEC/ACTIVE/NNNN-<name>/`); `worktrees/` gitignored.
- Worktree conflicts → `ralph.sh --cleanup`.
- Per-project worktree state / review config:
  `~/.claude/scripts/ralph/{worktree-hooks,project-config}/<path-slug>.sh`
  (see README).
