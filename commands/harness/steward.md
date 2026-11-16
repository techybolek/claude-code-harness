---
description: Self-improving harness — read recent real sessions, diagnose recurring harness problems with Fable 5.2, walk the user through proposed fixes, apply approved ones uncommitted
---

You run the harness steward. A workflow reads the user's sessions since the last run and proposes fixes; you walk the user through them one at a time and apply only what they approve. Never commit. Never edit files outside `~/.claude`. The spec is `~/.claude/SPEC/FEATURE-REQUEST/harness-steward-2026-11-15.md`.

## Step 1 — Window and digests

1. `RUN_START=$(date -u +%Y-%m-%dT%H:%M:%SZ)`.
2. `SINCE` = `.lastRun` from `~/.claude/state/steward.json`; if the file is missing, 30 days before `RUN_START`.
3. `DIGESTS=$(mktemp -d)`; run `python3 -I ~/.claude/scripts/steward/steward.py extract "$SINCE" "$DIGESTS"` and keep its JSON manifest.
4. `sessions` is 0 → tell the user there is nothing to review, write `{"lastRun": "<RUN_START>"}` to `~/.claude/state/steward.json`, stop.
5. Print one line: `Steward: <sessions> sessions since <SINCE>, <batches> reader batches.`
6. `git -C ~/.claude status --porcelain` not empty → mention that approved changes will sit alongside the existing uncommitted changes.

## Step 2 — Diagnose

**Workflow** tool: `scriptPath: ~/.claude/workflows/harness-steward.js`, `args: { "batches": <manifest.batches>, "since": "<SINCE>", "harnessRoot": "/home/tromanow/.claude" }` as a real JSON object. Wait for the completion notification; never poll.

- `status` FAILED → report the reason, do not update state, stop.
- `deadBatches` not empty → say which batches were lost (their sessions were not reviewed).
- `diagnosisModel` is not `claude-fable-5-2` → say Fable was unavailable and Opus 5.5 diagnosed.

Cost: `python3 -I ~/.claude/scripts/steward/steward.py cost <workflow transcript dir>` (the run's directory under this session's `subagents/workflows/<runId>/`). Keep it for the summary.

## Step 3 — Walkthrough

Show the `overview`, then the ledger verdicts in one short list.

Then each proposal in order, one per AskUserQuestion call. Before asking, show: title, kind, cause, 2–3 evidence lines, the target file, the diff (old → new), the signal and expected effect, and the ADR draft if any. Options: **Apply**, **Skip**. The user's "Other" text means apply with that adjustment.

- Re-read the target file before applying. If an `oldString` no longer occurs exactly once, re-derive the edit from the current file, show the new diff, and ask again.
- Apply with Edit. For an ADR draft: write `~/.claude/adr/NNNN-<kebab-title>.md` (next number, status Accepted, today's date), add it to `adr/index.md`; if it supersedes one, set the old ADR's status to `Superseded by ADR-NNNN` and remove it from the index.
- Track every answer: applied, adjusted, or skipped (with the user's reason if given).

Last, if `tuningLogClosures` is not empty, ask once whether to tick those items in `notes/harness-tuning-log.md`, each annotated `(closed by steward <date>: <evidence>)`.

## Step 4 — Record

1. Append to `~/.claude/notes/steward-ledger.md` (create with a `# Steward ledger` heading if missing) a section `## <RUN_START date>` with:
   - one line per applied change: `- [evaluating] <title> — <targetFile> — signal: <name> (<howMeasured>), baseline <baseline>`
   - one line per skipped proposal: `- [declined] <title> — <reason or "no reason given">`
   - for each ledger verdict from this run: update that earlier line's tag in place (`kept`, `reverted`, `confounded`) when the user applied the revert or the verdict is final.
2. Write `{"lastRun": "<RUN_START>"}` to `~/.claude/state/steward.json`.
3. `rm -rf "$DIGESTS"`.

## Step 5 — Summary

Three to six lines: sessions reviewed, proposals applied/adjusted/skipped, ledger verdicts, tuning-log items closed, approximate cost, and the files now changed (uncommitted) for the user to review.
