# claude-code-harness

My personal Claude Code harness: the slash commands, workflows, hooks and skills I use to run
spec-driven development with an automated code-review loop.

This is a working setup, not a product. It is tuned to how I work and it changes often. Take the
parts that are useful to you.

---

## What's here

| Path | What it is |
|---|---|
| `commands/` | Slash commands — the entry points. `spec/`, `plan/`, `exec/`, `ralph/`, `ops/` |
| `workflows/` | Deterministic multi-agent pipelines driven by the `Workflow` tool |
| `skills/` | Cloud-ops and tooling guides loaded on demand (AWS, Azure, GCP, Qdrant, Playwright, pptx) |
| `agents/` | Subagent definitions |
| `hooks/` | Safety validator, statusline, stop/notification hooks |
| `scripts/` | Supporting shell/python — Ralph loop, harness verification, plan helpers |
| `notes/` | My tuning log — reviewer evaluations and the harness changes they produced |
| `CLAUDE.md` | Global instructions (KISS/YAGNI, testing policy, commit format) |
| `settings.json` | Model, hooks, statusline, env |

---

## Install

The commands reference each other by **absolute `~/.claude/` path**. They must live in your home
Claude directory — a project-local `.claude/` install will fail in confusing ways.

```bash
git clone https://github.com/techybolek/claude-code-harness.git
cd claude-code-harness

# take what you want — the review pipeline needs these two:
cp -r commands/exec ~/.claude/commands/
cp -r workflows     ~/.claude/
```

Optional, and worth it: the **`codex` CLI**. The review panel uses it for a cross-model reviewer
(`codex exec --sandbox read-only`). Without it everything still runs, you just get same-model
reviewers — which share the implementer's blind spots, so they agree with it more than you want.

Hooks and `settings.json` are wired to `~/.claude/hooks/*`; copy those too if you want the statusline
and the safety validator, and merge `settings.json` by hand rather than overwriting yours.

---

## The review loop

Start read-only. Get a feel for the findings before you let anything act on them.

```bash
# read-only: findings report, changes nothing
/exec:panel-report <plan-path>

# panel of reviewers + automated fix loop
/exec:review-panel <plan-path> [spec-path]

# single reviewer + fix loop
/exec:review-loop <plan-path> [spec-path]
```

Both path arguments are optional, and both are worth supplying:

- **plan** — what was decided, and what's in this change. This is what the diff is checked against.
- **spec** — what the feature is for, and what is explicitly out of scope. Settles it when the code
  and the plan disagree.

With neither, you still get a review — it just can't check intent, so expect it to re-litigate
decisions you'd already made and to ask for things you deliberately ruled out.

By default the diff under review is your uncommitted working tree. To review an already-committed
branch instead, pass `baseRef=<merge-base>`.

### Why a panel, and why a second model

A zero-findings pass from one reviewer is ambiguous; a panel pass is evidence. Each panelist runs the
same review but digs deepest on one lens (correctness / resilience / tests). The cross-model panelist
is there because a reviewer sharing the implementer's training also shares its blind spots — it reads
an idiom it would have written itself and judges it fine. You don't want a *better* reviewer so much
as one that's wrong about different things.

### The triage gate

Findings do **not** go straight to the fixer. A gate in between re-checks each one against the
current code and the spec/plan, and drops:

- **stale** — already fixed, or the reviewer misread; cite file:line
- **unrealistic** — technically constructible, but unreachable through the app's real entry points,
  or demanding rigor the spec never asked for
- **duplicate** — same defect reported twice

Conflicts where the code contradicts the plan but is defensible against the spec are escalated for a
human decision, never auto-fixed.

This gate is the load-bearing part. A noisy reviewer with a gate in front of the fixer is a good
reviewer; the same reviewer wired straight into a fixer will grind for rounds and sometimes break more
than it fixes. Instructions in the reviewer prompt are not a substitute — they're requests, and they
get ignored.

---

## Full pipeline

```bash
/spec:refine          # vague request  -> specification
/spec:tech-refine     # spec           -> technical architecture
/plan:feature         # spec           -> implementation plan
/exec:run-flow        # spec or plan   -> plan review -> implement -> validate -> review -> fix
```

For long autonomous runs there's the Ralph loop — `/ralph:strategic-plan` to break work into tasks,
then `/ralph:ralph` or `/ralph:flow` to grind through them in fresh contexts.

---

## Caveats

- Absolute `~/.claude/` paths throughout, as above.
- The `Workflow` tool is required for the pipeline commands (`enableWorkflows: true` in settings).
- Some commands assume my project conventions (`SPEC/ACTIVE/`, plan/spec file layout).
- `notes/harness-tuning-log.md` is a lab notebook, not documentation — it records what I measured and
  what I changed, including the things that didn't work.

---

## Credits

Shaped in part by [diet103/claude-code-infrastructure-showcase](https://github.com/diet103/claude-code-infrastructure-showcase)
— examples of Claude Code infrastructure covering skill auto-activation, hooks, and agents. Worth a
read if you're assembling a setup of your own.
