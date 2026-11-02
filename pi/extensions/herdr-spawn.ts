// /spawn — start an agent in a sibling herdr pane via herdr-spawn-agent.
// Thin wrapper: all logic lives in ~/.claude/scripts/herdr-spawn-agent so the agent-facing
// shell path and the user-facing command cannot drift apart.
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { homedir } from "node:os";
import { join } from "node:path";

const SCRIPT = join(homedir(), ".claude", "scripts", "herdr-spawn-agent");

const USAGE =
	"/spawn <name> [--kind pi] [--direction right|down] [--model M] [--thinking L] [--wait] -- <prompt text>";

// Quote-aware split so `-- "review the diff"` stays one argv entry.
function tokenize(input: string): string[] {
	const out: string[] = [];
	const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
	let m: RegExpExecArray | null;
	while ((m = re.exec(input)) !== null) out.push(m[1] ?? m[2] ?? m[3]);
	return out;
}

export default function herdrSpawn(pi: ExtensionAPI) {
	pi.registerCommand("spawn", {
		description: "Start an agent (default pi) in a sibling herdr pane",
		handler: async (args, ctx) => {
			if (process.env.HERDR_ENV !== "1") {
				ctx.ui.notify("Not running inside a herdr pane (HERDR_ENV != 1).", "error");
				return;
			}

			const tokens = tokenize(args);
			if (tokens.length === 0) {
				ctx.ui.notify(`usage: ${USAGE}`, "info");
				return;
			}

			const result = await pi.exec("bash", [SCRIPT, ...tokens], {
				cwd: ctx.cwd,
				timeout: 660_000,
			});

			if (result.code !== 0) {
				const detail = (result.stderr || result.stdout).trim();
				ctx.ui.notify(`spawn failed (exit ${result.code}): ${detail}`, "error");
				return;
			}

			const [pane, name, report] = result.stdout.trim().split(/\s+/);
			ctx.ui.notify(
				`spawned ${name} in ${pane}${report ? `\nreport will land at ${report}` : ""}`,
				"info",
			);
		},
	});
}
