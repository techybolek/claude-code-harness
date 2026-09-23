---
name: continue-dev
description: Implement or resume a SPEC/ACTIVE task in this session
argument-hint: [optional task folder name, or a spec path to start a new task]
---

Work on a task in `SPEC/ACTIVE/`:
- `$ARGUMENTS` names a task folder (or a file inside one) → use it.
- `$ARGUMENTS` names a spec with no task yet → create `SPEC/ACTIVE/NNNN-<kebab-name>/tasks.md` (NNNN from `~/.claude/scripts/next-task-number.sh`) whose first lines are a title and ``**Source spec:** `<spec path relative to project root>` ``.
- Otherwise use the only `NNNN-*` folder; if there are none or several, stop and ask.

Read the spec named on the `**Source spec:**` line in `tasks.md`, then `tasks.md` and `context.md` (if present); an older task may also have a `plan.md`. If `tasks.md` has no checklist yet, read the code the spec touches and write one: phases, and per item what to do and how you know it's done. For a bug fix, confirm the root cause first; the first item is a regression test that fails before the fix.

Done means every item in `tasks.md` is `[x]`, each phase is verified and committed, and you've printed the review hand-off (below).

## While working

- **Hard Invariants** in the spec are binding. Re-verify one after any change that could touch it.
- **Verify per phase, not per checkbox.** Backend: the targeted mocha test(s) for the affected endpoints, never the full suite. UI: once per surface, drive it in a real browser, check the console, and save a screenshot under `SPEC/ACTIVE/<task>/`. A phase isn't done until this passes. Use `[~]` for in-progress and `[x]` only after verification.
- **Keep the docs current:** tick items and add ones you discover in `tasks.md`. In `context.md`, keep what you learned from the code (files, facts, decisions, blockers) plus a dated progress note, so a later session doesn't re-derive it.
- **Commit each phase once it's verified**, source together with the `tasks.md`/`context.md` updates (Conventional Commits). Never commit `.runs/`; if it shows up in `git status`, say so.
- **Ask only** before deleting or significantly refactoring existing code, or adding/removing dependencies. Otherwise decide and record why in `context.md`.

## Hand off to review

Committed work is invisible to an uncommitted-diff review, so the reviewer needs a base ref. Resolve it:

```bash
git merge-base "$(git symbolic-ref --quiet --short refs/remotes/origin/HEAD | sed 's|^origin/||')" HEAD
```

If the branch already merged previously reviewed work, use that merge commit instead, and say which you chose. Then print:

```
Workflow review-flow-only {
  specPath: "<the source spec>",
  planPath: "SPEC/ACTIVE/<task>/plan.md",   # only for an older task that has one
  baseRef:  "<base>",
  validationCommands: [...]   # from the project's review config, if any
}
```
