---
name: lab
description: Black-box test a Claude Code command, hook or plugin (e.g. /split) in an isolated herdr + claude, driven like a person and judged from the screen, with a report. Use when asked to test, try out, check or verify a Claude Code command or tool "in the lab", or to see whether it works from the outside.
---

# lab

Runs the thing under test in its own herdr server and claude (own HOME with only the login, only the tools named), drives it with herdr's CLI, has a tool-less `claude -p` judge quote the screen, writes a report, and removes what it started. Never touches the user's own herdr.

## Before you run
A run makes model calls and writes a report into `./lab-reports/`. Show the user the exact command and wait for OK.

## Commands (shell: `node ~/.claude/scripts/lab/lab.mjs`; in Claude Code: `/lab`)
- `lab doctor` — read-only check of herdr, its CLI, claude, login. Run it first.
- `lab run "<scenario>" --tool NAME --project <repo> [--model haiku]` — a file of `## ` sections, a `.json`, or a sentence.
  - Steps given: the driver follows them, one check per sentence.
  - Only "try out /x": the driver explores (command list, `--help`, normal use, then edge cases).
- `lab stop <id>|--all|--stale`, `lab list`, `lab report <id>`, `lab --help`.
- `lab prune --older-than 14d` lists old reports; add `--yes` to delete (ask the user first: reports are evidence).

## Always
- Pass `--tool` for what is under test: a Claude tool name (Read, Bash, ...), a plugin dir, a `.claude` dir, or a command name found in `.claude/commands/` up from the cwd. Without it nothing is loaded and the run says so.
- Pass `--project <git repo>`; relative paths resolve from the cwd.
- Read the WARNING lines beside the summary before trusting a PASS.

## Reading results
- Explore-mode PASS means "nothing looked broken", not "does what you meant". Trust FAILs and odd findings more.
- UNCLEAR: the screen did not show enough, or the scenario could not be carried out. Not a pass.
- UNSUPPORTED: the lab cannot do the step (herdr has no screenshot). A lab gap, not a bug in the tool.
- Each step says whether its expectation was "declared before acting" or "set AFTER the driver saw the screen" (weaker).
- Every verdict carries a verbatim screen quote the lab checked; a quote not on screen downgrades a pass.
- Not isolated (comes with the login): account identity, the organisation's policy and skills, Claude Code's bundled skills.
- Report each step as "I tried X, expected Y, got Z". Say plainly what the lab cannot do; never simulate it.
