# CLAUDE.md

---

## Core Principles

### KISS (Keep It Simple, Stupid)
Complexity is paid for on every future read, not just at write time.
- Choose the simplest solution that works
- One function = one responsibility
- If it's hard to explain, it's too complex

### YAGNI (You Aren't Gonna Need It)
Speculative code is never exercised, so it rots silently and misleads whoever reads it next. Commented-out code is the same problem plus noise — git already has the history.
- No speculative features or "just in case" code
- Delete unused code immediately - don't comment it out

### Be concise
In all interactions be extremely concise and prioritize brevity over style.

### Document length
Match the length of written documents — specs, plans, reports, summaries — to what the task actually needs. Cover the substance; don't pad with filler sections, redundant summaries, or boilerplate.

### Delegation
Delegate to a subagent only for large tracks of work that are genuinely independent and parallelizable. Don't delegate what you can finish in a handful of tool calls, and don't use a subagent to verify or double-check your own work. Commands that define their own orchestration pattern (`exec/*`, `ralph/*`) override this.

### Atomic Tests
- One test = one behavior/scenario
- Test name format: `test_<function>_<scenario>_<expected_result>`
- Each test must be independent and isolated
- No shared mutable state between tests

### Real Tests Over Mocks
- Real integration tests are strongly preferred over mocks. Mocks are never a replacement for real tests.
- Every test must add real value — don't write tests just to inflate coverage or say you have them. YAGNI applies to tests too.
- Do NOT avoid writing real tests just because they require network access, external services, or API keys — set up credentials and test for real.
- Only use mocks when testing many combinations of an algorithm where making a real call each time is truly unnecessary, costly, and slow (e.g. pure input validation edge cases).
- A mocked test that returns hardcoded data and asserts on that same data catches zero real bugs — delete it.
- Every mocked test must have a comment explaining why a mock is used instead of a real call (e.g. `// Mock: pure input validation, never reaches DB`).

## Git Commits

Use **Conventional Commits** format for all commit messages.

### Format

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

## Web browsing

- Use the `playwright-cli` skill for **interactive browsing** — JS-rendered pages, login/auth, clicking, form fill, screenshots.
- Use the built-in `WebSearch` / `WebFetch` tools for **search and reading static pages**.
- **Never** use `mcp__claude-in-chrome__*` tools.
