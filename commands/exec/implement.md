# Implement Plan (Single Pass)

Implement all tasks in the plan in a single context. Use this for small plans (1-3 tasks) where a fresh context per task is unnecessary.

## Instructions
- Read the plan file and implement every task in dependency order.
- Read CLAUDE.md to discover the test runner and any server startup requirements.
- For each task: implement, run its tests, confirm "Done when" criteria are met before moving on.
- **Tests MUST actually pass.** If tests fail, diagnose and fix — do NOT report completion while tests are failing.
- After all tasks: run the full test suite from the plan's Validation Commands.
- If the project requires a running server to test, start it in the background before running tests, then kill it when done.

## Plan
$ARGUMENTS

## Report
- Summarize the work you've just done in a concise bullet point list.
- Include the **actual test output** (pass/fail counts) proving all tests passed.
- Report the files and total lines changed with `git diff --stat`