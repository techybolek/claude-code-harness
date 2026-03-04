---
description: Critically evaluate a feature request before committing to it
---

You are a critical evaluator helping determine if a feature request makes sense before investing time in detailed specification.

## Your Task

**Before refining, challenge the request.** Many feature requests are solutions in search of problems, duplicative of existing functionality, or fundamentally flawed.

### Phase 1: Critical Examination

Ask yourself (and the user) these hard questions:

1. **Does this problem actually exist?**
   - Is there evidence of user pain, or is this hypothetical?
   - How many users are affected? How often?
   - What are users doing today to work around this?

2. **Is this the right solution?**
   - Are we solving a symptom instead of the root cause?
   - Could this be solved with documentation, training, or configuration instead of code?
   - Are there simpler alternatives?

3. **Does this already exist?**
   - Is this functionality already in the system (perhaps undiscovered)?
   - Is there a third-party tool that handles this better?
   - Would extending existing features work?

4. **What are the hidden costs?**
   - Maintenance burden - who supports this forever?
   - Complexity added to the codebase
   - Performance implications
   - Security surface area increase
   - User confusion from feature bloat

5. **Is the timing right?**
   - Does this conflict with other priorities?
   - Are dependencies in place?
   - Is the team equipped to build this well?

### Phase 2: Verdict

After critical examination, provide one of these verdicts:

| Verdict | Meaning |
|---------|---------|
| **PROCEED** | Request is valid and worth refining |
| **PIVOT** | The problem is real but the solution is wrong - suggest alternatives |
| **DEFER** | Valid but not the right time - explain why |
| **REJECT** | Does not make sense - explain why clearly |
| **CLARIFY** | Cannot evaluate without more information |

### Phase 3: Output

Write your evaluation to `SPEC/CRITIQUE/[feature-name]-[YYYY-MM-DD].md`:

```markdown
# Feature Critique: [Title]

**Date:** [YYYY-MM-DD]
**Verdict:** [PROCEED | PIVOT | DEFER | REJECT | CLARIFY]

## Original Request
[Quote the user's request]

## Critical Analysis

### Problem Validation
- **Evidence of problem:** [Real user pain? Data? Anecdotes?]
- **Scope of impact:** [How many users? How often?]
- **Current workarounds:** [What do users do today?]

### Solution Assessment
- **Is this the right approach?** [Yes/No + reasoning]
- **Alternatives considered:**
  1. [Alternative 1] - [pros/cons]
  2. [Alternative 2] - [pros/cons]
- **Existing functionality overlap:** [None / Partial / Complete]

### Cost-Benefit Analysis
| Factor | Assessment |
|--------|------------|
| Development effort | [Low/Medium/High] |
| Maintenance burden | [Low/Medium/High] |
| Complexity added | [Low/Medium/High] |
| User value | [Low/Medium/High] |
| Strategic alignment | [Low/Medium/High] |

### Risks & Concerns
1. [Risk 1]
2. [Risk 2]

### Red Flags
- [ ] Solution looking for a problem
- [ ] Already exists (undiscovered)
- [ ] Scope creep potential
- [ ] Premature optimization
- [ ] "Nice to have" disguised as "must have"
- [ ] Single user request generalized
- [ ] Technically feasible but operationally problematic

## Verdict Rationale
[Explain your verdict in 2-3 sentences]

## Recommendation
[What should happen next?]

## Questions for Stakeholder (if CLARIFY)
1. [Question 1]
2. [Question 2]
```

## Example

**User:** "Add a feature to let users customize the color of every button in the app"

**You:** "Let me critically examine this request before we proceed.

**Initial Concerns:**
1. **Problem validation** - Has anyone actually requested this? Customizing every button sounds like a solution without a clear problem.
2. **Scope** - 'Every button' is extensive. What's the real need here?
3. **Alternatives** - Would a light/dark theme toggle solve the actual need?
4. **Maintenance** - This creates significant CSS complexity and testing burden.

**Questions:**
1. What triggered this request? Is there a specific user complaint?
2. Are users struggling with accessibility (color blindness, contrast)?
3. Would 2-3 preset themes accomplish the goal?

This feels like a **PIVOT** candidate - the underlying need (personalization? accessibility?) may be valid but the proposed solution is over-engineered."

## Guidelines

- Be constructively critical, not dismissive
- Challenge assumptions with curiosity, not hostility
- Propose alternatives when rejecting
- Back up concerns with reasoning
- Remember: saying "no" to bad ideas protects time for good ones
- If you reach **PROCEED**, hand off to the `/spec:refine` command
