---
name: reflect
description: "Evaluate how an agent performed on a run and suggest harness/skill/command/instruction improvements"
disable-model-invocation: true
argument-hint: "[blank=this convo | last | <session-id> | subagent]"
allowed-tools: Read, Glob, Bash(ls:*), Bash(cat:*), Bash(grep:*), Bash(jq:*), Bash(head:*), Bash(tail:*), Bash(wc:*), Bash(pwd), Bash(sed:*)
---

Evaluate how an agent performed on a task, then recommend concrete changes to the harness, skills, commands, and instructions so the next run goes better. **Report only — never edit, write, or apply anything.**

## Resolve the target

The target is the text the user passed with this invocation (none = the current conversation).

First determine the harness you are running in (check order matters: child shells inherit a parent harness's vars):

```bash
if [ -n "${CODEX_THREAD_ID:-}" ]; then echo codex; elif [ "${PI_CODING_AGENT:-}" = true ]; then echo pi; else echo claude; fi
```

`<encoded-cwd>` = the absolute cwd with every `/` replaced by `-` (e.g. `/home/me/proj` → `-home-me-proj`). Compute it: `pwd | sed 's:/:-:g'`.

| Harness | Transcript root | Shape |
|---|---|---|
| Claude Code | `~/.claude/projects/<encoded-cwd>/<id>.jsonl` | records may carry `"isSidechain":true` for subagent runs |
| Pi | `~/.pi/agent/sessions/<encoded-cwd>/*.jsonl` | filename `<ISO-with-dashes>_<uuid>.jsonl`; first line `{"type":"session","id":…,"cwd":…}`; no `isSidechain` flag |
| Codex | `~/.codex/sessions/YYYY/MM/DD/rollout-<ts>-<uuid>.jsonl` | not keyed by cwd: match `select(.type=="session_meta").payload.cwd`; no subagent flag |

- **blank** → reflect on **the current conversation** (you already have its full history in context; do not parse any file).
- **`last` / `recent`** → the most recently modified `.jsonl` in your harness's root, excluding the current session. Under pi the current session is `$PI_SESSION_FILE`; its directory is the root.
- **`<session-id>`** → that specific transcript in your harness's root. Under pi the id is the uuid after the `_` in the filename (`$PI_SESSION_ID` for the current session). Under Codex it is the trailing uuid (`$CODEX_THREAD_ID` for the current session).
- **`subagent`** → Claude Code only: the most recent `isSidechain` run. Pi and Codex record no such flag — say so and stop rather than guessing which run was delegated.

For file-based targets, parse the `.jsonl` to reconstruct: the user's goal, the assistant's turns, every tool call and result, errors, hook rejections, permission denials, and the final outcome. Use `jq` to slice it; don't dump the whole file. Under pi, messages are `{"type":"message",…,"message":{"role":…}}` entries; skip `model_change`, `thinking_level_change`, and other non-message records. Under Codex, use `response_item` records (`payload.type` = `message`, plus tool calls: `*_call` and `*_call_output`, e.g. `custom_tool_call`); skip `event_msg`, `turn_context` and the rest. For `subagent`, isolate the sidechain block.

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

- `[harness]` — `settings.json` permission allowlist entries (for prompts that recurred), hooks, env. Under pi the equivalents are extensions, the `resources` arrays in `settings.json`, and env.
- `[skill]` — a missing skill worth creating, a skill that should have triggered but didn't (fix its `description`), or outdated/wrong skill content.
- `[command]` — a missing or unclear command.
- `[instruction]` — a CLAUDE.md gap or contradiction that caused a mistake.
- `[code]` — a change in the project itself: lint rule, type/invariant, test, CI check, or cleaning up a bad pattern the agent copied.

Prefer enforcement over prose — pick the highest target that prevents the miss: makes the mistake impossible or fail fast in the project → `[code]`; one right answer in agent behavior → hook/script (`[harness]`); always-on one-liner → `[instruction]`; judgment plus local facts → `[skill]`. Propose a skill/rule only for misses that look systematic, not one-off — every line costs context forever.

Skill `description` fixes: ≤ ~250 chars, what it does + when, in the words a user would type; no example lists; add "Not for X; use Y" only for a real near miss.

For each: state the change, the file it touches, and the one-line reason tied to the evidence. Show proposed wording or a diff sketch when it clarifies — but **apply nothing**. If a run was clean with no improvements warranted, say so plainly rather than inventing recommendations.
