---
description: Audit the codebase and agent harness against the enforcement pyramid and suggest improvements — report only
argument-hint: "[path or area to focus on]"
---

Audit the current project (focus: $ARGUMENTS, else whole repo) and its agent harness (CLAUDE.md/AGENTS.md, .claude/ settings, hooks, skills, commands). **Report only — apply nothing.**

Principle: agents copy what exists and take the shortest path, so make the easy thing the right thing. Prefer the highest layer that works:
1. **Code** — architecture, types/invariants, clear boundaries that make mistakes impossible.
2. **Static analysis** — lint rules, tests, CI, hooks: deterministic, fail fast.
3. **Prose** — rules, docs, skills: only for what needs judgment. Minimal.
4. **Human review** — least scalable; spend it on the environment, not every PR.

Look for:
- Bad patterns an agent would copy (inconsistent idioms, escape hatches like `any`/casts, duplicated logic).
- Prose rules that could be enforced by a type, lint rule, test, or hook — propose the replacement and the prose to delete.
- Prose that's stale, contradictory, or restates what the code already enforces.
- Recurring review findings (check git log / review reports) that keep needing human or LLM attention.

Output: findings ordered by leverage, each with layer tag (`[code]` `[static]` `[prose]` `[harness]`), `file:line` evidence, the concrete change, and what it eliminates. End with a confusion report: what you couldn't assess or are unsure about.
