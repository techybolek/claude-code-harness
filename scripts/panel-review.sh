#!/usr/bin/env bash
# panel-review.sh — fan one review prompt out to N heterogeneous reviewer CLIs
# in parallel, normalising every seat to "<out>/<seat>.md" + "<out>/<seat>.meta".
#
# The caller composes the prompt; this script only dispatches and measures.
# Each seat is isolated: one seat failing never stops the others.
#
# Usage:
#   panel-review.sh --prompt <file> --out <dir> [options]
#
#   --prompt <file>    review instruction (required)
#   --out <dir>        output directory (required, created)
#   --workdir <dir>    cwd for tool-using seats (default: $PWD)
#   --mode inline|tools   inline = no tools, prompt carries the content (default)
#                         tools  = read-only tool access to --workdir
#   --seats a,b,c      default: codex,orion,glm,dsflash,nemotron (kimi, dsh opt-in)
#   --timeout <sec>    per-seat wall clock (default 900)
set -uo pipefail

PROMPT=""; OUT=""; WORKDIR="$PWD"; MODE="inline"; TIMEOUT=900
SEATS="codex,orion,glm,dsflash,nemotron"

while [ $# -gt 0 ]; do
  case "$1" in
    --prompt)  PROMPT="$2"; shift 2 ;;
    --out)     OUT="$2"; shift 2 ;;
    --workdir) WORKDIR="$2"; shift 2 ;;
    --mode)    MODE="$2"; shift 2 ;;
    --seats)   SEATS="$2"; shift 2 ;;
    --timeout) TIMEOUT="$2"; shift 2 ;;
    *) echo "panel-review: unknown option $1" >&2; exit 2 ;;
  esac
done

[ -n "$PROMPT" ] && [ -f "$PROMPT" ] || { echo "panel-review: --prompt <file> required" >&2; exit 2; }
[ -n "$OUT" ] || { echo "panel-review: --out <dir> required" >&2; exit 2; }
case "$MODE" in inline|tools) ;; *) echo "panel-review: --mode must be inline|tools" >&2; exit 2 ;; esac

mkdir -p "$OUT"
PROMPT=$(readlink -f "$PROMPT"); OUT=$(readlink -f "$OUT"); WORKDIR=$(readlink -f "$WORKDIR")

# pi tool policy: inline seats need no tools at all; tools mode is read-only
# (no edit/write/bash) so a reviewer can never mutate what it reviews.
if [ "$MODE" = "tools" ]; then PI_TOOLS=(-t read,grep,list); else PI_TOOLS=(-nt); fi

# seat -> underlying command, recorded in .meta so a report can name what ran
seat_cmd() {
  case "$1" in
    codex)    echo "codex exec --sandbox read-only" ;;
    orion)    echo "ask_orion (orion-stage --headless)" ;;
    glm)      echo "piglm  → accounts/fireworks/models/glm-5p3" ;;
    kimi)     echo "pikimi → accounts/fireworks/models/kimi-k3" ;;
    dsflash)  echo "pidsf  → accounts/fireworks/models/deepseek-v4-flash-0731" ;;
    nemotron) echo "pinemo → accounts/fireworks/models/nemotron-lightning-3p5-30b-a3b" ;;
    dsh)      echo "ask_dsh (dsh --profile headless)" ;;
    *)        echo "unknown" ;;
  esac
}

run_seat() {
  local seat="$1"
  local md="$OUT/$seat.md" meta="$OUT/$seat.meta" log="$OUT/$seat.log"
  local start end rc
  : > "$md"
  start=$(date +%s)

  case "$seat" in
    codex)
      # -C sets the review root; --skip-git-repo-check because the target need
      # not be a git repo; -o is codex's own report file.
      timeout "$TIMEOUT" codex exec --sandbox read-only --ephemeral \
        --skip-git-repo-check -C "$WORKDIR" -o "$md" - < "$PROMPT" > "$log" 2>&1
      rc=$?
      ;;
    orion)
      # ask_orion prints progress to stdout, never the answer — it MUST be told
      # to write the review to a file, which is then the only way to read it.
      { cat "$PROMPT"; printf '\n\nWrite your complete review to the file %s . That file is your only output; do not print the review.\n' "$md"; } > "$OUT/$seat.prompt"
      ( cd "$WORKDIR" && timeout "$TIMEOUT" ask_orion "$(cat "$OUT/$seat.prompt")" ) > "$log" 2>&1
      rc=$?
      ;;
    dsh)
      ( cd "$WORKDIR" && timeout "$TIMEOUT" ask_dsh "$(cat "$PROMPT")" ) > "$md" 2> "$log"
      rc=$?
      ;;
    glm|kimi|dsflash|nemotron)
      local bin
      case "$seat" in
        glm) bin=piglm ;; kimi) bin=pikimi ;;
        dsflash) bin=pidsf ;; nemotron) bin=pinemo ;;
      esac
      ( cd "$WORKDIR" && timeout "$TIMEOUT" "$bin" "${PI_TOOLS[@]}" -p "$(cat "$PROMPT")" ) > "$md" 2> "$log"
      rc=$?
      ;;
    *)
      echo "panel-review: unknown seat '$seat'" > "$log"; rc=127 ;;
  esac

  end=$(date +%s)
  local bytes=0; [ -f "$md" ] && bytes=$(wc -c < "$md" | tr -d ' ')
  local status="ok"
  [ "$rc" -eq 124 ] && status="timeout"
  [ "$rc" -ne 0 ] && [ "$rc" -ne 124 ] && status="error"
  [ "$rc" -eq 0 ] && [ "$bytes" -lt 40 ] && status="empty"

  {
    echo "seat=$seat"
    echo "command=$(seat_cmd "$seat")"
    echo "exit=$rc"
    echo "status=$status"
    echo "seconds=$((end - start))"
    echo "bytes=$bytes"
  } > "$meta"

  printf '  %-9s %-8s %4ss  %6sB\n' "$seat" "$status" "$((end - start))" "$bytes"
}

echo "panel-review: mode=$MODE workdir=$WORKDIR"
echo "panel-review: seats=$SEATS timeout=${TIMEOUT}s"
pids=()
IFS=',' read -ra SEAT_LIST <<< "$SEATS"
for s in "${SEAT_LIST[@]}"; do
  run_seat "$s" &
  pids+=($!)
done
for p in "${pids[@]}"; do wait "$p"; done

echo "panel-review: done → $OUT"
