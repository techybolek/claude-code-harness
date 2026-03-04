# Execute Complex: Autonomous Iterative Implementation

You are an orchestrator. Your job is to autonomously implement a complex feature spec by running an iterative plan-implement-test loop using subagents. Stay lightweight — track state and spawn subagents, but do no heavy coding or planning yourself.

## Spec File
$ARGUMENTS

## Orchestrator Protocol

Execute the following steps **in order**. Do not skip steps. Do not proceed past a failed step unless the protocol says to.

### Step 0: Initialize

1. Read the spec file above.
2. Extract the spec name from the filename (e.g., `personal-mybot-2026-02-14` from the path).
3. Check if `SPEC/PROGRESS/{spec-name}.md` already exists.
   - **If it exists:** Read it. You are **resuming**. Skip to Step 1 (Assess). Print: `Resuming execute-complex for {spec-name} — iteration {N+1}`
   - **If it does not exist:** Extract all acceptance criteria from the spec's `## Acceptance Criteria` section. If the spec has no acceptance criteria section, **STOP** and tell the user: "Spec has no acceptance criteria section. Add one before running /exec:complex." Create the progress tracker using the format in the Progress Tracker Format section below.
4. Print: `Starting execute-complex for {spec-name}`

### Step 1: Assess

Read the progress tracker and note:
- Which acceptance criteria are checked (done) vs unchecked (remaining)
- The "Current State" and "Issues / Blockers" sections
- How many iterations have been completed

**Stall detection:** If the last 2 completed chunks in the tracker describe substantially the same work (same files, same goal) and the acceptance criteria haven't advanced, **STOP** the loop. Print: `Stall detected — no progress after 2 iterations. See SPEC/PROGRESS/{spec-name}.md for details.` Update the tracker's Issues section with the stall details and exit.

**Completion check:** If ALL acceptance criteria checkboxes are checked, go to **Step 5: Final Verification**.

Print: `Iteration {N}: Assessing — {count} of {total} acceptance criteria met`

### Step 2: Plan

Spawn a **planner subagent** using the Task tool with `subagent_type: "general-purpose"`. Give it this prompt:

```
You are a planner. Your job is to read a feature spec, a progress tracker, and the current codebase, then write a plan for the NEXT chunk of implementation work.

## Inputs
- **Spec file:** {spec-path} — this is the architectural north star. Always reference it for coherence.
- **Progress tracker:** SPEC/PROGRESS/{spec-name}.md — what's done, what remains.
- **Codebase:** Explore the current codebase to understand what exists.

## Your Task
1. Read the spec file thoroughly.
2. Read the progress tracker to understand what's been completed and what's next.
3. Explore the codebase (use Glob and Read) to see what actually exists — verify tracker claims.
4. Determine the next logical chunk of work. Pick something that:
   - Advances at least one unchecked acceptance criterion
   - Is a testable deliverable (can be verified with tests)
   - Builds on what exists (don't duplicate or contradict prior work)
   - Is sized appropriately (not too big for a single implementation pass)
5. Write a plan to `SPEC/PLAN/{spec-name}_chunk_{NN}.md` where NN is the next chunk number (check existing files).

## Plan Format
Use this format:

# Chunk {NN}: {title}

**Spec:** {spec-path}
**Progress:** SPEC/PROGRESS/{spec-name}.md
**Target Criteria:** {list which acceptance criteria this chunk advances}

## Goal
{What this chunk delivers}

## Context
{What already exists that this chunk builds on — be specific about files and patterns}

## Step by Step Tasks
{Ordered list of implementation steps. Be specific about file paths, function signatures, and expected behavior. Include test writing as part of the steps, not as an afterthought.}

## Tests Required
{Specific tests that must be written and pass for this chunk to be complete. Include:
- Unit tests (always)
- Integration tests if the chunk involves external service interaction
- The full test suite must also pass (no regressions)}

## Validation Commands
{Exact commands to run to verify the chunk works. Discover the project's test runner from CLAUDE.md. Always include running the full test suite plus any integration test commands if applicable.}

## Acceptance Criteria Advanced
{Which spec acceptance criteria this chunk should check off when complete}

6. Return the path to the plan file you created.
```

Read the plan file path returned by the subagent. Print: `Iteration {N}: Planned — {plan-file-path}`

### Step 3: Implement + Test

Spawn an **implementer subagent** using the Task tool with `subagent_type: "general-purpose"`. Give it this prompt:

```
You are an implementer. Your ONLY job is to execute the plan below, write tests, and make ALL tests pass.

## Plan File
{plan-file-path}

## Instructions
1. Read the plan file.
2. Read the spec file referenced in the plan (for architectural context).
3. Execute every step in the plan, in order.
4. For EVERY piece of code you write, also write tests for it.
5. After implementing, run the validation commands from the plan.
6. If ANY test fails:
   - Read the failure output carefully.
   - Fix the code (NOT by weakening assertions or deleting tests).
   - Re-run tests.
   - Repeat until ALL tests pass (up to 5 fix attempts).
7. If you cannot get tests green after 5 attempts, report the failures clearly.

## Testing Rules (NON-NEGOTIABLE)
- Every chunk includes tests. No code ships without tests.
- Run the FULL test suite, not just new tests. Discover the test runner from CLAUDE.md.
- Do NOT mark a chunk complete if tests are failing.
- Do NOT weaken assertions to make tests pass.
- Do NOT delete failing tests.

## Report Format
When done, report EXACTLY this:

### Files Changed
{list of files created or modified}

### Test Results
- **Command:** {exact test command run}
- **Tests run:** {number}
- **Passed:** {number}
- **Failed:** {number}
- **Status:** PASS or FAIL

{If FAIL, include the relevant failure output}

### Issues Encountered
{Any problems hit during implementation, or "None"}

### Acceptance Criteria Advanced
{Which acceptance criteria from the plan are now met, or "None — tests failing"}
```

Read the implementer's report. Print: `Iteration {N}: Implemented — {pass/fail status}`

### Step 4: Update Progress Tracker

Based on the implementer's report:

**If tests PASSED:**
1. Update the progress tracker:
   - Increment iteration count
   - Add the chunk to "Completed Chunks" with: chunk number, what was planned, what was delivered, files changed, test results (pass/fail counts and command output)
   - Check off any acceptance criteria that the implementer confirmed as met
   - Update "Current State" to reflect the new state of the project
   - Update "Next Up" (clear it — the next planner will fill it in)
   - Update "Last Updated" date
2. Print: `Iteration {N}: Complete — {summary}`
3. Go back to **Step 1** (Assess).

**If tests FAILED:**
1. Update the progress tracker:
   - Add the chunk to "Completed Chunks" with status FAILED and the failure details
   - Add the failure to "Issues / Blockers"
   - Do NOT check off any acceptance criteria
2. Increment a failure counter for this area of work.
3. If this is the **first failure** for this chunk's goal: go back to **Step 2** (Plan) — the planner will see the failure and plan a corrective chunk.
4. If this is the **second consecutive failure** for the same goal: **STOP**. Print: `Blocked — repeated failure on {goal}. See SPEC/PROGRESS/{spec-name}.md. Human intervention needed.` Exit.

### Step 5: Final Verification

All acceptance criteria appear met. Spawn a **verifier subagent** using the Task tool with `subagent_type: "general-purpose"`:

```
You are a verifier. Your job is to confirm that a project is truly complete by running comprehensive tests and validating acceptance criteria.

## Spec File
{spec-path}

## Progress Tracker
SPEC/PROGRESS/{spec-name}.md

## Your Task
1. Read the spec and the progress tracker.
2. Run the complete test suite (discover test commands from CLAUDE.md):
   - Unit tests
   - Integration tests (if applicable)
   - End-to-end tests (if they exist)
3. For each acceptance criterion in the spec, verify it actually works — don't just trust the checkboxes.
4. If any test is missing for an acceptance criterion, WRITE the test and RUN it.
5. If any test fails, report it clearly.

## Report Format
### Test Suite Results
- **Unit tests:** {pass}/{total} — command: {test command}
- **Integration tests:** {pass}/{total} — command: {integration test command}
- **E2E tests:** {pass}/{total} or N/A

### Acceptance Criteria Verification
{For each criterion: VERIFIED / FAILED / NEEDS MANUAL VERIFICATION — with evidence}

### Gaps Found
{Tests written to fill coverage gaps, if any}

### Overall Status
**PASS** or **FAIL** — {summary}

### Confidence Level
{HIGH / MEDIUM / LOW} — {explanation}
```

Read the verifier's report.

**If PASS:** Update the progress tracker — mark status as **COMPLETE**, add the verification report, write a final summary. Print the final summary. Exit.

**If FAIL:** Update the progress tracker with the failures. Go back to **Step 1** to plan corrective chunks.

---

## Progress Tracker Format

Create `SPEC/PROGRESS/{spec-name}.md` with this content:

```md
# Progress: {spec title from the spec's top-level heading}

**Spec:** {path to spec file}
**Status:** IN PROGRESS
**Started:** {today's date}
**Last Updated:** {today's date}
**Iteration Count:** 0

## Acceptance Criteria

{Copy every acceptance criterion from the spec as an unchecked checkbox. Preserve the exact wording. Group under the same subheadings if the spec uses them.}

## Completed Chunks

{empty — filled in as chunks complete}

## Current State

No work started yet.

## Next Up

Pending first planning iteration.

## Issues / Blockers

None.
```

---

## Rules

- **Stay lightweight.** You are the orchestrator. Read files, spawn subagents, update the tracker. Do not write application code yourself.
- **Fresh contexts.** Every subagent gets a fresh context via the Task tool. This is critical — context windows must not bloat.
- **Spec is the north star.** Every planner subagent reads the original spec. Plans don't drift from the spec's architecture.
- **Tests are mandatory.** A chunk without passing tests is a failed chunk. Period.
- **Progress tracker is the source of truth.** It must accurately reflect reality at all times.
- **Exit cleanly.** When stuck, exit with a clear explanation. Don't spin.
- **Print status.** After each major step, print a brief status line so the user can follow along.
