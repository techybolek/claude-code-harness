#!/bin/bash
# Review-stage config for ~/PROJECTS/TP/TPV2, sourced by ralph-pipeline.sh.
# Commands run from the worktree root by the review-flow-only validator.
# ng build is NOT included: it fails in any fresh checkout (angular.json
# references untracked compiled CSS with no committed source) — bundle-size
# gates must run in the main repo until that is fixed.
VALIDATION_COMMANDS=(
    "cd backend && npm test"
    "cd frontend && npx tsc --noEmit"
)
