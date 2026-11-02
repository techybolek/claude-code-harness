// Claude Code harness bridge: pi reads ~/.claude (and each project's .claude/) directly,
// so ~/.claude stays the single source of truth for both harnesses.
//   - context:  ~/.claude/CLAUDE.md + Claude auto-memory (MEMORY.md) appended to the system prompt
//   - skills:   ~/.claude/skills + <ancestor>/.claude/skills  (also invocable as /<skill-name>)
//   - commands: ~/.claude/commands/**.md + <ancestor>/.claude/commands/**.md as /ns:name (except `harness: claude`),
//               with $ARGUMENTS / $1.. substitution and !`cmd` inline execution
// Project CLAUDE.md files are loaded natively by pi (except where an AGENTS.md shadows them — handled below).
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, relative } from "node:path";

const HOME = homedir();
const CLAUDE = join(HOME, ".claude");

const read = (p: string) => (existsSync(p) ? readFileSync(p, "utf8") : "");

// cwd, then each parent up to (not including) $HOME — nearest first
function ancestors(cwd: string): string[] {
	const dirs: string[] = [];
	for (let d = cwd; d !== HOME && d !== dirname(d); d = dirname(d)) dirs.push(d);
	return dirs;
}

function projectDirs(cwd: string, sub: string): string[] {
	return ancestors(cwd)
		.map((d) => join(d, ".claude", sub))
		.filter((p) => p !== join(CLAUDE, sub) && existsSync(p));
}

// Claude names commands by path: exec/panel-report.md -> "exec:panel-report"
function scanCommands(root: string, out: Map<string, string>) {
	const walk = (dir: string) => {
		for (const e of readdirSync(dir, { withFileTypes: true })) {
			const p = join(dir, e.name);
			if (e.isDirectory()) walk(p);
			else if (e.name.endsWith(".md")) {
				// `harness: claude` in frontmatter = needs Claude-only tools (Workflow, Agent); hide from pi
				if (/^---\n[\s\S]*?^harness:\s*claude\s*$[\s\S]*?\n---\n/m.test(read(p))) continue;
				const name = relative(root, p).slice(0, -3).split("/").join(":");
				if (!out.has(name)) out.set(name, p);
			}
		}
	};
	walk(root);
}

function commandsFor(cwd: string): Map<string, string> {
	const out = new Map<string, string>(); // first insert wins: nearest project, then global
	for (const d of projectDirs(cwd, "commands")) scanCommands(d, out);
	if (existsSync(join(CLAUDE, "commands"))) scanCommands(join(CLAUDE, "commands"), out);
	return out;
}

function skillNamesFor(cwd: string): Set<string> {
	const names = new Set<string>();
	const walk = (dir: string) => {
		for (const e of readdirSync(dir, { withFileTypes: true })) {
			if (!e.isDirectory()) continue;
			const p = join(dir, e.name);
			if (existsSync(join(p, "SKILL.md"))) names.add(e.name);
			else walk(p);
		}
	};
	for (const d of [...projectDirs(cwd, "skills"), join(CLAUDE, "skills")]) if (existsSync(d)) walk(d);
	return names;
}

const stripFrontmatter = (s: string) => s.replace(/^---\n[\s\S]*?\n---\n/, "");

// Claude's auto-memory dir is keyed by the project path with every non-alphanumeric char -> "-"
function memoryDir(cwd: string): string | undefined {
	for (const d of [cwd, ...ancestors(cwd).slice(1)]) {
		const m = join(CLAUDE, "projects", d.replace(/[^a-zA-Z0-9]/g, "-"), "memory");
		if (existsSync(m) && statSync(m).isDirectory()) return m;
	}
	return undefined;
}

const MEMORY_PROTOCOL = (dir: string) => `
# Memory
You have a persistent file-based memory at \`${dir}/\`, shared with Claude Code. Each memory is one file holding one fact, with frontmatter:
\`\`\`markdown
---
name: <short-kebab-case-slug>
description: <one-line summary, used to decide relevance during recall>
metadata:
  type: user | feedback | project | reference
---
<the fact; for feedback/project, follow with **Why:** and **How to apply:** lines. Link related memories with [[their-name]].>
\`\`\`
After writing a file, add a one-line pointer to \`MEMORY.md\` (\`- [Title](file.md) — hook\`). Update an existing file rather than duplicating; delete memories that turn out wrong. Don't save what the repo or git history already records. Recalled memories reflect what was true when written — verify named files/functions/flags still exist before relying on them. The index:
`;

export default function (pi: ExtensionAPI) {
	pi.on("resources_discover", async (event) => ({
		skillPaths: [...projectDirs(event.cwd, "skills"), join(CLAUDE, "skills")].filter(existsSync),
	}));

	pi.on("before_agent_start", async (event, ctx) => {
		let extra = "";
		const global = read(join(CLAUDE, "CLAUDE.md"));
		if (global) extra += `\n\nContents of ${join(CLAUDE, "CLAUDE.md")} (user's private global instructions for all projects):\n\n${global}`;
		// pi loads AGENTS.md *instead of* CLAUDE.md when a dir has both; Claude only ever reads CLAUDE.md
		const loaded = new Set(event.systemPromptOptions.contextFiles.map((c: { path: string }) => c.path));
		for (const d of ancestors(ctx.cwd).reverse()) {
			const p = join(d, "CLAUDE.md");
			const a = join(d, "AGENTS.md");
			if (loaded.has(a) && existsSync(p) && realpathSync(a) !== realpathSync(p)) extra += `\n\nContents of ${p} (project instructions):\n\n${read(p)}`;
		}
		const mem = memoryDir(ctx.cwd);
		if (mem) extra += `\n${MEMORY_PROTOCOL(mem)}\n${read(join(mem, "MEMORY.md"))}`;
		return extra ? { systemPrompt: event.systemPrompt + extra } : undefined;
	});

	pi.on("input", async (event, ctx) => {
		const m = event.text.match(/^\/([\w:.-]+)(?:\s+([\s\S]*))?$/);
		if (!m || m[1].startsWith("skill:")) return { action: "continue" };
		const [, name, args = ""] = m;

		const file = commandsFor(ctx.cwd).get(name);
		if (!file) {
			// Claude invokes skills as /<name>; pi as /skill:<name>
			if (skillNamesFor(ctx.cwd).has(name)) return { action: "transform", text: `/skill:${name} ${args}`.trim() };
			return { action: "continue" };
		}

		let body = stripFrontmatter(read(file));
		const pos = args.trim() ? args.trim().split(/\s+/) : [];
		const hadArgs = /\$ARGUMENTS|\$\d/.test(body);
		body = body.replace(/\$ARGUMENTS/g, args.trim()).replace(/\$(\d+)/g, (_, i) => pos[Number(i) - 1] ?? "");
		if (!hadArgs && args.trim()) body += `\n\nARGUMENTS: ${args.trim()}`;

		// !`cmd` -> command output (only at line start or after whitespace, as in Claude)
		const re = /(^|\s)!`([^`\n]+)`/g;
		const parts: string[] = [];
		let last = 0;
		for (const x of body.matchAll(re)) {
			const r = await pi.exec("bash", ["-c", x[2]], { cwd: ctx.cwd, timeout: 30000 });
			parts.push(body.slice(last, x.index), x[1], (r.stdout + r.stderr).trimEnd());
			last = x.index! + x[0].length;
		}
		parts.push(body.slice(last));

		return { action: "transform", text: parts.join("") };
	});
}
