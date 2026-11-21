#!/usr/bin/env node
// lab — black-box lab for Claude Code: isolated herdr server + isolated claude, driven through the herdr CLI,
// judged by a tool-less claude -p that only sees screen text. See `lab --help`.
import { spawnSync, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { denied, extractJson, quoteMatch, withCapability, tally, UNSUPPORTED_MARK, isLabServer, parseAge, oldReports } from "./lib.mjs";

// Reports go to the project the user runs the lab from, never into the (possibly read-only) package folder.
const REPORTS = path.join(process.cwd(), "lab-reports");
const TMP = os.tmpdir();
const PREFIX = "lab-";
const REAL_HOME = os.homedir();
// Only the login and herdr's own claude hook are taken from ~/.claude.
const CLAUDE_CREDS = path.join(REAL_HOME, ".claude", ".credentials.json");
const CLAUDE_HERDR_HOOK = path.join(REAL_HOME, ".claude", "hooks", "herdr-agent-state.sh");
const isClaudeBuiltin = (n) => /^[A-Z][A-Za-z]+$/.test(n); // Claude tool names: Read, Bash, Edit, ...

const USAGE = `lab — isolated black-box lab for Claude Code + herdr

usage:
  lab doctor                          check herdr, its CLI, claude, login, tmp space (read-only)
  lab run <scenario> [options]        start, run every scenario, judge, report, stop
  lab start [options]                 isolate only; prints the lab id
  lab drive <id> type "<text>"        type text into the pane under test
  lab drive <id> keys enter ctrl+c    press keys
  lab drive <id> read [--lines N]     print visible pane text
  lab drive <id> wait "<text>" [--timeout MS]
  lab drive <id> split [right|down]   new pane in the lab; it becomes the target
  lab drive <id> close                close the split pane (target returns to claude)
  lab drive <id> screenshot           (herdr has no screenshot; exits 3 and says so)
  lab judge <id> "<tried>" "<expected>"   judge the current screen (quotes must be verbatim)
  lab report <id>                     print the report so far
  lab list                            labs started by this tool and still alive
  lab stop <id>|--all|--stale         close only what the lab started, delete scratch, list leftovers (--stale: labs whose server is gone)
  lab prune [--older-than 14d] [--yes]  list (or with --yes delete) old lab-*.md reports in ./lab-reports
  lab --help

each "## " section runs in its own fresh lab (own claude, panes and project copy), so sections cannot affect each other.
<scenario> is a .json file (steps), a .md/.txt file (plain-English scenarios, one "## " section each),
or a quoted description. Plain English is driven step by step by a tool-less driver agent that reads the
screen before each move; a separate tool-less judge checks each scenario sentence. .json steps run as written.

notes:
  - the driver only knows the tools you load with --tool; a command that is not loaded cannot be tested (the run says so).
  - the summary prints WARNINGs (no --tool given; project is not a git repo) next to the pass/fail count.

options (run, start):
  --tool NAME      what exists in the lab's claude (repeatable): a Claude tool name (Read, Bash, ...; none = no tools),
                   a plugin dir (--plugin-dir), a .claude dir (copied into the project copy), or NAME = the .claude dir
                   up from the cwd that has commands/NAME.md
  --project DIR    project to copy (default: cwd). git ls-files when a repo, minus secrets/agent/expectation files.
  --model M        model of the claude under test (e.g. haiku); driver and judge use Claude's default
  --keep           (run) do not stop afterwards
  --no-agent       (start/run) do not launch claude; the pane under test is a plain shell

examples:
  lab doctor
  lab run lab-scenarios.md --tool split --model haiku
  lab run "try out /split" --tool split --project <repo>   # no steps: the driver explores (learns from the screen, normal use, then edge cases)
  lab start --tool split        # -> lab-ab12cd
  lab drive lab-ab12cd type "/split" && lab drive lab-ab12cd keys enter
  lab drive lab-ab12cd read
  lab judge lab-ab12cd "typed /split" "a picker opens"
  lab stop lab-ab12cd

scenario .json: {"name":"x","steps":[{"try":"...","do":[{"type":"/split"},{"keys":["enter"]},
  {"wait":"text","timeout":8000},{"split":"right"},{"close":true},{"screenshot":true}],"expect":"..."}]}`;

const out = (s = "") => process.stdout.write(s + "\n");
const err = (s) => process.stderr.write(s + "\n");
const die = (s, code = 1) => { err(`lab: ${s}`); process.exit(code); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const run = (cmd, args, opt = {}) => spawnSync(cmd, args, { encoding: "utf8", ...opt });

// ---------- state ----------
const dirOf = (id) => path.join(TMP, id);
const statePath = (id) => path.join(dirOf(id), "state.json");
function load(id) {
  if (!id || !/^lab-[a-z0-9]+$/.test(id)) die(`bad lab id "${id}" (see: lab list)`);
  try { return JSON.parse(fs.readFileSync(statePath(id), "utf8")); } catch { die(`no such lab: ${id}`); }
}
const save = (s) => fs.writeFileSync(statePath(s.id), JSON.stringify(s, null, 1));
// Read /proc/<pid>/cmdline and environ; empty strings when the process is gone or unreadable.
const procInfo = (pid) => { const r = (f) => { try { return fs.readFileSync(`/proc/${pid}/${f}`, "utf8"); } catch { return ""; } }; return { cmdline: r("cmdline"), environ: r("environ") }; };
const serverIsOurs = (s) => !!s?.serverPid && isLabServer(procInfo(s.serverPid), s.sock);
const readState = (id) => { try { return JSON.parse(fs.readFileSync(statePath(id), "utf8")); } catch { return null; } };
// A lab nobody is running any more: its server is gone, or it never got one and is older than 10 minutes.
const isStale = (id) => { const s = readState(id); if (!s) return false;
  if (s.serverPid) return !serverIsOurs(s);
  try { return Date.now() - fs.statSync(dirOf(id)).mtimeMs > 600000; } catch { return false; } };
const labIds = () => fs.readdirSync(TMP).filter((n) => /^lab-[a-z0-9]+$/.test(n) && fs.existsSync(statePath(n)));

// ---------- env ----------
function baseEnv(home, extra = {}) {
  // Nothing from the user's environment but PATH/LANG: claude signs in with the copied login, never an API key.
  return { PATH: process.env.PATH, HOME: home, TERM: "xterm-256color", LANG: process.env.LANG || "C.UTF-8", ...extra };
}
const herdrEnv = (s) => baseEnv(s.home, { HERDR_SOCKET_PATH: s.sock, HERDR_CLIENT_SOCKET_PATH: s.csock, HERDR_CONFIG_PATH: s.config });
function herdr(s, args, opt = {}) {
  const r = run("herdr", args, { env: herdrEnv(s), timeout: opt.timeout ?? 60000 });
  let json; try { json = JSON.parse(r.stdout); } catch {}
  return { ok: r.status === 0, code: r.status, stdout: r.stdout, stderr: r.stderr, json };
}

// Refuse to talk to any server that is not the lab's own socket (defense in depth: never touch the user's herdr).
function socketIsLab(s) {
  const r = herdr(s, ["status"]); const m = r.stdout.match(/^\s*socket:\s*(\S+)/m);
  return !!m && m[1] === s.sock;
}

// ---------- doctor ----------
const cat = (c, a) => { const r = run(c, a); return (r.stdout || "") + (r.stderr || ""); };
function doctor() {
  const rows = []; const chk = (name, ok, detail) => { rows.push({ name, ok, detail }); };
  const v = run("herdr", ["--version"]); chk("herdr binary", v.status === 0, (v.stdout || v.stderr).trim());
  chk("herdr version tested (optional)", /\b0\.9\./.test(v.stdout || ""), `tested with herdr 0.9.x on Linux; this is ${(v.stdout || v.stderr).trim()}`);
  const h = cat("herdr", ["pane"]); chk("herdr CLI (pane/agent/session/api)", /pane read/.test(h) && /wait-output/.test(h) && /send-keys/.test(h) && /send-text/.test(h),
    "needs pane send-text|send-keys|read|wait-output");
  const sc = h + cat("herdr", ["terminal"]) + cat("herdr", ["--help"]);
  chk("herdr screenshot (optional)", /screenshot/i.test(sc), /screenshot/i.test(sc) ? "supported" : "NOT supported by herdr 0.9.x: lab uses visible pane text only");
  chk("project is a git repo (else all files minus deny-list)", run("git", ["rev-parse", "--show-toplevel"]).status === 0, process.cwd());
  const cv = run("claude", ["--version"]); chk("claude binary", cv.status === 0, (cv.stdout || cv.stderr || "not found").trim());
  const ch = run("claude", ["--help"]).stdout || "";
  chk("claude isolation flags", ["--strict-mcp-config", "--setting-sources", "--tools", "--plugin-dir"].every((f) => ch.includes(f)), "--strict-mcp-config --setting-sources --tools --plugin-dir");
  chk("claude login", fs.existsSync(CLAUDE_CREDS), CLAUDE_CREDS);
  chk("herdr claude integration", fs.existsSync(CLAUDE_HERDR_HOOK), CLAUDE_HERDR_HOOK + " — fix: herdr integration install claude");
  chk("tmp writable", (() => { try { fs.accessSync(TMP, fs.constants.W_OK); return true; } catch { return false; } })(), TMP);
  let bad = 0;
  for (const r of rows) { const optional = /optional|git repo/.test(r.name); out(`${r.ok ? "ok  " : optional ? "warn" : "FAIL"}  ${r.name} — ${r.detail}`); if (!r.ok && !optional) bad++; }
  const live = labIds(), stale = live.filter(isStale);
  if (live.length) out(`note: ${live.length} lab(s): ${live.map((i) => i + (stale.includes(i) ? " (STALE)" : "")).join(", ")}`);
  if (stale.length) out(`warn  ${stale.length} stale lab(s) left by a crashed or killed run; each may hold a copy of your model login in ${TMP}/<id>/. Remove with: lab stop --stale`);
  process.exit(bad ? 1 : 0);
}

// ---------- start ----------
function parseOpts(argv) {
  const o = { tools: [], rest: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--tool") o.tools.push(argv[++i]);
    else if (a === "--project") o.project = argv[++i];
    else if (a === "--model") o.model = argv[++i];
    else if (a === "--keep") o.keep = true;
    else if (a === "--yes") o.yes = true;
    else if (a === "--older-than") o.olderThan = argv[++i];
    else if (a === "--no-agent") o.noAgent = true;
    else if (a === "--lines") o.lines = +argv[++i];
    else if (a === "--timeout") o.timeout = +argv[++i];
    else o.rest.push(a);
  }
  return o;
}
const USER_CLAUDE = path.join(REAL_HOME, ".claude");
// A user-level command (~/.claude/commands/NAME.md): only that file and the user hooks whose command mentions NAME go into the lab.
// The rest of ~/.claude (login, history, projects, other hooks) is never copied.
function userCommand(n) {
  const settings = (() => { try { return JSON.parse(fs.readFileSync(path.join(USER_CLAUDE, "settings.json"), "utf8")); } catch { return {}; } })();
  const hooks = {};
  for (const [event, groups] of Object.entries(settings.hooks || {}))
    for (const g of groups) { const hs = (g.hooks || []).filter((h) => (h.command || "").includes(n)); if (hs.length) (hooks[event] ||= []).push({ ...g, hooks: hs }); }
  return { name: n, file: path.join(USER_CLAUDE, "commands", n + ".md"), hooks };
}
function resolveClaudeTools(names) {
  const builtin = [], plugins = [], dotClaude = [], userCmds = [];
  const up = (n) => { for (let d = process.cwd(); ; d = path.dirname(d)) {
    const c = path.join(d, ".claude"); if (fs.existsSync(path.join(c, "commands", n + ".md"))) return c; if (d === path.dirname(d)) return null; } };
  for (const n of names) {
    if (isClaudeBuiltin(n)) { builtin.push(n); continue; }
    const p = fs.existsSync(n) ? path.resolve(n) : null;
    if (p && fs.existsSync(path.join(p, ".claude-plugin", "plugin.json"))) { plugins.push(p); continue; }
    if (p && path.basename(p) === ".claude") { dotClaude.push(p); continue; }
    if (p && fs.existsSync(path.join(p, ".claude"))) { dotClaude.push(path.join(p, ".claude")); continue; }
    const found = !p && up(n);
    if (found === USER_CLAUDE) { userCmds.push(userCommand(n)); continue; }
    if (found) { dotClaude.push(found); continue; }
    die(`tool "${n}" not found: not a Claude tool name (Read, Bash, ...), not a plugin dir (.claude-plugin/plugin.json), not a .claude dir, and no .claude/commands/${n}.md up from ${process.cwd()}`, 2);
  }
  if (dotClaude.length > 1) die(`only one .claude dir can be the project's: got ${dotClaude.join(", ")}`, 2);
  // Never copy a user-level .claude (it holds the login and history): name its commands instead.
  for (const d of dotClaude) if (path.resolve(d) === USER_CLAUDE || fs.existsSync(path.join(d, ".credentials.json")))
    die(`refusing to copy ${d}: it is a user-level .claude (login, history). Name the command instead: --tool <name>`, 2);
  return { builtin, plugins, dotClaude: dotClaude[0], userCmds };
}
// Isolated Claude Code: its own HOME, holding only the login, herdr's session hook, and first-run answers for the project copy.
function claudeHome(s) {
  const dir = path.join(s.home, ".claude"); fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  if (fs.existsSync(CLAUDE_CREDS)) { fs.copyFileSync(CLAUDE_CREDS, path.join(dir, ".credentials.json")); fs.chmodSync(path.join(dir, ".credentials.json"), 0o600); }
  const hooks = fs.existsSync(CLAUDE_HERDR_HOOK) ? { SessionStart: [{ hooks: [{ type: "command", command: `bash '${CLAUDE_HERDR_HOOK}' session` }] }] } : {};
  fs.writeFileSync(path.join(dir, "settings.json"), JSON.stringify({ hooks }));
  fs.writeFileSync(path.join(s.home, ".claude.json"), JSON.stringify({ hasCompletedOnboarding: true, theme: "dark",
    projects: { [s.project]: { hasTrustDialogAccepted: true } } }));
}
function copyProject(project, dest) {
  const g = run("git", ["-C", project, "ls-files", "-z"]);
  let files, mode;
  if (g.status === 0) { files = g.stdout.split("\0").filter(Boolean); mode = "git ls-files"; }
  else { // not a repo: no tracked-file list exists; copy everything except deny-list
    files = []; mode = "NOT a git repo: all files minus deny-list";
    const walk = (d) => { for (const e of fs.readdirSync(path.join(project, d), { withFileTypes: true })) {
      const rel = path.join(d, e.name); if (e.name === ".git" || e.name === "node_modules") continue;
      e.isDirectory() ? walk(rel) : files.push(rel); } };
    walk("");
  }
  const skipped = []; let n = 0;
  for (const f of files) {
    if (denied(f)) { skipped.push(f); continue; }
    const src = path.join(project, f); if (!fs.existsSync(src) || fs.statSync(src).isDirectory()) continue;
    fs.mkdirSync(path.dirname(path.join(dest, f)), { recursive: true }); fs.copyFileSync(src, path.join(dest, f)); n++;
  }
  return { n, skipped, mode };
}
async function start(argv) {
  const o = parseOpts(argv);
  if (run("herdr", ["--version"]).status !== 0) die("herdr not found — run: lab doctor", 2);
  if (o.project) { // fail before anything is started: a typo must not silently copy some other folder
    const pr = path.resolve(o.project);
    if (!fs.existsSync(pr) || !fs.statSync(pr).isDirectory()) die(`--project ${o.project}: no such folder (looked for ${pr}; relative paths are resolved from ${process.cwd()})`, 2);
  }
  const { builtin, plugins, dotClaude, userCmds } = resolveClaudeTools(o.tools);
  const id = PREFIX + Math.random().toString(36).slice(2, 8);
  const dir = dirOf(id);
  const s = { id, dir, home: path.join(dir, "home"), project: path.join(dir, "project"),
    sock: path.join(dir, "h.sock"), csock: path.join(dir, "c.sock"), config: path.join(dir, "herdr.toml"),
    judgeDir: path.join(dir, "judge-empty"), judgeHome: path.join(dir, "judge-home"),
    tools: o.tools, model: o.model, started: new Date().toISOString(), panes: [], target: null, agentPane: null, log: [] };
  for (const d of [s.home, s.judgeDir, s.judgeHome]) fs.mkdirSync(d, { recursive: true, mode: 0o700 });
  fs.chmodSync(dir, 0o700);
  fs.writeFileSync(s.config, "onboarding = false\n");
  save(s);
  // The judge/driver HOME gets only the login.
  if (fs.existsSync(CLAUDE_CREDS)) { const d = path.join(s.judgeHome, ".claude"); fs.mkdirSync(d, { mode: 0o700 });
    fs.copyFileSync(CLAUDE_CREDS, path.join(d, ".credentials.json")); fs.chmodSync(path.join(d, ".credentials.json"), 0o600); }
  const cp = copyProject(path.resolve(o.project || process.cwd()), s.project);
  if (dotClaude) fs.cpSync(dotClaude, path.join(s.project, ".claude"), { recursive: true, filter: (f) => path.basename(f) !== "settings.local.json" });
  if (userCmds.length) { // user-level commands become project-level in the lab: the command file and its hooks only
    const pc = path.join(s.project, ".claude"); fs.mkdirSync(path.join(pc, "commands"), { recursive: true });
    const sp = path.join(pc, "settings.json"); const st = (() => { try { return JSON.parse(fs.readFileSync(sp, "utf8")); } catch { return {}; } })();
    st.hooks ||= {};
    for (const u of userCmds) { fs.copyFileSync(u.file, path.join(pc, "commands", u.name + ".md"));
      for (const [ev, gs] of Object.entries(u.hooks)) (st.hooks[ev] ||= []).push(...gs); }
    fs.writeFileSync(sp, JSON.stringify(st, null, 1));
  }
  claudeHome(s);
  s.copy = cp; save(s);
  // herdr: own server, socket, config, HOME, session name
  const srv = spawn("herdr", ["server"], { env: herdrEnv(s), detached: true, stdio: ["ignore", fs.openSync(path.join(dir, "server.log"), "a"), "ignore"] });
  srv.unref(); s.serverPid = srv.pid; save(s);
  for (let i = 0; i < 50 && !fs.existsSync(s.sock); i++) await sleep(100);
  if (!herdr(s, ["status"]).ok) { await stop(id, true); die("lab herdr server did not come up", 1); }
  if (!socketIsLab(s)) { await stop(id, true); die(`herdr reports a socket other than the lab's ${s.sock}; refusing to continue`, 1); }
  const ws = herdr(s, ["workspace", "create", "--label", id, "--cwd", s.project, "--no-focus"]);
  if (!ws.ok) { await stop(id, true); die(`workspace create failed: ${ws.stderr || ws.stdout}`); }
  s.workspace = ws.json.result.workspace.workspace_id; s.agentPane = s.target = ws.json.result.root_pane.pane_id;
  s.panes = [s.agentPane]; save(s);
  if (!o.noAgent) {
    const args = ["--strict-mcp-config", "--setting-sources", "user,project", "--tools", builtin.join(","),
      ...plugins.flatMap((p) => ["--plugin-dir", p]), ...(o.model ? ["--model", o.model] : [])];
    const q = (a) => `'${a.replace(/'/g, "'\\''")}'`;
    herdr(s, ["pane", "run", s.agentPane, `cd ${q(s.project)} && claude ${args.map(q).join(" ")}`]);
    const w = herdr(s, ["pane", "wait-output", s.agentPane, "--regex", "(?i)(for shortcuts|\\? for|claude code|❯)", "--timeout", "30000"]);
    if (!w.ok) err("lab: warning: claude prompt not seen within 30s");
    s.agentArgs = args;
  }
  save(s);
  out(id);
  if (cp.skipped.length) err(`lab: withheld: ${cp.skipped.join(", ")}`);
  s.warnings = [];
  if (!o.tools.length && !o.noAgent) s.warnings.push("no --tool given: the claude under test has no project commands, plugins or built-in tools, so any command you meant to test is not loaded");
  if (!o.noAgent) s.warnings.push("claude under test still has its bundled skills and your organisation's skills and policy (they come with the login; removing them needs --disable-slash-commands, which also removes the command under test)");
  if (!/^git/.test(cp.mode)) s.warnings.push(`project ${path.resolve(o.project || process.cwd())} is not a git repo: copied every file minus the deny-list (did you mean --project <repo>?)`);
  save(s); for (const w of s.warnings) err(`lab: WARNING: ${w}`);
  err(`lab ${id}: own herdr server (name ${id}), socket ${s.sock}, workspace ${s.workspace}, pane ${s.agentPane}; project copy ${cp.n} files (${cp.mode}; ${cp.skipped.length} withheld); tools: ${o.tools.join(",") || "none"}`);
  return s;
}

// ---------- drive ----------
function readScreen(s, lines) {
  const r = herdr(s, ["pane", "read", s.target, "--source", "visible", ...(lines ? ["--lines", String(lines)] : [])]);
  if (!r.ok) die(`read failed: ${r.stderr || r.stdout}`);
  // Fullscreen TUIs pad with blank rows; squeeze them so the text that matters is not pushed out.
  return (r.json?.result?.read?.text ?? r.stdout).replace(/\n[ \t]*(\n[ \t]*)+\n/g, "\n\n");
}
// Lab-recorded pane list (from herdr, not from the agent under test): lets the judge see panes opening/closing.
function paneList(s) {
  const r = herdr(s, ["pane", "list", "--workspace", s.workspace]);
  const ps = r.json?.result?.panes;
  if (!ps) return `(pane list unavailable: ${(r.stderr || r.stdout).trim().slice(0, 100)})`;
  return `${ps.length} pane(s) in lab workspace: ` + ps.map((p) => `${p.pane_id}${p.pane_id === s.target ? " (shown above)" : ""} agent=${p.agent || "none"}`).join("; ");
}
async function act(s, a) { // returns description of what was done; throws string on failure
  if ("type" in a) { const r = herdr(s, ["pane", "send-text", s.target, a.type]); if (!r.ok) throw r.stderr; return `typed ${JSON.stringify(a.type)}`; }
  if ("keys" in a) { const k = [].concat(a.keys); const r = herdr(s, ["pane", "send-keys", s.target, ...k]); if (!r.ok) throw r.stderr; return `pressed ${k.join(" ")}`; }
  if ("wait" in a) { const r = herdr(s, ["pane", "wait-output", s.target, "--match", a.wait, "--source", "visible", "--timeout", String(a.timeout || 10000)], { timeout: (a.timeout || 10000) + 5000 });
    return r.ok ? `saw ${JSON.stringify(a.wait)}` : `did NOT see ${JSON.stringify(a.wait)} within ${a.timeout || 10000}ms`; }
  if ("split" in a) { const r = herdr(s, ["pane", "split", s.target, "--direction", a.split === "down" ? "down" : "right", "--cwd", s.project, "--no-focus"]);
    if (!r.ok) throw r.stderr; const id = r.json.result.pane.pane_id; s.panes.push(id); s.target = id; save(s); await sleep(500); return `split pane ${id}`; }
  if ("close" in a) { if (s.target === s.agentPane) throw "refusing to close the claude pane"; const id = s.target;
    const r = herdr(s, ["pane", "close", id]); if (!r.ok) throw r.stderr; s.panes = s.panes.filter((p) => p !== id); s.target = s.agentPane; save(s); return `closed pane ${id}`; }
  if ("screenshot" in a) return UNSUPPORTED_MARK + ": herdr 0.9.3 has no screenshot command; visible pane text only";
  if ("sleep" in a) { await sleep(a.sleep); return `slept ${a.sleep}ms`; }
  if ("view" in a) { // look at another pane in the lab (e.g. one a command opened); it becomes the target
    const ps = herdr(s, ["pane", "list", "--workspace", s.workspace]).json?.result?.panes || [];
    if (!ps.some((p) => p.pane_id === a.view)) throw `no pane ${a.view} in the lab`;
    s.target = a.view; save(s); return `viewing pane ${a.view}`; }
  throw `unknown action ${JSON.stringify(a)}`;
}
async function drive(argv) {
  const [id, verb, ...rest] = argv; const o = parseOpts(rest); const s = load(id);
  const a = o.rest;
  switch (verb) {
    case "type": return out(await act(s, { type: a.join(" ") }));
    case "keys": return out(await act(s, { keys: a }));
    case "read": return out(readScreen(s, o.lines));
    case "wait": { const d = await act(s, { wait: a.join(" "), timeout: o.timeout }); out(d); process.exit(d.startsWith("saw") ? 0 : 1); }
    case "split": return out(await act(s, { split: a[0] }));
    case "close": return out(await act(s, { close: true }));
    case "screenshot": err(await act(s, { screenshot: true })); process.exit(3);
    default: die(`drive: unknown verb "${verb}" (type|keys|read|wait|split|close|screenshot)`, 2);
  }
}

// ---------- helper agents (driver, judge): claude -p with no tools, skills, MCP or settings, in an empty dir ----------
// Own HOME holding only the login; Claude's default model (--model is the model of the claude under test).
function helper(s, system, prompt) {
  const args = ["-p", "--tools", "", "--strict-mcp-config", "--setting-sources", "", "--disable-slash-commands", "--no-session-persistence",
    "--system-prompt", system, prompt];
  const r = run("claude", args, { cwd: s.judgeDir, env: baseEnv(s.judgeHome), timeout: 180000, maxBuffer: 1 << 24 });
  if (r.status !== 0) throw new Error(`claude helper failed: ${(r.stderr || r.stdout).slice(0, 400)}`);
  return r.stdout.trim();
}

const DRIVER = `You drive a terminal lab like a person at the keyboard, one move at a time. You know nothing about the software under test except what the screen shows.
Each turn you get: the scenario, what you did so far, the current screen of the pane you are looking at, and the lab's own list of panes.
Reply ONLY JSON: {"why":"one sentence: what you see and why you choose this move","plan":null|{"try":string,"expect":string,"blocked":boolean},"actions":[...],"judge":boolean,"done":boolean}.
Actions (objects): {"type":"<the exact characters to type, e.g. ls -la>"} (types them, does NOT press enter) {"keys":["enter","esc","up","down","tab","ctrl+c"]} {"wait":"literal text","timeout":ms} {"sleep":ms} {"view":"pane id from the pane list"} {"split":"right"|"down"} {"close":true} (these two open/close a raw lab pane: only when the scenario itself talks about panes, never as a stand-in for a command under test) {"screenshot":true}.
You are told which tools the user loaded into the agent under test. If the scenario names a command or tool that is not among them and the screen does not offer it, set a check saying it is not available, with "blocked":true, and stop; do not test something else in its place. Use "blocked":true on any check that says the scenario could not be carried out.
Rules: type only what the scenario says to type, nothing else. Do a few actions, then look again; decide from the screen, never from assumptions (in a list, read which line is highlighted and which line you want before pressing keys). After something slow, such as a model reply, wait or sleep and look again.
Every thing you test is a plan, a judgement, in that order. Declare "plan" in the same reply as the first actions of it, BEFORE you see their result: "try" = that sentence of the scenario in its own words (or what you are about to do), "expect" = what the scenario's words (or what a sensible tool) should show. The lab freezes it: you cannot change it later, so it cannot be bent to fit what the screen shows. Do not set "judge":true until the current screen actually shows what the expectation needs; if it does not (a result may be in another pane: look with {"view":...}; a picker or notice may need another look), look first, because judging early only gives an UNCLEAR. When a later screen shows the outcome, set "judge":true (with no new plan for the same thing); a separate judge scores the frozen expectation against the screen, you do not. A sentence that only asks about the current screen (e.g. "Does the picker open?") has no actions: give plan and "judge":true together; the report marks such expectations as set after seeing the screen. One plan at a time, one per scenario sentence, in order.
If the scenario only asks you to try something out (no steps given), explore it like a curious tester, in this order: (1) learn what it is for from the screen only: the command list with descriptions (type "/" and read it, then clear the input), its --help, what it shows when run; (2) do the normal use those describe, all the way to its result, doing whatever setup they say it needs; (3) only then edge cases (wrong order, unexpected input, cancelling) and error paths. Make one plan per thing you try. Stop after about 6 plans.
Set "done":true after the last plan is judged, or if the scenario cannot go on (then give a plan saying what blocked it, with "blocked":true and "judge":true). Do not invent steps: screenshot only if the scenario asks for one.`;
const MAX_TURNS = 30;
const JUDGE = `You are a black-box tester. You see ONLY the terminal screen text given to you (a BEFORE screen from just before the try, when given, and the AFTER screen), a short note of what was tried, and what was expected. You know nothing else and you may not guess about anything not on screen.
Reply ONLY JSON: {"verdict":"pass"|"fail"|"unclear","got":"what the screen shows, in your words","quote":"text copied VERBATIM from the screen (one contiguous run, at most 3 lines) that supports your verdict"}.
Judge only what the try produced: text that was already on the BEFORE screen is earlier output, not the result of this try. If the screen does not show enough, verdict is "unclear". The quote must appear character-for-character in the AFTER screen.`;

function judge(s, tried, expected, screen, before) {
  const prompt = `TRIED:\n${tried}\n\nEXPECTED:\n${expected}\n\n${before ? `BEFORE screen (verbatim):\n<<<BEFORE\n${before}\nBEFORE>>>\n\n` : ""}AFTER screen (verbatim, between the markers):\n<<<SCREEN\n${screen}\nSCREEN>>>`;
  let j; try { j = extractJson(helper(s, JUDGE, prompt)); } catch (e) { return { verdict: "unclear", got: `judge failed: ${e.message}`, quote: "", quoteOk: false }; }
  j.quoteOk = quoteMatch(screen, j.quote);
  if (!j.quoteOk) { j.note = "quote NOT found on screen; verdict downgraded"; if (j.verdict === "pass") j.verdict = "unclear"; }
  return j;
}

// ---------- report ----------
const reportPath = (id) => path.join(REPORTS, `${id}.md`);
function addReport(s, text) { fs.mkdirSync(REPORTS, { recursive: true }); fs.appendFileSync(reportPath(s.reportId || s.id), text + "\n"); }
function reportStep(s, label, tried, expected, did, screen, j, extra = "") {
  addReport(s, `### ${label}\n- **I tried:** ${tried}${did.length ? `\n  - actions: ${did.join("; ")}` : ""}\n- **Expected:** ${expected}\n- **Got:** ${j.got}\n- **Verdict:** ${j.verdict.toUpperCase()}\n- **Screen quote${j.quoteOk ? ` (${j.quoteOk})` : " (INVALID)"}:** ${j.quote ? "```\n" + j.quote + "\n```" : "(none)"}${j.note ? `\n- note: ${j.note}` : ""}${extra}\n`);
}
async function runSteps(s, scen, o) {
  addReport(s, `## Scenario: ${scen.name}\n`);
  const res = [];
  for (const [i, st] of scen.steps.entries()) {
    const did = []; let failedAct = null;
    const before = readScreen(s) + `\n\n[LAB RECORD, from herdr] ${paneList(s)}`;
    for (const a of st.do || []) { try { did.push(await act(s, a)); } catch (e) { failedAct = String(e); did.push(`ACTION FAILED: ${failedAct}`); break; } }
    await sleep(st.settle ?? 800);
    const screen = readScreen(s) + `\n\n[LAB RECORD, from herdr] ${paneList(s)}`;
    const j = judge(s, `${st.try}\n(actions performed: ${did.join("; ") || "none"})`, st.expect, screen, before);
    if (failedAct) j.verdict = "fail";
    const unsupported = did.some((d) => d.startsWith(UNSUPPORTED_MARK));
    Object.assign(j, withCapability(j, did, st.try));
    reportStep(s, `${i + 1}. ${scen.name}`, st.try, st.expect, did, screen, j, unsupported ? "\n- **Missing capability:** screenshot — herdr has no screenshot command; this was not tested" : "");
    res.push(j.verdict); out(`${j.verdict.toUpperCase().padEnd(11)} ${i + 1}. ${st.try}`);
  }
  return res;
}
const toolNames = (s) => s.tools.map((t) => path.basename(t).replace(/\.(ts|js)$/, "")).join(", ") || "none (plain claude, no project commands, plugins or tools)";
// Plain English: the driver reads the screen before every move; the judge only sees the screen at each check.
async function drivePlain(s, scen, o) {
  addReport(s, `## Scenario: ${scen.name}\n\n${scen.body.trim()}\n`);
  const res = [], history = []; let did = [], whys = [], pending = null;
  const panesAsked = /\bpanes?\b/i.test(scen.body), screenshotAsked = /screenshot/i.test(scen.body);
  const judgePending = (screen, setAfter) => {
    const pl = pending; pending = null;
    // A question about the screen as it is has no "before": the state it asks about is already there, not earlier output.
    const j = judge(s, `${pl.try}\n(actions performed: ${did.join("; ") || "none"})`, pl.expect, screen, setAfter ? null : pl.before);
    Object.assign(j, withCapability(j, did, pl.try));
    if (pl.blocked && j.verdict !== "unsupported") { j.verdict = "unclear"; j.note = [j.note, "driver reports the scenario could not be carried out (blocked); nothing was tested"].filter(Boolean).join("; "); }
    reportStep(s, `${res.length + 1}. ${pl.try}`, pl.try, pl.expect, did, screen, j,
      `\n- **Expectation:** ${setAfter ? "set AFTER the driver saw the screen (not independent of it)" : "declared before acting, then frozen"}` +
      (whys.length ? `\n- driver's reasoning: ${whys.join(" → ")}` : "") +
      (did.some((x) => x.startsWith(UNSUPPORTED_MARK)) ? "\n- **Missing capability:** screenshot \u2014 herdr has no screenshot command; this was not tested" : ""));
    res.push(j.verdict); out(`${j.verdict.toUpperCase().padEnd(11)} ${res.length}. ${pl.try}`);
    history.push(`JUDGED: ${pl.try}`); did = []; whys = [];
  };
  for (let turn = 1; turn <= MAX_TURNS; turn++) {
    const screen = readScreen(s) + `\n\n[LAB RECORD, from herdr] ${paneList(s)}`;
    const prompt = `SCENARIO:\n${scen.body.trim()}\n\nAGENT UNDER TEST: Claude Code\nTOOLS LOADED IN IT (named by the user): ${toolNames(s)}\n\nDONE SO FAR:\n${history.join("\n") || "(nothing yet)"}\n\nPLAN WAITING FOR ITS RESULT (frozen): ${pending ? JSON.stringify({ try: pending.try, expect: pending.expect }) : "none"}\n\nSCREEN of pane ${s.target} (verbatim):\n<<<SCREEN\n${screen}\nSCREEN>>>`;
    let d; try { d = extractJson(helper(s, DRIVER, prompt)); } catch (e) { throw new Error(`driver failed on turn ${turn}: ${e.message}`); }
    if (d.why) { whys.push(d.why); history.push(`turn ${turn} why: ${d.why}`); }
    const acts = d.actions || [], wantJudge = !!(d.judge || d.done);
    if (pending && wantJudge) judgePending(screen, false);            // result of an earlier plan; expectation was frozen before acting
    if (d.plan?.try && !pending) {
      pending = { ...d.plan, before: screen };
      history.push(`PLAN: ${d.plan.try} \u2014 expecting: ${d.plan.expect}`);
      if (!acts.length && wantJudge) judgePending(screen, true);      // a question about the screen as it is: no way to declare ahead
    }
    for (const a of acts) {
      let r; try { r = (("split" in a || "close" in a) && !panesAsked) ? `ACTION REFUSED: ${JSON.stringify(a)} \u2014 raw pane actions only when the scenario talks about panes`
        : ("screenshot" in a && !screenshotAsked) ? `ACTION REFUSED: screenshot \u2014 the scenario does not ask for one` : await act(s, a); } catch (e) { r = `ACTION FAILED: ${e}`; }
      did.push(r); history.push(`turn ${turn}: ${r}`);
    }
    if (d.done && !pending) return res;                                // a plan declared with actions in the done turn still needs one more look
    if (acts.length) await sleep(800);
  }
  if (pending) { addReport(s, `- plan not judged before the turn limit: ${pending.try}\n`); }
  addReport(s, `- driver stopped after ${MAX_TURNS} turns without finishing\n`); res.push("unclear");
  out(`UNCLEAR driver hit ${MAX_TURNS} turns`); return res;
}
function loadScenarios(spec) {
  if (fs.existsSync(spec) && spec.endsWith(".json")) { const j = JSON.parse(fs.readFileSync(spec, "utf8")); return Array.isArray(j) ? j : [j]; }
  let text = spec, parts = [];
  if (fs.existsSync(spec)) {
    text = fs.readFileSync(spec, "utf8");
    parts = text.split(/^## +/m).slice(1).map((p) => ({ name: p.split("\n")[0].trim(), body: p, plain: true }));
  }
  return parts.length ? parts : [{ name: "scenario", body: text, plain: true }];
}
// Every scenario gets its own fresh lab (own herdr server, claude, panes and project copy), so one cannot
// leave conversation, panes or files behind for the next. All of them write into one report, named after the first lab.
async function runCmd(argv) {
  const o = parseOpts(argv); const spec = o.rest.join(" ");
  if (!spec) die("run: give a scenario file or description (see lab --help)", 2);
  const scenarios = loadScenarios(spec);
  let runId, warnings = [], verdicts = [], kept = [], current = null;
  const finish = async (s) => { current = null; if (o.keep) kept.push(s.id); else await stop(s.id); };
  // Ctrl-C / kill: stop the lab in flight so its copy of the model login does not stay in /tmp. SIGKILL cannot be caught: use lab stop --stale.
  for (const sig of ["SIGINT", "SIGTERM"]) process.once(sig, async () => { if (current) await stop(current, true); process.exit(130); });
  for (const [n, sc] of scenarios.entries()) {
    const s = await start(argv); current = s.id;
    if (!runId) {
      runId = s.id; warnings = s.warnings || [];
      s.reportId = runId; save(s);
      addReport(s, `# Lab report ${runId}\n\n- started: ${s.started}\n- tools: ${s.tools.join(", ") || "none"}\n${warnings.map((w) => `- **WARNING:** ${w}\n`).join("")}- project copy: ${s.copy.n} files (${s.copy.mode}); withheld ${s.copy.skipped.length}\n- isolation: a fresh lab per scenario (own herdr server, socket, own HOME with ~/.claude holding only .credentials.json and herdr's session hook, project copy); this one: server \`${s.id}\`, socket \`${s.sock}\`\n- screenshots: not supported by herdr; visible pane text only\n- driver: tool-less claude -p in an empty dir; sees only the scenario, its own past actions and the screen\n- judge: tool-less claude -p in an empty dir (no skills, MCP or settings; own HOME with only the login); sees only screen text; quotes machine-checked\n`);
    } else { s.reportId = runId; save(s); }
    addReport(s, `_fresh lab ${s.id} (scenario ${n + 1} of ${scenarios.length})_\n`);
    try { verdicts.push(...(await (sc.plain ? drivePlain(s, sc, o) : runSteps(s, sc, o)))); }
    catch (e) { addReport(s, `## ABORTED\n${e.message || e}\n`); err(`lab: ${e.message || e}`); process.exitCode = 1; }
    await finish(s);
  }
  const tallyText = tally(verdicts);
  const last = { id: runId, reportId: runId };
  addReport(last, `## Summary\n${tallyText}\n${warnings.map((w) => `- **WARNING:** ${w}\n`).join("")}`);
  out(`\nsummary: ${tallyText}${warnings.length ? `  \u26a0 ${warnings.length} warning(s):` : ""}`);
  for (const w of warnings) out(`  \u26a0 ${w}`);
  out(`report: ${reportPath(runId)}`);
  if (kept.length) out(`kept: ${kept.join(", ")} (lab stop <id>)`);
  if (verdicts.some((v) => v !== "pass")) process.exitCode = 1;
}

// ---------- stop ----------
async function stop(id, quiet = false) {
  const dir = dirOf(id); let s;
  try { s = JSON.parse(fs.readFileSync(statePath(id), "utf8")); } catch { if (!fs.existsSync(dir)) die(`no such lab: ${id}`); }
  const left = []; const log = [];
  if (s) {
    const safe = fs.existsSync(s.sock) && socketIsLab(s);
    if (fs.existsSync(s.sock) && !safe) { log.push(`REFUSED to talk to herdr: its socket is not the lab's ${s.sock}`); left.push("lab herdr server (socket check failed; not stopped)"); }
    if (safe && s.workspace) { const r = herdr(s, ["workspace", "close", s.workspace]); log.push(`workspace ${s.workspace} close: ${r.ok ? "ok" : "failed"}`); }
    if (safe) { const r = herdr(s, ["server", "stop"]); log.push(`lab herdr server stop (socket ${s.sock}): ${r.ok ? "ok" : "failed"}`); await sleep(800); }
    if (s.serverPid) {
      if (serverIsOurs(s)) { try { process.kill(s.serverPid, "SIGTERM"); log.push(`SIGTERM lab server pid ${s.serverPid}`); } catch {} }
      else if (fs.existsSync(`/proc/${s.serverPid}`)) log.push(`pid ${s.serverPid} is not this lab's herdr server (reused?): NOT signalled`);
    }
  }
  // delete scratch (only dirs created by this tool: /tmp/lab-xxxxxx)
  if (path.dirname(dir) === TMP && /^lab-[a-z0-9]+$/.test(path.basename(dir))) fs.rmSync(dir, { recursive: true, force: true });
  // leftovers
  if (fs.existsSync(dir)) left.push(`dir ${dir}`);
  const ps = run("pgrep", ["-af", dir]).stdout.trim(); if (ps) left.push(`processes:\n${ps}`);
  if (serverIsOurs(s)) left.push(`pid ${s.serverPid}`);
  if (!quiet) {
    log.forEach((l) => out(`  ${l}`)); out(`  scratch ${dir}: ${fs.existsSync(dir) ? "NOT deleted" : "deleted"}`);
    out(left.length ? `left behind:\n  ${left.join("\n  ")}` : "left behind: nothing");
    const rid = s?.reportId || id;
    if (fs.existsSync(reportPath(rid))) out(`kept (not scratch): report ${reportPath(rid)}`);
    if (s?.workspace && fs.existsSync(reportPath(rid))) addReport(s, `## Stop\n${log.join("\n")}\nleft behind: ${left.join("; ") || "nothing"}\n`);
  }
  return left;
}

// ---------- main ----------
const [cmd, ...argv] = process.argv.slice(2);
switch (cmd) {
  case undefined: case "--help": case "-h": case "help": out(USAGE); break;
  case "doctor": doctor(); break;
  case "start": await start(argv); break;
  case "run": await runCmd(argv); break;
  case "drive": await drive(argv); break;
  case "judge": { const s = load(argv[0]); const [tried, expected] = argv.slice(1);
    if (!tried || !expected) die("judge <id> \"<tried>\" \"<expected>\"", 2);
    const screen = readScreen(s) + `\n\n[LAB RECORD, from herdr] ${paneList(s)}`; const j = judge(s, tried, expected, screen);
    reportStep(s, `judge ${new Date().toISOString()}`, tried, expected, [], screen, j); out(JSON.stringify(j, null, 1)); break; }
  case "report": { const id = argv[0]; if (!fs.existsSync(reportPath(id))) die(`no report for ${id}`); out(fs.readFileSync(reportPath(id), "utf8")); break; }
  case "prune": { // reports are evidence: list by default, delete only with --yes
    const o = parseOpts(argv); const age = parseAge(o.olderThan ?? "14d");
    if (age == null) die(`prune: --older-than wants a number and d|h|m, e.g. 14d (got "${o.olderThan}")`, 2);
    const old = oldReports(REPORTS, age);
    if (!old.length) { out(`no reports older than ${o.olderThan ?? "14d"} in ${REPORTS}`); break; }
    for (const r of old) { out(`${o.yes ? "deleting" : "would delete"} ${r.file}`); if (o.yes) fs.rmSync(r.file); }
    if (!o.yes) out(`${old.length} report(s); nothing deleted. Add --yes to delete them.`);
    break; }
  case "list": labIds().forEach((i) => out(i + (isStale(i) ? "  (STALE: its server is gone; lab stop --stale)" : ""))); break;
  case "stop": {
    const ids = argv[0] === "--all" ? labIds() : argv[0] === "--stale" ? labIds().filter(isStale) : [argv[0]];
    if (!ids[0] && argv[0] === "--stale") { out("no stale labs"); break; }
    if (!ids[0]) die("stop <id>|--all|--stale", 2);
    for (const i of ids) { out(`stopping ${i}`); await stop(i); } break; }
  default: err(`lab: unknown command "${cmd}"\n`); err(USAGE); process.exit(2);
}
