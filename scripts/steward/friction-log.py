#!/usr/bin/env python3
"""Append agent-reported friction entries to ~/.claude/state/friction.jsonl.

Usage: friction-log.py <task> [project-root]     (JSON array of entries on stdin)

Writers: /ralph:ship (pipeline agents' reports) and /reflect (its findings).
Reader: /harness:steward. The log is gitignored: entries carry project paths.
Prints the number of entries appended.
"""
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

if len(sys.argv) < 2:
    sys.exit(__doc__)
task = sys.argv[1]
project = sys.argv[2] if len(sys.argv) > 2 else os.getcwd()
entries = json.load(sys.stdin)
log = Path.home() / ".claude" / "state" / "friction.jsonl"
log.parent.mkdir(parents=True, exist_ok=True)
ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
with log.open("a") as f:
    for e in entries:
        f.write(json.dumps({"ts": ts, "project": project, "task": task, **e}) + "\n")
print(len(entries))
