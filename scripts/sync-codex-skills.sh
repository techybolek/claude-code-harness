#!/usr/bin/env bash
# Expose Claude skills to Codex (which only scans ~/.agents/skills and <repo>/.agents/skills).
#   global:  ~/.agents/skills/<name> -> ~/.claude/skills/.../<name>   (synced plugin skills: anthropic-<name>,
#            skipped when a user skill has the same name)
#   project: <proj>/.agents/skills -> ../.claude/skills               (git-excluded; per-skill links if .agents/skills already exists)
# Idempotent; never replaces an existing entry. Re-run after adding a skill.
# Usage: sync-codex-skills.sh [project-dir ...]   (default: every project under ~/PROJECTS with .claude/skills)
set -euo pipefail

link() { # target linkpath
	[ -e "$2" ] || [ -L "$2" ] && return 0
	ln -s "$1" "$2" && echo "linked $2 -> $1"
}

# --- global ---
G=~/.agents/skills
mkdir -p "$G"
find -L ~/.claude/skills -name SKILL.md -printf '%h\n' | while read -r d; do
	n=$(basename "$d")
	if [[ $d == */skills/synced/* ]]; then
		# a user skill of the same name wins (pi/Codex match by frontmatter name, not link name)
		[ -e ~/.claude/skills/"$n" ] && { [ -L "$G/anthropic-$n" ] && rm "$G/anthropic-$n" && echo "unlinked shadowing $G/anthropic-$n"; continue; }
		n="anthropic-$n"
	fi
	link "$d" "$G/$n"
done
# drop links whose ~/.claude target was removed
find "$G" -maxdepth 1 -xtype l -lname "$HOME/.claude/*" -print -delete | sed 's/^/removed dangling /'

# --- projects ---
if [ $# -eq 0 ]; then
	mapfile -t projects < <(find ~/PROJECTS -maxdepth 5 -name node_modules -prune -o -name .claude -print | sed 's|/.claude$||')
else
	projects=("$@")
fi
for p in "${projects[@]}"; do
	[ -d "$p/.claude/skills" ] || continue
	if [ -e "$p/.agents/skills" ]; then
		for s in "$p"/.claude/skills/*/; do
			[ -f "$s/SKILL.md" ] && link "../../.claude/skills/$(basename "$s")" "$p/.agents/skills/$(basename "$s")"
		done
		continue
	fi
	mkdir -p "$p/.agents"
	link ../.claude/skills "$p/.agents/skills"
	if top=$(git -C "$p" rev-parse --show-toplevel 2>/dev/null); then
		ex=$(git -C "$p" rev-parse --path-format=absolute --git-path info/exclude)
		rel="/$(realpath --relative-to="$top" "$p/.agents")"
		rel=${rel%/.}
		grep -qxF "$rel" "$ex" 2>/dev/null || { echo "$rel" >>"$ex"; echo "git-excluded $rel in $ex"; }
	fi
done
