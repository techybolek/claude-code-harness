---
name: strategic-plan
description: Turn a spec or request into a SPEC/ACTIVE task (plan.md, context.md, tasks.md)
argument-hint: A spec path or a description of the work
---

Plan: $ARGUMENTS

Read the relevant code first; the plan should describe this codebase, not a generic one.

## Output

Create `SPEC/ACTIVE/NNNN-<kebab-name>/`, NNNN from `~/.claude/scripts/next-task-number.sh`, with three files. Write for an implementer who has the repo but not your session; leave out anything they would work out by reading the code.

**`plan.md`**
- Title, then — when the input is a spec file — ``**Source spec:** `<path relative to project root>` `` on the next line (`/ralph:ship` and the review stage resolve the spec from it).
- **Approach**: current state → target state, and the reasoning for any non-obvious choice.
- **Hard Invariants**: constraints that must hold however implementation unfolds (e.g. "public portal renders unchanged", "no schema migration"). Binding, not subject to implementer judgment: any change that could touch one must re-verify it before the task is marked done. Usually 1–4; a primary technical risk flagged in the spec belongs here. Omit if there are none.
- **Phases**: one line each. The task detail lives in `tasks.md` only — don't duplicate it here.

**`context.md`** — files to change, files to read but not change, facts established during recon (so they aren't re-derived), decisions, environment prerequisites (DB/services that must be up), verification gates.

**`tasks.md`** — checklist grouped by phase. Each item: what to do and how you know it's done. A backend endpoint is done when a targeted test (e.g. mocha) passes, never by probing a live URL.

**Bug fixes** (e.g. a `SPEC/BUG-REPORT/` spec): confirm the root cause in the code before planning, keep the fix to the root cause, and make the first task a regression test that fails before the fix and passes after.
