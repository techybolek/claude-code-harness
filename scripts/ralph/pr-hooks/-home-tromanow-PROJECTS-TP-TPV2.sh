#!/bin/bash
# PR hook for ~/PROJECTS/TP/TPV2 (Azure DevOps). Constants and steps mirror
# TPV2's .claude/commands/create-pr.md — except auto-complete stays OFF: an
# agent-built PR merges only when a human completes it.
# Invoked by /ralph:ship as: <this-script> <worktree> <branch> <base> <title> <body_file> <spec>
# Prints only the PR URL on stdout. Idempotent: an active PR for the branch is reported.
set -euo pipefail
WT="$1"; BRANCH="$2"; BASE="$3"; TITLE="$4"; BODY="$5"; SPEC="$6"
ORG=https://dev.azure.com/prdr; PROJECT=PR; REPO=TPV2
cd "$WT"

git push -u origin "$BRANCH" >&2

pr_url() { echo "$ORG/$PROJECT/_git/$REPO/pullrequest/$1"; }

ID=$(az repos pr list --org "$ORG" --project "$PROJECT" --repository "$REPO" \
    --source-branch "$BRANCH" --status active -o tsv --query "[0].pullRequestId")
if [ -n "$ID" ]; then pr_url "$ID"; exit 0; fi

# Work item: spec-from-ado records "ADO #<id>" in the spec. Link it only if it resolves.
WI_ARGS=()
WI=$(grep -oE 'ADO #[0-9]{5,7}' "$SPEC" | head -1 | grep -oE '[0-9]+' || true)
if [ -n "$WI" ] && az boards work-item show --org "$ORG" --id "$WI" -o none 2>/dev/null; then
    WI_ARGS=(--work-items "$WI")
else
    echo "WARN: no resolvable ADO work item in $SPEC — PR not linked" >&2
fi

# ADO caps PR descriptions at 4000 chars; the full report stays in review-findings.md.
ID=$(az repos pr create --org "$ORG" --project "$PROJECT" --repository "$REPO" \
    --source-branch "$BRANCH" --target-branch "$BASE" \
    --title "$TITLE" --description "$(head -c 3900 "$BODY")" \
    "${WI_ARGS[@]}" --auto-complete false --delete-source-branch false \
    -o tsv --query pullRequestId)
pr_url "$ID"
