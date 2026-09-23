# CLAUDE.md

---

## Core Principles

### YAGNI
Speculative code is never exercised, so it rots silently and misleads whoever reads it next.
- Choose the simplest solution that works; no speculative features or "just in case" code
- Delete unused code — don't comment it out; git has the history

### Be concise
In all interactions and documents be extremely concise and prioritize brevity over style.

### Real Tests Over Mocks
- Prefer real integration tests. Needing network, external services, or API keys is not a reason to avoid them — set up credentials and test for real.
- Mock only when exercising many combinations of pure logic where real calls add nothing (e.g. input validation edge cases), and comment why (e.g. `// Mock: pure input validation, never reaches DB`).
- A test that asserts on the same hardcoded data its mock returns catches nothing — delete it.

## Git Commits

Use Conventional Commits.

## Web browsing

- Use the `playwright-cli` skill for **interactive browsing** — JS-rendered pages, login/auth, clicking, form fill, screenshots.
- Use the built-in `WebSearch` / `WebFetch` tools for **search and reading static pages**.
- **Never** use `mcp__claude-in-chrome__*` tools.
