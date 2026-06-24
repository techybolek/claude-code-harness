---
description: "Implement the most recently generated spec (confirm → run-review)"
allowed-tools: Bash(ls:*), Bash(find:*), Bash(head:*), Bash(stat:*), Bash(grep:*)
---

# Implement the Latest Spec

Resolve the most recently generated spec from `spec:refine` / `spec:bug-report`, confirm it with the user, then hand it to the `run-review` pipeline. You add NO planning/coding/review logic of your own — `run-review` is the single source of truth for the build pipeline.

## Candidate specs

!`find SPEC/FEATURE-REQUEST SPEC/BUG-REPORT -maxdepth 1 -type f -name '*.md' ! -name 'STATUS-*' ! -name '*IMPLEMENTED*' -printf '%T@ %p\n' 2>/dev/null | sort -rn | head -5 | cut -d' ' -f2-`

## Protocol

### Step 1: Resolve the latest spec

1. The list above is the 5 newest spec `.md` files (status/implemented notes excluded), newest first.
2. The **first entry** is the target. If the list is empty, **STOP**: "No specs found in SPEC/FEATURE-REQUEST or SPEC/BUG-REPORT."

### Step 2: Confirm with the user

Read the target file's title line (first `#` heading) and print:

```
Latest spec: {path}
Title: {title}
Modified: {YYYY-MM-DD}

Implement this with the run-review pipeline? (other recent specs:)
  - {2nd newest path}
  - {3rd newest path}
```

Wait for the user to confirm. If they name a different file from the list (or supply their own path), use that instead. Do not proceed without an explicit go-ahead.

### Step 3: Delegate to run-review

Once confirmed, read `~/.claude/commands/exec/run-review.md` and execute its full protocol with `$ARGUMENTS` bound to the confirmed spec path. Everything from there — classify, plan, plan-review, implement, code-review, fix — is owned by that command.

## Rules

- **No logic duplication.** This command only resolves + confirms a path; `run-review` owns the pipeline.
- **Always confirm before running.** The spec dirs contain mixed content (screenshots, status notes); never auto-launch on a guessed file.
- **Honor an override.** If the user points at a different spec during confirmation, run that one.
