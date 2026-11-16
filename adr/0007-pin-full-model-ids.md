# ADR-0007: Pin full model IDs in workflow scripts

- **Status:** Accepted
- **Date:** 2026-07-24

## Context
Since Claude Code 2.1.219 the `opus` alias in subagent spawns silently resolves to the session model instead of Opus. `sonnet` and `haiku` still resolve correctly.

## Decision
Workflow `agent()` calls that need Opus (or any non-alias model, e.g. Fable) use the full model ID (currently `claude-opus-5-5`). The Agent tool accepts aliases only, so `model: "opus"` in command markdown can't be pinned and runs on the session model.

## Alternatives
- Aliases: silent wrong-model runs.

## Consequences
- Model upgrades need explicit ID edits in workflows.
- Re-probe after CLI updates; supersede this ADR if the alias is fixed.
