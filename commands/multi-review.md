---
description: "Cross-model review panel: 5 heterogeneous reviewers (codex, orion, GLM-5.3, DeepSeek Flash, Nemotron) over a document or code, then an adjudicated scorecard rating each reviewer's precision and unique catches"
---

# Multi-Model Review Panel

You orchestrate a panel of five independent reviewers over one target — a document **or** code — and then judge both the target *and the reviewers*. The command has two products, and the second matters as much as the first:

1. **A merged review** of the target.
2. **A scorecard** rating each seat: was it right, what did it alone catch, what did it invent.

The panel is heterogeneous on purpose. Same-model reviewers share priors and therefore blind spots; five different models and harnesses over identical input make a disagreement informative and an unopposed unique catch interesting.

## Input
$ARGUMENTS

A target path (file or directory), plus optional `seats=a,b,c`, `mode=inline|tools`, `timeout=<sec>`.
If no target is given, use the most recently modified file in cwd that looks like a document and say which you picked (don't ask).

## Seats

| seat | tool | model |
|---|---|---|
| `codex` | `codex exec --sandbox read-only` | (codex default) |
| `orion` | `ask_orion` | (orion default) |
| `glm` | `piglm` | glm-5p3 |
| `kimi` | `pikimi` | kimi-k3 — **off by default**, opt in via `seats=` |
| `dsflash` | `pidsf` | deepseek-v4-flash-0731 |
| `nemotron` | `pinemo` | nemotron-lightning-3p5-30b-a3b |
| `dsh` | `ask_dsh` | dsh default (glm-5p3) — **off by default**, opt in via `seats=` |

## Steps

1. **Resolve.** Absolute target path. Pick the mode unless the user set one:
   - single document (`.md`/`.txt`/`.pdf`-ish prose) → `inline`
   - directory, repo, or source tree → `tools`
   Say which target and mode you chose.

2. **Compose ONE prompt file** under the scratchpad — every seat gets byte-identical input, which is what makes the comparison meaningful. It must ask for: a one-line title per finding, a severity (`BLOCKING` / `NIT`), one sentence of justification, and the literal `NO FINDINGS` when clean. Tell it to be concise and not restate the target.
   - `inline` mode: append the full target content to the prompt.
   - `tools` mode: name the paths to review and let the seat read them; do not paste content.

3. **Run the panel** in ONE Bash call. It fans out in parallel internally, but **the call prints nothing until the slowest seat finishes** — a silent 5-10 minutes is normal, not a hang. Budget by the slowest seat, not the average: `orion` and `dsflash` have taken 6-7 min on a ~17KB inline prompt, while `nemotron`/`codex`/`glm` land in under 2. **Set the Bash `timeout` to at least the `--timeout` you pass plus 60s** — the tool's 120s default would kill a normal panel mid-run.
   ```
   ~/.claude/scripts/panel-review.sh --prompt <prompt> --out <rundir> \
     --workdir <target dir> --mode <mode> [--seats ...] [--timeout ...]
   ```
   Use `<scratchpad>/panel/run-<YYYYMMDD-HHMMSS>` as `<rundir>` so runs don't overwrite each other.
   Outputs land as `<rundir>/<seat>.md` with `<seat>.meta` (exit, status, seconds, bytes) and `<seat>.log` (stderr/progress).

4. **Check the seats before trusting them.** Read every `.meta`. A seat with `status=timeout|error|empty` produced no review — report it as unavailable, never as a clean pass. A seat that returned nothing is not a seat that found nothing.

5. **Adjudicate — this is the point of the command, not a formality.** Read every seat's findings, then go back to the *actual target* and judge each one yourself:
   - **VALID** — the defect is really there.
   - **FALSE** — contradicted by the target, or invented. Say what the target actually says.
   - **UNVERIFIABLE** — plausible but not decidable from the target alone.
   Collapse findings that are the same defect into one row, recording every seat that raised it. Independent detection is corroboration; a lone finding is not thereby wrong, and a unanimous one is not thereby right — check it.

6. **Write the report** to `<target dir>/multi-review-<YYYYMMDD-HHMMSS>.md`:
   - header: date, target, mode, seat roster, per-seat status/time
   - **Merged findings**: every distinct defect, severity, adjudication, and which seats raised it — BLOCKING first
   - **Scorecard**, one row per seat: `raised | valid | false | unverifiable | unique valid | precision | seconds`
   - **Read on the panel**: 2-4 sentences — who earned a seat, who was redundant, who hallucinated, and whether a cheaper roster would have found the same set
   - per-seat verbatim output in an appendix

7. **Print** the report path, **the run directory** (raw seat outputs live there and are not otherwise discoverable — the scratchpad path contains a session-uuid segment no other session can guess), a one-line verdict, and the scorecard table.

## Rules

- **Read-only, always.** Nothing here fixes, edits, or commits anything. `codex` runs `--sandbox read-only`; pi seats get no write/edit/bash tools. If the user wants the findings fixed, that is a separate request.
- **Never fabricate a seat's output.** If a seat failed, its row says so. A 3/5 panel is useful signal; 0/5 means the tooling is down — say that instead of writing an empty report.
- **Precision is per-seat, computed from your adjudication** — a seat that raises 10 findings of which 3 are real ranks below one that raises 3 real ones. Do not rank by finding count.
- **Judge the finding, not the seat's reputation.** codex being usually-strong is not evidence for a specific claim; nemotron being cheap is not evidence against one.
- The scorecard is meant to be acted on: if a seat has been redundant across several runs, say so plainly so the roster can shrink.
