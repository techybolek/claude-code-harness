---
name: reflect
description: "Evaluate how an agent performed on a run and suggest harness/skill/command/instruction improvements"
disable-model-invocation: true
argument-hint: "[last | <session-id> | subagent] [focus question]"
allowed-tools: Read, Glob, Bash(ls:*), Bash(cat:*), Bash(grep:*), Bash(jq:*), Bash(head:*), Bash(tail:*), Bash(wc:*), Bash(pwd), Bash(sed:*), Bash(~/.claude/scripts/steward/friction-log.py:*)
---

Look back at an agent run and recommend changes that make the next run go better. The user is tuning their harness, so the value is in fixes that carry over to future runs, not in a review of this one.

## What to look at

A leading `last`/`recent`, `<session-id>` or `subagent` picks another run; otherwise it is this conversation, already in context. All remaining text is the **focus**: the user's actual question. When there is a focus, answer only that, because a whole-session critique buries the one thing they asked about. With no focus, judge the whole run.

Other runs live in transcripts. Detect the harness first: `CODEX_THREAD_ID` set → codex; `PI_CODING_AGENT=true` → pi; else claude.

| Harness | Transcripts | Notes |
|---|---|---|
| Claude Code | `~/.claude/projects/<cwd with / → ->/<id>.jsonl` | subagent runs carry `"isSidechain":true` |
| Pi | `~/.pi/agent/sessions/<encoded-cwd>/<ISO>_<uuid>.jsonl` | current: `$PI_SESSION_FILE`; use `type=="message"` records |
| Codex | `~/.codex/sessions/YYYY/MM/DD/rollout-<ts>-<uuid>.jsonl` | match `session_meta.payload.cwd`; use `response_item` records |

`last` means the newest transcript other than the current one. `subagent` exists only in Claude Code; elsewhere, say so and stop instead of guessing. Slice transcripts with `jq` and don't dump them, since they're large.

## How to judge

- **Be a skeptical outside reviewer.** Grading your own run, you'll be lenient and can't see what you never noticed.
- **Cite evidence for every finding** (a tool call, a quoted turn, an error). Claims without evidence can't be acted on.
- Things worth hunting for: unverified claims of success, wasted or repeated steps, skills that existed but weren't used, broken standing instructions, permission and hook friction.

## Recommendations

- **Prevent the miss as far upstream as you can.** A code check or hook beats a rule the agent has to remember, and an always-on instruction costs context in every session, so pick the cheapest fix that would actually have stopped it. Tag each one `[code]`, `[harness]`, `[instruction]`, `[skill]` or `[command]`.
- **Only propose fixes for systematic misses.** A one-off doesn't earn a rule that costs context in every session.
- **Read the file you'd change before proposing a change to it.** That includes a script or tool the focus names, because recommendations made blind don't fit what's actually there.
- Rank by impact. For each, give the file, the change and a one-line reason tied to the evidence. If the run was clean, say so rather than inventing fixes.

## Log the findings

After the report, append every finding to the friction log, systematic or one-off, whether or not you recommended a fix. Your analysis is lost when this session ends; the log keeps it for `/harness:steward`, which reads it across sessions as primary evidence and can see a one-off recur. One entry per finding: `scope` ("harness": the cause is under ~/.claude; "project": the cause is in the repo or its environment), `what` (the finding), `evidence` (your citation), `wanted` (the fix you recommended, or for a one-off what would have prevented it), `systematic` (true if you recommended a fix), `files`, `source: "reflect"`.

```bash
~/.claude/scripts/steward/friction-log.py adhoc "<project root of the run you judged>" <<'FRICTION_JSON'
[{"scope": "…", "what": "…", "evidence": "…", "wanted": "…", "systematic": true, "files": ["…"], "source": "reflect"}]
FRICTION_JSON
```

Say in one line how many you logged. A clean run logs nothing.

**Report only**, the log append aside. End by offering to apply items by number. Apply only the items the user approves, then report each as applied or not applied.
