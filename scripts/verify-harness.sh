#!/bin/bash
#
# verify-harness.sh - Health check for the ~/.claude harness
# ===========================================================
#
# Detects dead references before they bite at runtime: hooks registered in
# settings.json whose scripts don't exist, commands/workflows that reference
# missing ~/.claude files, skills without a valid SKILL.md, and ralph scripts
# that lost their executable bit. Motivated by safety_validator.py sitting
# unwired for weeks while ralph docs claimed it was active.
#
# Output: [OK] / [WARN] / [FAIL] lines, each FAIL with an exact fix.
# Exit codes: 0 = all OK (warns allowed), 1 = at least one FAIL.

CLAUDE_DIR="$HOME/.claude"
FAILS=0
WARNS=0

ok()   { echo "[OK]   $1"; }
warn() { echo "[WARN] $1"; WARNS=$((WARNS + 1)); }
fail() { echo "[FAIL] $1"; echo "       fix: $2"; FAILS=$((FAILS + 1)); }

# --- 1. settings.json parses ------------------------------------------------
if python3 -c "import json; json.load(open('$CLAUDE_DIR/settings.json'))" 2>/dev/null; then
    ok "settings.json is valid JSON"
else
    fail "settings.json is not valid JSON" "python3 -m json.tool $CLAUDE_DIR/settings.json  # shows the parse error"
fi

# --- 2. every hook / statusLine command's script exists ----------------------
# Extracts the first existing-looking path token from each command string.
while IFS=$'\t' read -r where script; do
    expanded="${script/#\~/$HOME}"
    if [ -f "$expanded" ]; then
        ok "$where -> $script"
    else
        fail "$where references missing script: $script" "create it or remove the registration from settings.json"
    fi
done < <(python3 - "$CLAUDE_DIR/settings.json" <<'PYEOF'
import json, sys
cfg = json.load(open(sys.argv[1]))
def script_of(cmd):
    # skip interpreter words, return the first path-like token
    for tok in cmd.split():
        if tok in ("bash", "sh", "python3", "python", "node", "npx") or tok.startswith("-"):
            continue
        return tok
    return cmd
for event, groups in cfg.get("hooks", {}).items():
    for g in groups:
        for h in g.get("hooks", []):
            print(f"hook {event}\t{script_of(h.get('command',''))}")
sl = cfg.get("statusLine", {})
if sl.get("type") == "command":
    print(f"statusLine\t{script_of(sl.get('command',''))}")
PYEOF
)

# --- 3. ~/.claude paths referenced by commands/workflows exist ---------------
# Any literal ~/.claude/... file reference in a command or workflow must exist.
FAILS_BEFORE_REFS=$FAILS
while IFS= read -r line; do
    src="${line%%:*}"
    ref="${line#*:}"
    expanded="${ref/#\~/$HOME}"
    if [ ! -e "$expanded" ]; then
        fail "$(basename "$src") references missing path: $ref" "create the file or update the reference in $src"
    fi
done < <(grep -rhoE '~/\.claude/[A-Za-z0-9_./-]+' "$CLAUDE_DIR/commands" "$CLAUDE_DIR/workflows" 2>/dev/null \
         --include='*.md' --include='*.js' --include='*.cjs' \
         | sort -u | sed 's/[.,;:)]*$//' | while IFS= read -r ref; do
             # re-attach a pseudo-source for the message (grep -h drops it; re-find one)
             srcfile=$(grep -rlF "$ref" "$CLAUDE_DIR/commands" "$CLAUDE_DIR/workflows" 2>/dev/null | head -1)
             echo "${srcfile}:${ref}"
           done)
[ $FAILS -eq $FAILS_BEFORE_REFS ] && ok "all ~/.claude paths referenced by commands/workflows exist"

# --- 4. skills have a SKILL.md with a description ----------------------------
for d in "$CLAUDE_DIR"/skills/*/; do
    [ -d "$d" ] || continue
    name=$(basename "$d")
    if [ ! -f "$d/SKILL.md" ]; then
        fail "skill '$name' has no SKILL.md" "add $d/SKILL.md or remove the directory"
    elif ! grep -q '^description:' "$d/SKILL.md"; then
        warn "skill '$name' SKILL.md has no 'description:' frontmatter — it will never auto-trigger"
    fi
done
ok "skill directories checked"

# --- 5. ralph scripts executable ---------------------------------------------
# project-config/*.sh are excluded: ralph-pipeline.sh sources them, no +x needed.
# worktree-hooks/*.sh DO need +x — worktree-setup.sh silently skips a
# non-executable hook ([ -x ] guard), which is a silent provisioning failure.
for s in "$CLAUDE_DIR"/scripts/ralph/*.sh "$CLAUDE_DIR"/scripts/next-task-number.sh \
         "$CLAUDE_DIR"/scripts/ralph/worktree-hooks/*.sh; do
    [ -f "$s" ] || continue
    if [ ! -x "$s" ]; then
        fail "not executable: $s" "chmod +x $s"
    fi
done
ok "script executable bits checked"

# --- 6. live smoke test: safety validator actually blocks --------------------
if printf '{"tool_name":"Bash","tool_input":{"command":"rm %s %s"}}' "-rf" "/" \
     | python3 "$CLAUDE_DIR/hooks/safety_validator.py" 2>/dev/null; then
    fail "safety_validator.py did NOT block a dangerous command" "inspect $CLAUDE_DIR/hooks/safety_validator.py — its block path is broken"
else
    ok "safety_validator.py blocks dangerous commands (live test)"
fi

# --- 7. live smoke test: next-task-number.sh resolves the project root -------
# The executable-bit check above cannot catch the real failure mode: the script
# used to take the root from $(pwd), so it silently returned 0001 from any
# subdirectory instead of the project's next number. Build a throwaway repo and
# assert root and subdir agree.
nt_tmp=$(mktemp -d)
(
    cd "$nt_tmp"
    git init -q .
    mkdir -p SPEC/ACTIVE/0001-a SPEC/ACTIVE/0007-b sub/dir
)
nt_root=$(cd "$nt_tmp" && "$CLAUDE_DIR/scripts/next-task-number.sh" 2>/dev/null)
nt_sub=$(cd "$nt_tmp/sub/dir" && "$CLAUDE_DIR/scripts/next-task-number.sh" 2>/dev/null)
rm -rf "$nt_tmp"
if [ "$nt_root" != "0008" ]; then
    fail "next-task-number.sh returned '$nt_root' at the project root (expected 0008)" \
         "inspect $CLAUDE_DIR/scripts/next-task-number.sh — its SPEC scan is broken"
elif [ "$nt_sub" != "$nt_root" ]; then
    fail "next-task-number.sh returned '$nt_sub' from a subdirectory but '$nt_root' at the root" \
         "inspect resolve_project_root() in $CLAUDE_DIR/scripts/next-task-number.sh — it is not resolving the git root"
else
    ok "next-task-number.sh resolves the project root from any cwd (live test)"
fi

# --- 8. workflow scripts parse ------------------------------------------------
# `node --check <file>.js` is USELESS here: it silently exits 0 on any .js
# containing `export` (verified, node v24.16.0), which is every workflow script.
# Parse them the way the runtime does instead — `export` stripped, body wrapped in
# an async function so top-level await and return are legal.
if command -v node >/dev/null 2>&1; then
    wf_bad=0
    wf_tmp=$(mktemp -d)
    for wf in "$CLAUDE_DIR"/workflows/*.js; do
        [ -f "$wf" ] || continue
        {
            echo "async function __wf(agent, parallel, pipeline, log, phase, workflow, args, budget) {"
            sed 's/^export const meta/const meta/' "$wf"
            echo "}"
            echo "void __wf;"
        } > "$wf_tmp/chk.mjs"
        if ! err=$(node --check "$wf_tmp/chk.mjs" 2>&1); then
            fail "workflow does not parse: $(basename "$wf")" "$(echo "$err" | grep -m1 SyntaxError || echo "run: node --check on the wrapped script")"
            wf_bad=1
        fi
    done
    rm -rf "$wf_tmp"
    [ $wf_bad -eq 0 ] && ok "workflow scripts parse"
else
    warn "node not on PATH — workflow scripts not syntax-checked"
fi

echo ""
if [ $FAILS -gt 0 ]; then
    echo "RESULT: $FAILS failure(s), $WARNS warning(s)"
    exit 1
fi
echo "RESULT: healthy ($WARNS warning(s))"
exit 0
