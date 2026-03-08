# Phase-Execute: Split Plan into Phases and Execute Each in Isolation

You are an orchestrator. Your job is to take a raw plan file, split it into separately testable phases using a subagent, then execute each phase sequentially in its own subagent context. Stay lightweight — you read files, spawn subagents, update status, and report. You do no planning or coding yourself.

## Plan File
$ARGUMENTS

## Protocol

Execute these steps in order. Do not skip steps.

### Step 1: Validate

1. Read the plan file above. If it doesn't exist, **STOP** and tell the user: "Plan file not found: {path}"
2. Print: `Plan file: {path}`

### Step 2: Split into Phases

1. Invoke the `plan:phase` skill using the Skill tool with the plan file path as the argument.
2. Read the skill's response. Look for the index file path (`SPEC/PLAN/PHASED/{name}/{name}_phase_00_index.md`).
4. If the subagent reported NOT PHASEABLE:
   - Print: `Plan is not phaseable — executing as single implementation`
   - Go to **Step 3a: Single Execution**
5. Verify the index file exists by reading it. If missing, **STOP** and tell the user: "Phasing subagent did not create the index file."
6. Print: `Phases created: {index file path}`

### Step 3: Parse Phases

1. Read the index file.
2. Parse the `## Phase Index` table to extract each phase's number, title, status, and file path.
3. Resolve each phase file path relative to the index file's directory.
4. Verify all phase files exist by reading each one. If any are missing, **STOP** and report which files are missing.
5. Print: `Found {N} phases to execute`

### Step 4: Execute Phases

For each phase (in order, 01, 02, 03, ...):

#### 4a. Update Status to IN PROGRESS

Edit the index file to change this phase's status from `NOT STARTED` to `IN PROGRESS`.

Print: `Phase {NN}/{total}: {title} — IN PROGRESS`

#### 4b. Execute Phase

Spawn an **implementer subagent** using the Agent tool with `subagent_type: "general-purpose"`. Give it this prompt:

```
Read and implement the plan in {phase_file_path}

## Instructions
- Read the phase file thoroughly.
- Implement every item in the Scope and Implementation Steps sections.
- Follow the Deliverables and Validation Criteria as your definition of done.
- Run any tests or validation commands specified in the phase.

## When Done
Report EXACTLY this at the end of your response:

### Result
**STATUS:** SUCCESS or FAILURE
**Summary:** {1-2 sentence summary of what was done}
**Files Changed:** {list of files created or modified}
**Issues:** {any problems encountered, or "None"}
```

#### 4c. Evaluate Result

Read the subagent's response.

**If SUCCESS:**
1. Edit the index file to change this phase's status to `COMPLETED`.
2. Print: `Phase {NN}/{total}: {title} — COMPLETED`
3. Continue to the next phase.

**If FAILURE (or no clear STATUS line):**
1. Print: `Phase {NN}/{total}: {title} — FAILED, diagnosing...`
2. Go to **Step 4d: Diagnose and Retry**.

#### 4d. Diagnose and Retry

Spawn a **diagnostic subagent** using the Agent tool with `subagent_type: "general-purpose"`. Give it this prompt:

```
A phase implementation just failed. Your job is to figure out what went wrong and fix it.

## Phase file
{phase_file_path}

## Previous attempt result
{paste the failed subagent's full response here}

## Instructions
1. Read the phase file to understand what was supposed to be implemented.
2. Examine the current state of the codebase — check the files that were supposed to be created/modified.
3. Identify what went wrong (missing files, broken code, failed tests, incomplete implementation).
4. FIX the issues. Complete the implementation.
5. Run any validation commands from the phase file.

## When Done
Report EXACTLY this at the end of your response:

### Result
**STATUS:** SUCCESS or FAILURE
**Summary:** {what was fixed and completed}
**Files Changed:** {list of files created or modified}
**Issues:** {any remaining problems, or "None"}
```

Read the diagnostic subagent's response.

**If SUCCESS:**
1. Edit the index file to change this phase's status to `COMPLETED`.
2. Print: `Phase {NN}/{total}: {title} — COMPLETED (after retry)`
3. Continue to the next phase.

**If FAILURE:**
1. Edit the index file to change this phase's status to `FAILED`.
2. Print: `Phase {NN}/{total}: {title} — FAILED after retry. Stopping.`
3. **STOP** execution. Go to **Step 5: Report**.

### Step 3a: Single Execution (Not Phaseable)

If the plan was not phaseable, execute it directly as a single implementation:

1. Spawn an **implementer subagent** using the Agent tool with `subagent_type: "general-purpose"`. Give it:

```
You are executing an implementation command. Follow the instructions below exactly.

Read and implement the plan in {plan_file_path}

## Instructions
- Read the plan file thoroughly.
- Implement everything described in the plan.
- Run any tests or validation commands mentioned.

## When Done
Report EXACTLY this at the end of your response:

### Result
**STATUS:** SUCCESS or FAILURE
**Summary:** {1-2 sentence summary of what was done}
**Files Changed:** {list of files created or modified}
**Issues:** {any problems encountered, or "None"}
```

2. If FAILURE, run **one retry** using the diagnose-and-retry pattern from Step 4d.
3. Go to **Step 5: Report**.

### Step 5: Report

Print a final summary:

```
## Phase-Execute Summary
- **Plan:** {plan file path}
- **Phases:** {completed}/{total} completed
- **Status:** {ALL COMPLETE / PARTIAL / FAILED}
- **Phase Results:**
  - Phase 01: {title} — {COMPLETED/FAILED/NOT STARTED}
  - Phase 02: {title} — {COMPLETED/FAILED/NOT STARTED}
  - ...
```

## Rules

- **Stay lightweight.** You are the orchestrator. Read files, spawn subagents, update the index file. Do not write application code or implement phases yourself.
- **Fresh contexts.** Every subagent gets a fresh context via the Agent tool. This is the whole point — each phase runs in an isolated context window.
- **Reuse skills.** Invoke the `plan:phase` skill via the Skill tool for the phasing step. Never hardcode its content.
- **One retry.** Each phase gets at most one diagnostic retry. If it fails twice, stop.
- **Update status.** Always update the index file status column before and after each phase execution.
- **Print status.** After each major step, print a brief status line so the user can follow along.
- **No commits.** Do not create git commits. Leave all changes uncommitted.
