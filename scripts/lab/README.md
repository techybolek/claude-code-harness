# lab — black-box lab for Claude Code

Test a Claude Code command, hook or plugin from the outside: the lab starts its own herdr server and an isolated `claude`, drives it like a person (type, keys, read the screen), has a tool-less `claude -p` judge quote the screen, writes a report, and removes what it started. Your own herdr is never touched. A separate pi version lives in `lab-package`.

```sh
node ~/.claude/scripts/lab/lab.mjs doctor
node ~/.claude/scripts/lab/lab.mjs run "try out /split" --tool split --model haiku --project <repo>
node ~/.claude/scripts/lab/lab.mjs run scenarios.md --tool split       # "## " sections, one check per sentence
```
In Claude Code: `/lab …` (hook `~/.claude/hooks/lab-hook.mjs`; `run` starts in the background and prints its id, log and report path).

## Isolation
- Pane under test: `claude` under its own `HOME`, whose `~/.claude` holds only a copy of `.credentials.json`, herdr's session hook, and `.claude.json` marking onboarding done and the project copy trusted. `--strict-mcp-config`, `--setting-sources user,project`, `--tools <named>`. No API key is passed in.
- Driver and judge: `claude -p --tools "" --strict-mcp-config --setting-sources "" --disable-slash-commands --no-session-persistence`, in an empty dir under their own `HOME` with only the login.
- `--tool`: a Claude tool name (`Read`, `Bash`, …), a plugin dir, a project `.claude` dir (copied minus `settings.local.json`), or NAME = `commands/NAME.md` found in a `.claude` up from the cwd. For a user-level command (`~/.claude/commands/NAME.md`) only that file and the user hooks whose command mentions NAME are copied. A user-level `.claude` itself is never copied.
- Not isolated (comes with the login): account identity (the judge sees the account email), the organisation's managed settings and skills, Claude Code's bundled skills. Every run prints this as a WARNING.
- herdr has no screenshot command: visible pane text only.

## Safety
- The login copy lives in `/tmp/lab-*` (mode 0600). `stop` deletes it; Ctrl-C and `kill` stop the lab in flight; after `kill -9`, `doctor` flags stale labs and `stop --stale` removes them.
- `stop` signals a server only after checking `/proc/<pid>` is the lab's own `herdr server`.
- The project copy withholds secrets, agent files and cloud credentials by a deny-list. A deny-list is never complete.

## Reading results
Explore-mode PASS means nothing looked broken, not that it does what you meant. UNCLEAR is never a pass. UNSUPPORTED is a lab gap (screenshot), not a tool bug. Each step says whether its expectation was declared before acting or set after seeing the screen.

## Develop
`node --test test/*.test.mjs` (no model calls; needs herdr on PATH).
