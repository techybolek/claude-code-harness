# CLAUDE.md

---

## Core Principles

### KISS (Keep It Simple, Stupid)
- Choose the simplest solution that works
- One function = one responsibility
- If it's hard to explain, it's too complex

### YAGNI (You Aren't Gonna Need It)
- Only implement what's needed NOW
- No speculative features or "just in case" code
- Delete unused code immediately - don't comment it out

### Be concise
In all interactions be extremely concise and prioritize brevity over style.

### Atomic Tests
- One test = one behavior/scenario
- Test name format: `test_<function>_<scenario>_<expected_result>`
- Each test must be independent and isolated
- No shared mutable state between tests

### Test Workflow
1. Write test BEFORE implementation (TDD is required, not optional)
2. Run existing tests before making changes
3. Run all tests after changes
4. Never commit with failing tests

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

## gstack

- Use the `/browse` skill from gstack for **all web browsing**.
- **Never** use `mcp__claude-in-chrome__*` tools.

### Available skills

`/office-hours`, `/plan-ceo-review`, `/plan-eng-review`, `/plan-design-review`, `/design-consultation`, `/design-shotgun`, `/design-html`, `/review`, `/ship`, `/land-and-deploy`, `/canary`, `/benchmark`, `/browse`, `/connect-chrome`, `/qa`, `/qa-only`, `/design-review`, `/setup-browser-cookies`, `/setup-deploy`, `/setup-gbrain`, `/retro`, `/investigate`, `/document-release`, `/codex`, `/cso`, `/autoplan`, `/plan-devex-review`, `/devex-review`, `/careful`, `/freeze`, `/guard`, `/unfreeze`, `/gstack-upgrade`, `/learn`
