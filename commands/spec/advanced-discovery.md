---
description: Start or resume the Discovery-to-PRD pipeline
argument-hint: [--description "<text>"] [--resume <phase>] [--project <name>]
---

Run the Discovery Pipeline to transform ideas into Product Requirements Documents.

## What This Does

A 5-phase pipeline:

1. **Interview** (Interactive, this session): Socratic questioning to understand requirements
2. **Research** (Autonomous, Workflow tool): Web search to validate and expand findings
3. **Synthesis** (Autonomous, Workflow tool): Combine into structured PRD draft
4. **Review** (Autonomous, Workflow tool): Adversarial critical review with lens scoring
5. **Consolidation** (Autonomous, Workflow tool): Synthesize review into final PRD

Phase 1 is a live conversation with you and runs in this session. Phases 2-5
run as one fresh-context agent each inside a single background Workflow run
(`~/.claude/workflows/discovery-flow.js`) — same architecture as
`/ralph:flow`'s implement loop.

## Usage

**Start new discovery:**
```bash
/spec:advanced-discovery
```
You will be prompted for a description of what you want to build. The project name is auto-derived from your description.

**Start with inline description:**
```bash
/spec:advanced-discovery -d "A mobile app for tracking personal expenses"
```
Seeds the interview with this description as context — the Socratic interview still runs interactively.

**Start with a file as input:**
```bash
/spec:advanced-discovery /path/to/brief.txt
```
Reads the file and uses its contents as the starting context for the Socratic interview — the interview still runs interactively.

**Resume from specific phase:**
```bash
/spec:advanced-discovery --resume research
/spec:advanced-discovery --resume synthesis
/spec:advanced-discovery --resume review
/spec:advanced-discovery --resume consolidation
```
Resuming skips the interview entirely and goes straight to launching the
Workflow at that phase — use this after a `blocked`/`agent_error` outcome, or
to redo a later phase without repeating the interview.

**Start with project name:**
```bash
/spec:advanced-discovery --project mobile-checkout
```

**List phases:**
```bash
/spec:advanced-discovery --list
```

## Output Location

All artifacts saved to: `SPEC/DISCOVERY/<project-name>/`
- `01-interview.md` - Interview notes
- `02-research.md` - Research findings
- `03-prd-draft.md` - PRD draft
- `04-prd-review.md` - Critical review with lens scores
- `05-prd-final.md` - Final PRD (consolidated)

## Execution

**IMPORTANT:** Check `$ARGUMENTS` BEFORE running any commands.

### If `--list` is present:
Display the phase list from "What This Does" section above. Do NOT run any phases.

### Project name resolution (applies to all modes):
- If `--project <name>` is provided: use that name
- If `--resume` is used without `--project`: list `SPEC/DISCOVERY/` subdirectories and use the most recently modified one, or ask the user if ambiguous

### If `--resume <phase>` is present:
Resolve the project name (see above), then skip straight to **Launch the Workflow** below with `startPhase: "<phase>"`.

### Otherwise (new discovery - NO --resume flag):
**Run Phase 1 directly in this session, then launch the Workflow at `research`.**

1. **Get initial context:**
   - If `$ARGUMENTS` is a file path (starts with `/` or `./`, or ends with a file extension like `.txt`, `.md`): read the file and use its contents as the **starting context** for the interview
   - If `--description` or `-d` is provided: use that value as the **starting context** for the interview
   - If no context provided: ask the user "What do you want to build?" and use their answer as starting context

   **CRITICAL: Having initial context does NOT skip the interview. It is the opening topic, not the interview output.**

2. **Derive project name:**
   - Create a kebab-case name from the context (2-4 words, lowercase)
   - If `--project` provided, use that instead
   - **Sanitize before use (applies to both):** the name must match `^[a-z0-9][a-z0-9-]*$`.
     Lowercase it, replace any run of other characters with a single `-`, and strip
     leading/trailing `-`. If nothing survives, ask the user for a name. This name
     becomes a directory path and is interpolated into every workflow path — a space,
     slash, or `..` breaks the run.

3. **Create output directory:**
   ```bash
   mkdir -p SPEC/DISCOVERY/<project-name>
   ```

4. **Run Phase 1 Interview — ALWAYS INTERACTIVE:**
   Read and follow the Socratic interview prompt from:
   `~/.claude/scripts/discovery_agent/prompts/PHASE_1_INTERVIEW.md`

   **MANDATORY:** Phase 1 is a live conversation with the user. You MUST:
   - Ask questions and WAIT for user responses before continuing
   - Never auto-fill answers from the initial context
   - Never generate the discovery document without completing the full interview conversation
   - Use the initial context to ask *informed* questions, not to skip asking them

   The initial context tells you *what* to ask about — it does not answer the questions for you.

5. **Save interview output:**
   Write the completed discovery document to: `SPEC/DISCOVERY/<project-name>/01-interview.md`
   Only do this AFTER the interview conversation is complete and the user has confirmed the summary.

6. **Launch the Workflow at `research`** (see below).

---

## Launch the Workflow

Invoke the Workflow tool with `scriptPath: ~/.claude/workflows/discovery-flow.js` and
`args: { projectRoot: "$PWD", projectName: "<project-name>", startPhase: "<research|synthesis|review|consolidation>" }`.

It runs in the background: wait for the completion notification. Do not poll,
and never report results before the notification arrives.

### Act on the outcome (the workflow's return value):

- **`done`** — guard first: confirm `SPEC/DISCOVERY/<project-name>/05-prd-final.md`
  exists (`ls`). If missing, treat as incomplete and say so rather than
  reporting success. Otherwise tell the user the PRD is ready and where it lives.
- **`blocked`** — report `blockedReason` verbatim plus `failedPhase`. After the
  user resolves it: `/spec:advanced-discovery --project <project-name> --resume <failedPhase>`.
  Exception: if `blockedReason` names a missing input file, the phase that *produces*
  that file is the one that failed — resume there instead, or resuming `<failedPhase>`
  just blocks again.
- **`agent_error`** — a phase agent died twice in a row (likely a transient API
  issue). Tell the user to re-run with `--resume <failedPhase>` once the API is healthy.
- **`FAILED`** — bad args reached the workflow; this indicates a bug in this
  command's launch step, not the pipeline itself. Report the `reason` verbatim.
