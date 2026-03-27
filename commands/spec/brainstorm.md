# Brainstorm & Explore Solutions

Research, explore, and brainstorm possible solutions to a problem, then deliver concrete recommendation(s).

## Recent Codebase Activity
Before starting, run `git log --oneline --stat -5` to understand recent changes.
Use this context to understand what areas of the codebase are actively being worked on.
This should inform your understanding but not override the user's explicit request.

## Instructions

- Use your reasoning model: THINK HARD about the problem before proposing solutions.
- This is a collaborative brainstorming session — explore different approaches from multiple angles.
- **Research first, brainstorm second.** Before generating options, investigate:
  - The codebase — understand what exists, what patterns are used, what constraints apply.
  - The web — look for established solutions, libraries, best practices, and prior art.
- Consider trade-offs, constraints, and real-world implications of each approach.
- Generate at least 3 distinct approaches. Push beyond the obvious first idea.
- For each approach, be specific about *how* it would work in this codebase, not just in theory.
- Score each approach against the evaluation criteria to make the comparison concrete.
- End with a clear, opinionated recommendation. Don't sit on the fence.

## Output Format

### Problem Statement
<Restate the problem clearly and concisely. Call out any ambiguities or assumptions.>

### Research Findings
<Summarize what you learned from investigating the codebase and/or web. Include relevant patterns, libraries, prior art, or constraints that inform the solution space.>

### Evaluation Criteria
<List 4-6 criteria that matter for this problem, e.g.:>
- Complexity (how much code/effort)
- Reliability
- Performance
- Maintainability
- Compatibility with existing patterns
- User experience

### Options

#### Option 1: <name>
**How it works:** <concrete description — what changes, what's added, how it fits>
**Scores:**
| Criterion | Rating | Notes |
|-----------|--------|-------|
| <criterion> | <low/med/high> | <why> |

#### Option 2: <name>
**How it works:** <concrete description>
**Scores:**
| Criterion | Rating | Notes |
|-----------|--------|-------|
| <criterion> | <low/med/high> | <why> |

#### Option 3: <name>
**How it works:** <concrete description>
**Scores:**
| Criterion | Rating | Notes |
|-----------|--------|-------|
| <criterion> | <low/med/high> | <why> |

<Add more options as warranted>

### Comparison Matrix
| Criterion | Option 1 | Option 2 | Option 3 |
|-----------|----------|----------|----------|
| <criterion> | <rating> | <rating> | <rating> |

### Recommendation
**Go with: <option name>**

<Explain why this is the best choice. Be direct. Address why the alternatives fall short. Call out any risks or caveats with the recommended approach.>

### Open Questions
<List any questions that need answers before making a final decision.>

### Next Steps
<2-4 concrete next actions to move forward with the recommendation. Reference relevant commands like `/plan:feature` or `/refine` if appropriate.>

## Problem
$ARGUMENTS
