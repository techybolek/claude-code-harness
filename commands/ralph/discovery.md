---
name: discovery
description: Start or resume the Discovery-to-PRD pipeline
argument-hint: [--description "<text>"] [--resume <phase>] [--project <name>]
---

Run the Discovery Pipeline to transform ideas into Product Requirements Documents.

## What This Does

Executes a 5-phase discovery pipeline:

1. **Interview** (Interactive): Socratic questioning to understand requirements
2. **Research** (Autonomous): Web search to validate and expand findings
3. **Synthesis** (Autonomous): Combine into structured PRD draft
4. **Review** (Autonomous): Adversarial critical review with lens scoring
5. **Consolidation** (Autonomous): Synthesize review into final PRD

Each phase runs in isolation with fresh context.

## Usage

**Start new discovery:**
```bash
/ralph:discovery
```
You will be prompted for a description of what you want to build. The project name is auto-derived from your description.

**Start with inline description:**
```bash
/ralph:discovery -d "A mobile app for tracking personal expenses"
```
Seeds the interview with this description as context — the Socratic interview still runs interactively.

**Start with a file as input:**
```bash
/ralph:discovery /path/to/brief.txt
```
Reads the file and uses its contents as the starting context for the Socratic interview — the interview still runs interactively.

**Resume from specific phase:**
```bash
/ralph:discovery --resume research
/ralph:discovery --resume synthesis
/ralph:discovery --resume review
/ralph:discovery --resume consolidation
```

**Start with project name:**
```bash
/ralph:discovery --project mobile-checkout
```

**List phases:**
```bash
/ralph:discovery --list
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
Resolve the project name (see above), then run the autonomous phases starting from `<phase>` through consolidation using the **Autonomous Phase Execution** process below.

### Otherwise (new discovery - NO --resume flag):
**Handle Phase 1 directly, then auto-continue with autonomous phases.**

1. **Get initial context:**
   - If `$ARGUMENTS` is a file path (starts with `/` or `./`, or ends with a file extension like `.txt`, `.md`): read the file and use its contents as the **starting context** for the interview
   - If `--description` or `-d` is provided: use that value as the **starting context** for the interview
   - If no context provided: ask the user "What do you want to build?" and use their answer as starting context

   **CRITICAL: Having initial context does NOT skip the interview. It is the opening topic, not the interview output.**

2. **Derive project name:**
   - Create a kebab-case name from the context (2-4 words, lowercase)
   - If `--project` provided, use that instead

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

6. **AUTO-CONTINUE with autonomous phases:**
   Run phases 2–5 sequentially using the **Autonomous Phase Execution** process below, starting from `research`.

---

## Autonomous Phase Execution

Run each phase in order: **research -> synthesis -> review -> consolidation**

For each phase:

1. **Skip** if the output file already exists (phase already completed)
2. **Read** the phase prompt file listed in the table below
3. **Read** all input files listed for that phase from `SPEC/DISCOVERY/<project-name>/`
4. **Invoke the Agent tool** with a prompt built as follows:

```
# Discovery Pipeline - Phase N: <phase-name>

## Project: <project-name>
## Output File: SPEC/DISCOVERY/<project-name>/<output-file>

IMPORTANT: When you complete this phase, save your output to the file above using the Write tool.

---

## Input Documents

### <input-filename>
```markdown
<contents of input file>
```

[repeat for each input]

---

## Phase Instructions

<full contents of the phase prompt file>
```

5. **Verify** the output file exists after the agent completes before proceeding to the next phase. If missing, report the failure and stop.

### Phase Reference

| Phase | Prompt File | Input Files | Output File |
|-------|-------------|-------------|-------------|
| research | PHASE_2_RESEARCH.md | 01-interview.md | 02-research.md |
| synthesis | PHASE_3_SYNTHESIS.md | 01-interview.md, 02-research.md | 03-prd-draft.md |
| review | PHASE_4_REVIEW.md | 03-prd-draft.md, 01-interview.md, 02-research.md | 04-prd-review.md |
| consolidation | PHASE_5_CONSOLIDATION.md | 03-prd-draft.md, 04-prd-review.md | 05-prd-final.md |

All prompt files are in: `~/.claude/scripts/discovery_agent/prompts/`
