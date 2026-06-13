---
description: Evaluate how an agent performed on a run and suggest harness/skill/command/instruction improvements
argument-hint: "[blank=this convo | last | <session-id> | subagent]"
allowed-tools: Read, Glob, Bash(ls:*), Bash(cat:*), Bash(grep:*), Bash(jq:*), Bash(head:*), Bash(tail:*), Bash(wc:*), Bash(pwd), Bash(sed:*)
---

Evaluate how an agent performed on a task, then recommend concrete changes to the harness, skills, commands, and instructions so the next run goes better. **Report only — never edit, write, or apply anything.**

## Resolve the target from `$ARGUMENTS`

- **blank** → reflect on **the current conversation** (you already have its full history in context; do not parse any file).
- **`last` / `recent`** → the most recently modified `.jsonl` in `~/.claude/projects/<encoded-cwd>/`, excluding the current session.
- **`<session-id>`** → that specific `~/.claude/projects/<encoded-cwd>/<id>.jsonl`.
- **`subagent`** → the most recent `isSidechain` run (records with `"isSidechain":true`) in the current project's transcripts.

`<encoded-cwd>` = the absolute cwd with every `/` replaced by `-` (e.g. `/home/me/proj` → `-home-me-proj`). Compute it: `pwd | sed 's:/:-:g'`.

For file-based targets, parse the `.jsonl` to reconstruct: the user's goal, the assistant's turns, every tool call and result, errors, hook rejections, permission denials, and the final outcome. Use `jq` to slice it; don't dump the whole file. For `subagent`, isolate the sidechain block.

> **Self-reflection blind spot:** when the target is the current conversation, you are grading your own work in the same context — you will be lenient and cannot see what you never noticed. Deliberately adopt a skeptical *external reviewer* stance: assume there were missed skills and wasted steps, and hunt for them.

## Part 1 — Performance evaluation

Open with a one-line verdict (did it accomplish the goal — correct, complete, verified?). Then findings across this rubric. Every finding cites concrete evidence from the run (a tool call, a quoted turn, an error).

- **Outcome** — goal achieved? Correct, complete, actually verified (not just claimed)?
- **Efficiency** — wasted steps, re-reads, backtracking, dead ends, redundant tool calls.
- **Tooling** — right skills/commands used? Missed a skill/command that existed? Reinvented something a skill/command already does?
- **Adherence** — followed CLAUDE.md, project conventions, TDD, brevity, and other standing instructions?
- **Friction** — errors, retries, permission prompts, hook blocks that slowed it down.

Skip rubric items with nothing noteworthy. Be specific and honest; this is a critique, not a pat on the back.

## Part 2 — Optimization recommendations

Map each friction point / miss from Part 1 to a concrete change. Tag every recommendation by target and order them by impact (highest first). To ground a recommendation, **Read** the relevant existing file first (the skill's `SKILL.md`, the command, `CLAUDE.md`, `settings.json`) so the suggestion fits what's actually there.

- `[harness]` — `settings.json` permission allowlist entries (for prompts that recurred), hooks, env.
- `[skill]` — a missing skill worth creating, a skill that should have triggered but didn't (fix its `description`), or outdated/wrong skill content.
- `[command]` — a missing or unclear command.
- `[instruction]` — a CLAUDE.md gap or contradiction that caused a mistake.

For each: state the change, the file it touches, and the one-line reason tied to the evidence. Show proposed wording or a diff sketch when it clarifies — but **apply nothing**. If a run was clean with no improvements warranted, say so plainly rather than inventing recommendations.
