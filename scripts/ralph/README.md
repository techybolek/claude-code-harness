# Ralph — Self-Continuing Agent Pipeline

Ralph implements a `SPEC/ACTIVE/` task through an iterative single-context loop
in an isolated git worktree, then (via the pipeline) hands the result to an
independent code-review loop that finds and fixes what the implementer missed.

**Why this shape:** the 2026-07-28 A/B against `exec:run-flow`
(`~/.claude/notes/harness-tuning-log.md`) showed ralph matches the orchestrated
pipeline on implementation quality at half the cost, and its quality gap was
almost entirely "no fresh eyes reviewed the result." The calibration run the
same day confirmed a post-hoc `review-flow-only` pass catches that class of
defect (3/4 known bugs + 5 previously unknown, ~$10-15). Hybrid ≈ run-flow
quality at ~75% of the cost, sequential wall clock.

---

## Quick start

```bash
cd <project_root>
claude   # /ralph:strategic-plan <feature>   → creates SPEC/ACTIVE/NNNN-<name>/

~/.claude/scripts/ralph/ralph-pipeline.sh    # implement + review + commit fixes

# review branch ralph/NNNN-<name>, merge, then:
~/.claude/scripts/ralph/ralph.sh --cleanup
```

Run the pipeline in tmux/a spare terminal — a full feature takes ~1-2 h. All
state is on disk; a dropped terminal loses only live output, not progress.

---

## Components

```
~/.claude/scripts/ralph/
├── ralph-pipeline.sh    # uber script: setup → ralph.sh → review-flow-only → commit
├── ralph.sh             # the implement loop (usable standalone)
├── worktree-setup.sh    # worktree provisioning (usable standalone)
├── ralph-status.sh      # live peek at what the current iteration is doing
├── prompts/
│   └── AGENT_PROMPT.md  # per-iteration agent prompt (test-first workflow)
├── worktree-hooks/      # per-project: runtime files a fresh checkout lacks
│   └── <path-slug>.sh
└── project-config/      # per-project: review-stage configuration
    └── <path-slug>.sh
```

`<path-slug>` = project root path with `/` → `-`, e.g.
`-home-tromanow-PROJECTS-TP-TPV2.sh`.

Related slash commands (`~/.claude/commands/ralph/`): `strategic-plan` (create
the task; includes the **Hard Invariants** section — see below), `ralph`
(wraps ralph.sh), `continue-dev` (manual single-session continuation),
`clean` (bulk worktree/branch removal). `~/.claude/scripts/next-task-number.sh`
allocates NNNN across SPEC/ACTIVE + SPEC/ARCHIVE.

### ralph-pipeline.sh — the uber script

```bash
ralph-pipeline.sh [iterations]     # default 20
ralph-pipeline.sh --task <spec>    # select spec when SPEC/ACTIVE/ has several
ralph-pipeline.sh --skip-ralph     # review-only over the existing worktree
                                   # (e.g. after manual fixes)
```

Stages:
1. Resolves the task: `--task <name>` / `RALPH_TASK=<name>`, else the single
   `NNNN-*` dir in `SPEC/ACTIVE/` (multiple without `--task` is a hard error —
   never a silent lowest-number pick). Sources `project-config/<slug>.sh` if
   present.
2. Runs `ralph.sh`. Exit 2 (max iterations) stops the pipeline **without**
   reviewing — rerun to continue. Exit ≠0/2 aborts.
3. Runs `/review-flow-only` headlessly inside the worktree with
   `{planPath, validationCommands}`; transcript →
   `<worktree>/.runs/<task>/review_<timestamp>.log`.
4. Commits the fixer's **tracked** changes on the ralph branch as
   `fix(review): apply review-flow-only panel findings`. Untracked files
   (fixer-created or hook artifacts — indistinguishable) are listed in the
   final report for a manual decision, never auto-committed.
5. Prints the review's final verdict + next steps.

Exit codes: `0` implemented+reviewed · `2` max iterations, no review · `1` error.

### ralph.sh — the implement loop

```bash
ralph.sh [iterations]   # default 20
ralph.sh --task <spec>  # select spec when SPEC/ACTIVE/ has several (or RALPH_TASK env)
ralph.sh --dry-run | --status | --cleanup | --help
```

Task selection follows the same rule as the pipeline: explicit `--task`/
`RALPH_TASK` wins; otherwise exactly one `NNNN-` dir must be in `SPEC/ACTIVE/`.
The positional argument is ONLY the iteration count — a non-numeric value is
rejected with a hint, not silently ignored. After a `complete` run the summary
reminds you to `git mv` the spec to `SPEC/OLD/` so later runs stay unambiguous.

Each iteration launches a fresh `claude -p` session in the worktree with
`prompts/AGENT_PROMPT.md` + the task files, and ends with a marker:
`<ralph>TASK_ITEM_DONE</ralph>` (continue), `<ralph>ALL_TASKS_DONE</ralph>`
(exit 0; agent writes `.runs/<task>/SUMMARY.md` first), or
`<ralph>ERROR_STOP</ralph>` (exit 1). Max iterations → exit 2.

- Model: pinned via `RALPH_MODEL` (default `claude-sonnet-5`). Always a full
  model ID — aliases like `opus` silently resolve to the session model since
  CLI 2.1.219.
- Isolation: branch `ralph/<task>`, Write/Edit allowlisted to the worktree.
- Progress: JSONL in `<worktree>/.runs/<task>/ralph_progress.txt`; per-iteration
  stream-json logs `ralph_claude_iter<N>.log` alongside. **Known defect:** the
  iter-log name has no session stamp, so a rerun overwrites the previous run's
  logs. No retry on transient API death either. (Open items, tuning log.)
- Monitor a live run: `ralph-status.sh [project-root]`.

### worktree-setup.sh — provisioning

```bash
worktree-setup.sh <project_root> <task_dir>   # prints worktree path on stdout
```

Idempotent. Creates `worktrees/<task>` on branch `ralph/<task>` (pruning stale
registrations), then propagates machine-local state:
1. **skip-worktree files** (generic, self-enumerating via `git ls-files -v`) —
   deliberate local edits, e.g. a dev-only auth bypass; the skip-worktree bit
   is carried over so the agent can't commit them.
2. **worktree-hooks/<slug>.sh** — everything project-specific. There is no
   generic `.env` copy; env propagation is hook policy by design.

### worktree-hooks/<slug>.sh — per-project runtime state

Called as `<hook> <project_root> <worktree_path>`. Copies/symlinks gitignored
runtime files a fresh checkout lacks (nested `.env`, captured auth sessions).
Contract:
- **Guard everything you place**: `git -C "$WT" check-ignore -q <file>` or
  delete it and fail — otherwise a `.gitignore` change could make a secret
  committable from the worktree.
- Symlink instead of copy for state that expires and is recaptured in the main
  checkout (see the TPV2 hook's ADFS session).
- Failures are logged but don't abort provisioning.

### project-config/<slug>.sh — per-project review config

Sourced by the pipeline before the review stage:

```bash
VALIDATION_COMMANDS=(            # run from worktree root by the validator
    "cd backend && npm test"
    "cd frontend && npx tsc --noEmit"
)
REVIEW_MODEL=claude-sonnet-5     # optional; review head-session model
```

Missing config is fine — the review runs without extra validation commands.

---

## Onboarding a new project

1. Project needs `SPEC/ACTIVE/` (created by `/ralph:strategic-plan`) and
   `worktrees/` gitignored.
2. If a fresh checkout can't run the app/tests: write
   `worktree-hooks/<slug>.sh` (copy nested env files, auth state — with the
   check-ignore guard).
3. Write `project-config/<slug>.sh` with the project's validation commands.
4. `ralph-pipeline.sh --dry-run` doesn't exist; use `ralph.sh --dry-run` to
   preview, then run the pipeline.

---

## Hard Invariants (plan contract)

`strategic-plan` plans are "proposed future state" — direction, not contract;
the loop agent may adapt as it learns. The exception is the plan's **Hard
Invariants** section: constraints that hold no matter what (e.g. "public portal
renders unchanged"). AGENT_PROMPT.md binds the agent to re-verify an invariant
after any change that could affect it — especially self-initiated fixes, which
is exactly how the 07-28 portal bug shipped (an unreviewed iter-4 fix). The
review stage then checks them again with fresh eyes via `planPath`.

## Known limitations

- **Wall clock is sequential**: implement then review (~66m + ~35m on the
  TPV2 A/B feature). For wide, parallelizable features or when write-time
  hardening matters (security/audit-critical), prefer `exec:run-flow`.
- **Bundle-size gates can't run in TPV2 worktrees**: `angular.json` references
  compiled CSS (`projects/shared/src/{resources,table}.css`) that exists
  nowhere in the repo; `ng build` fails in any fresh checkout. Run bundle
  gates in the main repo until resolved.
- **No committed write-path test enforcement**: both harnesses historically
  delegated transaction-level proof to ephemeral E2E; the panel flags it but
  the fix is manual policy for now (open item in the tuning log).
- Review fixes are panel-driven patches; a finding that implies structural
  rework deserves a human look rather than trusting the fixer's local patch.

## History / evidence

Decisions above trace to `~/.claude/notes/harness-tuning-log.md` (rolling) and
`~/.claude/notes/reviews/2026-07-28-ab-admin-financial-override-reviews.md`
(the A/B reviewer reports that motivated the hybrid).
