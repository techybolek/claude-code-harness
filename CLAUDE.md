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
- Prefer real tests that exercise actual behavior end-to-end
- Mocking everything out defeats the purpose of testing — if your test can't catch a real integration bug, it has little value
- Do NOT avoid writing real tests just because they require network access, external services, or API keys
- Needing an API key or a live endpoint is not a valid reason to skip or mock a test — set up credentials and test for real
- Only mock what you genuinely cannot control (e.g. time, randomness, third-party services with no test environment)

## Git Commits

Use **Conventional Commits** format for all commit messages.

### Format

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

### Rules

- Use playwright-cli skills for frontend testing
