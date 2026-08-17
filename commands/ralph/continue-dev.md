---
name: continue-dev
description: Continue implementing tasks from SPEC/ACTIVE with extended thinking
argument-hint: [optional path to the task's context.md to override auto-selection]
---

Resume work on active development tasks using extended thinking mode.

## Workflow

### Step 1: Find Active Task
Scan for task folders in `SPEC/ACTIVE/`:

```bash
ls -1 SPEC/ACTIVE/ 2>/dev/null | head -1
```

If `$ARGUMENTS` contains a path to a `context.md`, the task folder is that
file's parent directory — use it instead of auto-selection. (A bare task
folder name still works.)

If no active tasks found, inform user:
> No active tasks in `SPEC/ACTIVE/`. Use `/ralph:strategic-plan` to create a new task.

### Step 2: Read Task Documentation
Read ALL three files in the task folder:

1. `plan.md` - Understand the strategic plan and phases
2. `context.md` - Review current state, key files, decisions
3. `tasks.md` - Identify incomplete tasks (not marked `[x]`)

**CRITICAL:** Take time to thoroughly understand the full context before proceeding.

### Step 3: Apply Extended Thinking
Before implementing, engage in deep analysis:

1. **Understand the goal** - What is this task trying to achieve?
2. **Review progress** - What has been completed? What's in progress?
3. **Identify blockers** - Are there any issues noted in context.md?
4. **Plan next steps** - Which incomplete task should be tackled first?
5. **Consider dependencies** - Do the task's integration points exist (route
   registration, exports, navigation)? Create missing prerequisites first, or
   record them as a blocker in context.md.

### Step 4: Implement
Work through incomplete tasks in order:

1. Mark current task as in-progress in tasks.md
2. Implement the task following the plan
3. Run tests after changes
4. Mark task complete when done
5. Update context.md with progress

### Step 5: Runtime Verification (REQUIRED)

Verify at the appropriate boundary — not per checkbox:

- **Backend-only tasks**: targeted mocha test(s) covering the affected endpoints satisfy this step — impacted test files only, not the full suite.
- **UI tasks**: once per UI surface, at phase completion:
  1. Start the dev server
  2. Navigate to feature in browser
  3. Check DevTools console for errors
  4. Take screenshot of working feature
  5. Store screenshot in `SPEC/ACTIVE/<task-name>/`

**A phase is NOT complete until its runtime verification passes.**
Never re-run the full test suite to verify a change a targeted test already covers.

Use `[~]` for in-progress tasks, `[x]` only after the verification above.

### Step 6: Update Documentation
As you work, keep SPEC docs current:

**context.md updates:**
- SESSION PROGRESS section with today's date
- Key decisions made
- Files modified
- Any new blockers discovered

**tasks.md updates:**
- Mark completed tasks: `- [x] Task description`
- Add new discovered tasks if needed
- Note in-progress work

### Step 7: Checkpoint Protocol
Ask only before destructive or scope-changing decisions (deleting/significantly
refactoring existing code, adding/removing dependencies). For everything else,
decide and record the rationale in context.md.

## Error Handling

- If task folder structure is incomplete, note missing files and continue with available docs
- If blocked, update context.md with blocker details and ask user for guidance
- If tests fail, fix issues before marking task complete

## Quick Resume
After context reset, run `/ralph:continue-dev` to pick up exactly where you left off.
