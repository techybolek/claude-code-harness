#!/usr/bin/env bash
# /split: fork this Claude session into a new herdr pane beside it.
# Runs as a UserPromptSubmit hook and blocks the prompt, so Main gets no turn.
set -uo pipefail
in=$(cat)
prompt=$(jq -r '.prompt' <<<"$in")
[[ "$prompt" =~ ^/split([[:space:]]|$) ]] || exit 0

NOTICE="NOTICE: this conversation was split from another conversation that is still running. Do not continue any earlier work from this history. Expect the other conversation to be changing files in the same working directory at the same time. Act only on what the user asks next. Reply only with a one-line confirmation and wait."
HELP="/split [--help]
Fork this whole conversation into a new herdr pane beside this one. Main is not changed.
The fork starts with a notice that Main is still running and may change files.
Branching at a chosen message is not supported (Claude Code can only fork the whole session).
Needs: claude running in a herdr pane (HERDR_ENV=1)."

out() { jq -n --arg r "$1" '{decision:"block",reason:$r}'; exit 0; }
fail() { out "/split refused: $1"; }

arg=$(sed -E 's#^/split[[:space:]]*##; s/[[:space:]]+$//' <<<"$prompt")
[[ -z "$arg" ]] || { [[ "$arg" == "--help" || "$arg" == "-h" ]] && out "$HELP"; out "/split: unknown argument \"$arg\"
$HELP"; }

sid=$(jq -r '.session_id' <<<"$in")
cwd=$(jq -r '.cwd' <<<"$in")
tr=$(jq -r '.transcript_path' <<<"$in")
# Claude writes the transcript only after the first message; --resume needs it.
[[ -f "$tr" ]] && grep -q '"type":"user"' "$tr" || fail "no messages to fork yet (send a message first)"
pane=${HERDR_PANE_ID:-}
[[ "${HERDR_ENV:-}" == 1 && -n "$pane" ]] || fail "not running inside a herdr pane"

info=$(herdr pane get "$pane" 2>&1) || fail "herdr pane get: $info"
agent=$(jq -r '.result.pane.agent // ""' <<<"$info")
reported=$(jq -r '.result.pane.agent_session.value // ""' <<<"$info")
[[ "$agent" == claude && "$reported" == "$sid" ]] || fail "pane $pane is not verifiably running this claude session"

r=$(herdr pane split "$pane" --direction right --cwd "$cwd" --no-focus 2>&1) || fail "herdr pane split: $r"
np=$(jq -r '.result.pane.pane_id' <<<"$r")
name="split-${sid: -6}"
if ! r=$(herdr agent start "$name" --kind claude --pane "$np" --timeout 20000 -- --resume "$sid" --fork-session "$NOTICE" 2>&1); then
  herdr pane close "$np" >/dev/null 2>&1
  fail "herdr agent start: $r"
fi
out "Split into pane $np ($name): whole conversation forked."
