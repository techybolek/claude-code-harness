---
description: Refine a vague feature request into a detailed specification
---

You are helping refine a vague feature request into a detailed, actionable specification.

## Recent Codebase Activity
Before starting, run `git log --oneline --stat -5` to understand recent changes.
Use this context to understand what areas of the codebase are actively being worked on.
This should inform your understanding but not override the user's explicit request.

## Your Task

1. **Analyze the user's feature request** - Identify what's clear and what's missing

2. **Ask systematic clarifying questions** - Cover these areas:
   - **Purpose**: What problem does this solve? Who benefits?
   - **Functionality**: What specific actions/features are needed?
   - **User Experience**: How do users interact with this? (UI/API/CLI?)
   - **Technical**: Any integrations, performance, or security requirements?
   - **Data**: What data is stored? Privacy considerations?
   - **Scope**: What's included? What's explicitly excluded?
   - **Success**: How do we measure if this worked?

3. **Ask 2-4 questions at a time** - Don't overwhelm. Start with the most critical gaps.

4. **Iterate until complete** - Keep asking until you can write clear acceptance criteria.

5. **Write the refined spec** to `SPEC/FEATURE-REQUEST/[feature-name]-[YYYY-MM-DD].md` using this structure:

```markdown
# Feature Request: [Title]

**Date:** [YYYY-MM-DD]
**Status:** Refined

## Overview
[Brief summary]

## Problem Statement
[What problem does this solve?]

## Users & Stakeholders
- Primary Users: [who?]
- Permissions: [any role requirements?]

## Functional Requirements
1. [Requirement 1]
2. [Requirement 2]

## User Flow
1. [Step 1]
2. [Step 2]

## Acceptance Criteria
- [ ] [Criterion 1]
- [ ] [Criterion 2]

## User Experience
- **Interface**: [Web/API/Mobile/CLI]
- **Key Interactions**: [describe]
- **Feedback**: Success/error messages

## Technical Requirements
- **Integration**: [systems involved]
- **Performance**: [requirements]
- **Security**: [auth/privacy needs]
- **Platform**: [desktop/mobile/both]

## Data Model
- **Storage**: [what data?]
- **Retention**: [how long?]
- **Privacy**: [GDPR/compliance]

## Edge Cases & Error Handling
1. [Case 1] → [behavior]
2. [Case 2] → [behavior]

## Dependencies
- **Requires**: [dependencies]
- **Blocks**: [what this blocks]

## Out of Scope
- [What's NOT included]

## Success Metrics
- [How to measure success]

## Notes
[Additional context]
```

## Example

**User:** "Add export functionality"

**You:** "Let me refine this feature request with some questions:

1. What data should be exportable? (user profile, activity logs, created content, everything?)
2. What format(s)? (CSV, JSON, PDF, Excel?)
3. Should users select what to export or export everything?
4. Where should this feature be accessed from?"

[Continue until ready to write spec]

## Guidelines
- Anticipate edge cases
- Provide multiple-choice options when helpful
- Confirm understanding by paraphrasing
- Stop when you can write clear acceptance criteria
