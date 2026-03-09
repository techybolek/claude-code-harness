---
description: Analyze a plan and break it into separately testable phases
---

# Plan Phasing Analysis

Analyze the provided plan and break it into separately testable phases. Create files in `SPEC/PLAN/PHASED/{original-name}/` with `_phase_XX` suffixes.

## Instructions

1. **Read and analyze the plan** — understand scope, requirements, and steps.

2. **Evaluate if phasing makes sense.** A plan is phaseable if:
   - It has multiple distinct functional components
   - Each phase delivers testable value independently
   - Earlier phases don't require later phases to be testable

3. **Don't phase when:**
   - The plan is small/focused (single feature)
   - Components are tightly coupled
   - Total scope is < 1 day of work

4. **If phaseable** — create:
   - `SPEC/PLAN/PHASED/{name}/{name}_phase_00_index.md` — overview
   - `SPEC/PLAN/PHASED/{name}/{name}_phase_01.md` — first phase
   - etc.

5. **If not phaseable** — report why and leave the original unchanged.

## File Formats

### Index File (`_phase_00_index.md`)

```md
# Phased Plan: <feature name>

**Original Plan:** <path>
**Phase Count:** <N>
**Estimated Scope:** <small/medium/large>

## Overview
<summary and rationale for phasing>

## Phase Dependency Graph
<dependencies between phases>

## Phase Index

| Phase | Title | Status | File |
|-------|-------|--------|------|
| 01 | <title> | NOT STARTED | [phase_01](./{name}_phase_01.md) |
| ... | ... | ... | ... |

## Implementation Notes
<cross-cutting concerns, shared patterns>

## Risk Assessment
<risks to the phased approach>
```

### Phase File (`_phase_XX.md`)

```md
# Phase XX: <Title>

**Parent Plan:** [Phase Index](./{name}_phase_00_index.md)
**Status:** NOT STARTED
**Phase:** XX of N

## Goal
<what this phase delivers independently>

## Prerequisites
- [ ] <prerequisite>

## Scope
- <item>

## Deliverables
- [ ] <deliverable>

## Test Plan (write these BEFORE implementing)
- [ ] <test name and what it asserts>

## Implementation Steps
1. Write the tests listed in Test Plan first — they must fail before you write any implementation code.
2. <step>
3. Run tests — they must all pass before this phase is considered complete.

## Validation Criteria
- [ ] All tests in Test Plan pass
- [ ] <additional testable criterion>

## Files Touched
- `path/to/file.py` - <description>

## Notes
<phase-specific notes>
```

## Natural Phase Boundaries

Consider splitting along these lines:
- Infrastructure vs Application
- Backend vs Frontend
- Core vs Extended functionality
- Read vs Write operations

**TDD constraint:** Each phase must include its own tests. Never create a dedicated "testing phase" at the end — tests belong inside the phase that implements the feature. Phases are complete only when their tests pass.

## Plan to Analyze
$ARGUMENTS

## Report

1. **Phasing Decision:** PHASEABLE or NOT PHASEABLE
2. **Reasoning:** Brief explanation
3. **If phaseable:** Number of phases, brief descriptions, list of files created
4. **If not phaseable:** Why, and any suggestions for the original plan
