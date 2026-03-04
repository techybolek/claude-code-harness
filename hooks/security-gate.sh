#!/bin/bash
set -euo pipefail

INPUT=$(cat)

TOOL=$(echo "$INPUT" | python -c "import sys,json; print(json.load(sys.stdin).get('tool_name',''))")

if [ "$TOOL" = "Bash" ]; then
  CMD=$(echo "$INPUT" | python -c "import sys,json; print(json.load(sys.stdin).get('tool_input',{}).get('command',''))")
  if echo "$CMD" | grep -qwE '\brm\b|\bsudo\b'; then
    python -c "
import json
print(json.dumps({
  'hookSpecificOutput': {
    'hookEventName': 'PreToolUse',
    'permissionDecision': 'ask',
    'permissionDecisionReason': 'Security gate: command contains rm or sudo'
  }
}))"
    exit 0
  fi
fi

if [ "$TOOL" = "Edit" ] || [ "$TOOL" = "Write" ]; then
  FILE=$(echo "$INPUT" | python -c "import sys,json; print(json.load(sys.stdin).get('tool_input',{}).get('file_path',''))")
  if echo "$FILE" | grep -qE '\.env($|\.)'; then
    python -c "
import json
print(json.dumps({
  'hookSpecificOutput': {
    'hookEventName': 'PreToolUse',
    'permissionDecision': 'ask',
    'permissionDecisionReason': 'Security gate: editing a .env file'
  }
}))"
    exit 0
  fi
fi

exit 0
