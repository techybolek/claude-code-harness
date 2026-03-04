# Feature Planning

Create a plan in `SPEC/PLAN/*.md` to implement the feature described below.

## Instructions

- Research the codebase to understand existing patterns, architecture, and conventions.
- Follow existing patterns. Don't reinvent the wheel.
- Include creating/updating automated tests as explicit steps in the plan. The task is not done until all tests pass with no regressions.

## Plan Format

```md
# Feature: <feature name>

## Feature Description
<describe the feature: purpose and value to users>

## User Story
As a <type of user>
I want to <action/goal>
So that <benefit/value>

## Problem Statement
<the problem or opportunity this feature addresses>

## Solution Statement
<proposed approach and how it solves the problem>

## Relevant Files
<list files relevant to the feature with brief rationale. New files go under an h3 'New Files' section.>

## Implementation Plan
### Phase 1: Foundation
<foundational work needed before the main feature>

### Phase 2: Core Implementation
<main implementation work>

### Phase 3: Integration
<integration with existing functionality>

## Step by Step Tasks
<h3 headers with bullet points, ordered foundationally. Include steps to create/update automated tests alongside each implementation step. Last step: run the Validation Commands.>

## Acceptance Criteria
<specific, measurable criteria for the feature to be considered complete>

## Validation Commands
<commands to run the full test suite and confirm no regressions. Discover the test runner from CLAUDE.md. Include end-to-end testing. All tests must pass.>

## Notes
<additional context, future considerations, new dependencies, etc.>
```

## Feature
$ARGUMENTS

## Report
- Summarize what you did in concise bullet points.
- Include the path to the plan file.
