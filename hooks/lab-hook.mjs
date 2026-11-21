#!/usr/bin/env node
// /lab for Claude Code: a UserPromptSubmit hook that runs the lab CLI and blocks the prompt, so the conversation gets no turn.
// `run` takes minutes, longer than a hook may: it starts in the background and the hook returns its id, log and report path.
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LAB = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "scripts", "lab", "lab.mjs");
const input = JSON.parse(fs.readFileSync(0, "utf8"));
const m = /^\/lab(?:\s+([\s\S]*))?$/.exec((input.prompt || "").trim());
if (!m) process.exit(0);
const block = (reason) => { process.stdout.write(JSON.stringify({ decision: "block", reason })); process.exit(0); };

const tokens = [...(m[1] || "").matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g)].map((x) => x[1] ?? x[2] ?? x[3]);
const SUBS = ["doctor", "run", "start", "drive", "judge", "report", "list", "stop", "prune"];
const cwd = input.cwd || process.cwd();
const lab = (args, timeout) => { const r = spawnSync("node", [LAB, ...args], { cwd, encoding: "utf8", timeout });
  return ((r.stdout || "") + (r.stderr ? `\n${r.stderr}` : "")).trim() || `(no output, exit ${r.status})`; };

if (!tokens.length || !SUBS.includes(tokens[0])) {
  const hint = tokens.length && !["--help", "-h", "help"].includes(tokens[0])
    ? `/lab: "${tokens[0]}" is not a subcommand. To try something out: /lab run "${tokens.join(" ")}" --tool <name>\n\n` : "";
  block(hint + lab(["--help"], 15000));
}
if (tokens[0] === "run") {
  const dir = path.join(cwd, "lab-reports"); fs.mkdirSync(dir, { recursive: true });
  const log = path.join(dir, `run-${Date.now()}.log`);
  const fd = fs.openSync(log, "a");
  spawn("node", [LAB, ...tokens], { cwd, detached: true, stdio: ["ignore", fd, fd] }).unref();
  let id = null; // the first line a run prints is its lab id (also its report name)
  for (let i = 0; i < 60 && !id; i++) { id = /^(lab-[a-z0-9]+)$/m.exec(fs.readFileSync(log, "utf8"))?.[1]; if (!id) spawnSync("sleep", ["0.5"]); }
  block(id ? `lab run started in the background: ${id}\n  progress: tail -f ${log}\n  report:   ${path.join(dir, id + ".md")}  (/lab report ${id})\n  stop:     /lab stop ${id}`
    : `lab run did not report a lab id within 30s; see ${log}\n${fs.readFileSync(log, "utf8").slice(-1500)}`);
}
block(lab(tokens, 40000));
