---
description: Refine a vague bug report into a detailed, actionable issue
---

You are helping refine a vague bug report into a detailed, actionable issue specification.

## Recent Codebase Activity
Before starting, run `git log --oneline --stat -5` to understand recent changes.
Use this context to understand what areas of the codebase are actively being worked on.
This should inform your understanding but not override the user's explicit request.

## Your Task

1. **Analyze the user's bug report** - Identify what's clear and what's missing

2. **Ask systematic clarifying questions** - Cover these areas:
   - **Reproduction**: Exact steps to reproduce the bug
   - **Expected vs Actual**: What should happen vs what does happen?
   - **Environment**: Browser, OS, version, user role, etc.
   - **Frequency**: Always? Sometimes? Under specific conditions?
   - **Impact**: Who is affected? How severely?
   - **Evidence**: Error messages, logs, screenshots?
   - **Workarounds**: Any known workarounds?
   - **Timeline**: When did this start? Recent changes?

3. **Ask 2-4 questions at a time** - Don't overwhelm. Start with reproduction steps.

4. **Iterate until complete** - Keep asking until you can write clear reproduction steps and acceptance criteria.

5. **Write the refined bug report** to `SPEC/BUG-REPORT/[bug-name]-[YYYY-MM-DD].md` using this structure:

```markdown
# Bug Report: [Title]

**Date:** [YYYY-MM-DD]
**Status:** Confirmed
**Severity:** [Critical/High/Medium/Low]
**Priority:** [P0/P1/P2/P3]

## Summary
[One-sentence description of the bug]

## Environment
- **Application Version**: [version]
- **Browser/Client**: [browser and version]
- **Operating System**: [OS and version]
- **User Role/Permissions**: [if relevant]
- **Environment**: [Production/Staging/Development]

## Steps to Reproduce
1. [Step 1]
2. [Step 2]
3. [Step 3]

## Expected Behavior
[What should happen]

## Actual Behavior
[What actually happens]

## Error Details
- **Error Message**: [exact error text]
- **Error Code**: [if applicable]
- **Stack Trace**: [if available]
```
[paste if available]
```

## Evidence
- **Screenshots**: [attach or describe]
- **Logs**: [relevant log entries]
- **Video**: [link if available]

## Impact Assessment
- **Users Affected**: [all users / specific role / specific action]
- **Frequency**: [always / intermittent / rare]
- **Business Impact**: [describe impact]
- **Workaround Available**: [Yes/No - describe if yes]

## Root Cause Analysis
- **Suspected Cause**: [if known]
- **Related Code**: [file paths if identified]
- **Recent Changes**: [any related deployments?]

## Acceptance Criteria (Definition of Done)
- [ ] Bug no longer reproducible following the steps above
- [ ] [Additional criterion]
- [ ] [Additional criterion]

## Related Issues
- **Duplicates**: [links to duplicate reports]
- **Related**: [links to related issues]
- **Blocks**: [what this blocks]

## Notes
[Additional context, attempted fixes, etc.]
```

## Example

**User:** "The export is broken"

**You:** "Let me gather details about this bug:

1. What are you trying to export? (data type, which page/feature?)
2. What happens when you try? (error message, nothing happens, wrong output?)
3. What browser and OS are you using?
4. Did this work before? If so, when did it stop working?"

[Continue until ready to write report]

## Severity Guidelines

- **Critical**: System down, data loss, security vulnerability, no workaround
- **High**: Major feature broken, significant user impact, difficult workaround
- **Medium**: Feature partially broken, moderate impact, workaround available
- **Low**: Minor issue, cosmetic, edge case, easy workaround

## Priority Guidelines

- **P0**: Fix immediately, drop everything
- **P1**: Fix in current sprint/cycle
- **P2**: Fix in next sprint/cycle
- **P3**: Fix when time permits

## Guidelines
- Focus on facts, not assumptions
- Get exact error messages when possible
- Verify reproduction steps work
- Distinguish between symptoms and root cause
- Note any patterns (time of day, specific users, specific data)
- Stop when you can reliably reproduce the bug
