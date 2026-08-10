---
name: verify-harness
description: Run the harness health check and fix failures until it exits green
---

Run `~/.claude/scripts/verify-harness.sh` and act on the output:

1. For each `[FAIL]`, apply the printed fix (create the missing file, correct the
   stale reference, `chmod +x`, repair the JSON). If a fix means deleting
   something or changing behavior (e.g. removing a hook registration), confirm
   with the user first.
2. Re-run the script after fixing. Loop until it exits 0.
3. Never install API keys, credentials, or system packages on the user's
   behalf — summarize `[WARN]`s and leave them to the user.
