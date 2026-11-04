// Play the "your turn" sound when the agent finishes and hands control back.
// pi has no subagents or Notification hook, so agent_end is the single signal.
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { homedir } from "node:os";
import { join } from "node:path";

const SCRIPT = join(homedir(), ".claude", "hooks", "your_turn.sh");

export default function turnSound(pi: ExtensionAPI) {
	pi.on("agent_end", async () => {
		await pi.exec("bash", [SCRIPT], { timeout: 5_000 });
	});
}
