# claude-code-harness

My personal Claude Code harness: the slash commands, workflows, hooks and skills I use to run
spec-driven development with an automated code-review loop.

This is a working setup, not a product. It is tuned to how I work and it changes often. Take the
parts that are useful to you.

---

## What's here

| Path | What it is |
|---|---|
| `commands/` | Slash commands — the entry points. `spec/`, `exec/`, `ralph/`, `ops/` |
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
# read-only: codex lens panel over the uncommitted tree, findings report, changes nothing
/exec:panel-report [spec-path]
```

The review→fix loop is the `review-flow-only` workflow. `/ralph:ship` runs it for
you; to re-verify after a manual fix, launch it directly:

```
Workflow review-flow-only { specPath, planPath?, baseRef?, repoRoot? }
```

- **spec** — what the feature is for, its acceptance criteria and Hard Invariants, and what is out
  of scope. This is what the diff is checked against.
- **plan** — only for older tasks that have a `plan.md`: then the plan is the scope and the spec
  settles it when the code and the plan disagree.
- **baseRef** — review `git diff <baseRef>` (e.g. the branch merge-base) instead of the uncommitted
  tree; required for committed work such as a Ralph branch.
- **repoRoot** — the checkout under review, when it isn't the session's cwd (a worktree).

The reviewer prompt and lenses live in `scripts/review/prompts/CODE_REVIEW_POLICY.md`.

### Why a panel, and why a second model

A zero-findings pass from one reviewer is ambiguous; a panel pass is evidence. Each panelist runs the
same review but digs deepest on one lens (correctness / resilience / tests). The cross-model panelist
is there because a reviewer sharing the implementer's training also shares its blind spots — it reads
an idiom it would have written itself and judges it fine. You don't want a *better* reviewer so much
as one that's wrong about different things.

### The adjudicator

Findings do **not** go straight into edits. One opus adjudicator re-checks each against the current
code and the spec/plan, then either fixes it or files it as:

- **reject** — stale, misread, duplicate, or unreachable through the app's real entry points
- **decline** — real, but fixing it isn't warranted (rigor the spec never asked for)
- **plan deviation** — the code contradicts the plan but is defensible against the spec; escalated
  for a human decision, never auto-fixed

This gate is the load-bearing part. A noisy reviewer with a judge in front of the fix is a good
reviewer; the same reviewer wired straight into a fixer will grind for rounds and sometimes break more
than it fixes. Instructions in the reviewer prompt are not a substitute — they're requests, and they
get ignored.

---

## Full pipeline

```bash
/spec:refine          # vague request  -> specification
/spec:tech-refine     # spec           -> technical architecture
/ralph:ship [spec]    # spec (default: newest) -> implement in a worktree -> codex review -> fix
```

`/ralph:ship` creates the task folder, then runs the Ralph loop (fresh context per iteration,
isolated worktree; the first iteration writes `tasks.md` from the spec) → `review-flow-only`. If it stops — blocked, or
out of iterations — re-run `/ralph:ship <spec>` to resume.

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
