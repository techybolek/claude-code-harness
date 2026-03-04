# Execute: Autonomous Plan → Implement

You are an orchestrator. Your job is to take a spec file, classify the work type, plan it, then implement it — using separate context windows for planning and implementation. Stay lightweight — you read files, spawn subagents, and report. You do no planning or coding yourself.

## Spec File
$ARGUMENTS

## Protocol

Execute these steps in order. Do not skip steps.

### Step 1: Read and Classify

1. Read the spec file above. If it doesn't exist, **STOP** and tell the user: "Spec file not found: {path}"
2. Read the spec content and classify the work type:
   - **bug**: The spec describes something broken, an error, a regression, or incorrect behavior that needs fixing
   - **chore**: The spec describes refactoring, cleanup, migration, dependency updates, or maintenance work
   - **feature**: Everything else — new functionality, enhancements, additions
   - If ambiguous, default to `feature`
3. Print: `Classified as: {type}`

### Step 2: Plan

1. Read the corresponding command file: `.claude/commands/plan/{type}.md` (where type is `bug`, `feature`, or `chore`)
2. Read the spec file content to use as the `$ARGUMENTS` replacement
3. Spawn a **planner subagent** using the Task tool with `subagent_type: "general-purpose"`. Give it this prompt:

```
You are executing a planning command. Follow the instructions below exactly.

{paste the ENTIRE content of .claude/commands/plan/{type}.md here, with $ARGUMENTS replaced by the full spec file content}
```

4. Read the planner's response. Extract the plan file path from the Report section (it will mention the `SPEC/PLAN/*.md` path).
5. If no plan file path was returned, **STOP** and tell the user: "Planner did not produce a plan file. Check the output above."
6. Print: `Plan created: {plan-file-path}`

### Step 3: Implement

1. Read `.claude/commands/exec/implement.md`
2. Spawn an **implementer subagent** using the Task tool with `subagent_type: "general-purpose"`. Give it this prompt:

```
You are executing an implementation command. Follow the instructions below exactly.

{paste the ENTIRE content of .claude/commands/exec/implement.md here, with $ARGUMENTS replaced by the plan file path from Step 2}
```

3. Read the implementer's response.
4. Print: `Implementation complete`

### Step 4: Report

Print a final summary:

```
## Execute Summary
- **Spec:** {spec file path}
- **Type:** {bug/feature/chore}
- **Plan:** {plan file path}
- **Implementation:** {summary from implementer's report}
```

## Rules

- **Stay lightweight.** You are the orchestrator. Read files, spawn subagents, report. Do not write application code or plans yourself.
- **Fresh contexts.** Every subagent gets a fresh context via the Task tool. This is the whole point — planning and implementation run in separate context windows.
- **Reuse commands.** Always read the actual `.claude/commands/**/*.md` files at runtime. Never hardcode their content. This keeps everything in sync when commands are updated.
- **Single pass.** This is NOT `/exec:complex`. Plan once, implement once. If implementation fails, report it and stop.
- **Print status.** After each major step, print a brief status line so the user can follow along.
