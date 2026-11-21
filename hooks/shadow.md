# /shadow

A shadow is a supporting Claude agent in a [herdr](https://github.com/herdrdev/herdr) pane beside your conversation (Main). It starts as a fork of Main (read-only tools), follows Main live, answers with a verdict plus numbered items, and sends an item to Main only when you ask. Port of pi's `/agent` (`PROJECTS/MEGA/JOHN/pi-agent`).

Files: `hooks/shadow.mjs` (all logic), `commands/shadow.md` (makes `/shadow` a known command), 5 hook entries in `settings.json`.

## Use
- In Main: `/shadow [--name <n>] [--model <m>] <job>` (default `shadow-N`, `haiku`), `/shadow status`, `/shadow inbox`, `/shadow stop <name|all>`, `/shadow --help`
- In the shadow's pane: `/shadow send #2` (or `#1,3`) queues items; `/shadow send` lists them. Queued items are attached to the next prompt you submit in Main.
- Main needs at least one message first (the fork resumes its transcript).
- Saved shadows: a command file with `shadow-job: <job>` in its frontmatter (project `.claude/commands/` first, then `~/.claude/commands/`) makes `/<file name>` open a shadow of that name with that job. Extra words replace the job; `--model <m>` passes through. Example: `commands/summarizer.md` → `/summarizer`.
- Reply format: a 🟢/🟡/🔴 verdict plus numbered items, unless the job names a format or length (sentences, words, paragraphs, list, lines, …); then only the job's format applies. E.g. `/shadow --name summarizer summarize each of Main's replies in at most 3 sentences`. A reply without a list is sendable as `#1`.

## How it works
| Need | Built with |
|---|---|
| No turn in Main | `commands/shadow.md` + `UserPromptSubmit` hook returning `decision: block` |
| Shadow pane | `herdr pane split --env SHADOW_*` + `claude --resume <id> --fork-session --tools Read,Grep,Glob` |
| Role | `role.md`, given to the shadow by its own `SessionStart` hook as `additionalContext` (`--append-system-prompt` is ignored on `--resume`; herdr refuses multi-line args; reading a file outside the working dirs, or `--add-dir`, stops at a permission prompt) |
| Feed | Main's `UserPromptSubmit`, `PostToolUse`, `PostToolUseFailure`, `Stop` append to `feed.jsonl` (tool output trimmed to 200 chars) |
| Waking the shadow | its own `Stop` hook (`asyncRewake`, timeout 24 h, passed via `--settings`) waits until the feed has a reply, a failed step or 3 steps, then exits 2 with them as a system reminder. Lines arriving while it is busy are delivered together. |
| Back to Main | `notes.jsonl`, attached by Main's `UserPromptSubmit` as `additionalContext` |
| Cleanup | Main's `SessionEnd` closes shadow panes and deletes the state dir |

State: `$TMPDIR/shadow-<uid>/<main session id>/`. Every hook checks `SHADOW_NAME`, so a shadow (which loads the same settings) does not feed itself.

## Known limits
- Main shows pending notes only via `/shadow inbox` (no status line).
- A shadow opened from a resumed/forked Main follows only the new session.
