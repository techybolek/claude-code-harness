// Pure helpers (no I/O beyond the paths given), kept apart from lab.mjs so they can be unit-tested.
import fs from "node:fs";
import path from "node:path";

// Files never copied into the project copy even if tracked.
export const DENY = [/(^|\/)\.env(\.|$)/, /\.(pem|key|p12|pfx)$/i, /(^|\/)(id_rsa|id_ed25519)/,
  /(^|\/)(secrets?|credentials?)(\.[a-z]+)?$/i, /(^|\/)(AGENTS|CLAUDE)\.md$/, /(^|\/)\.(claude|agents|pi|cursor|windsurf)(\/|$)/,
  /(^|\/)\.cursorrules$/, /(^|\/)expectations?\.md$/i, /(^|\/)lab-scenarios\.md$/, /(^|\/)lab-reports(\/|$)/,
  // cloud, registry and VCS credentials
  /(^|\/)\.(npmrc|netrc|_netrc|pypirc|git-credentials|pgpass|htpasswd)$/i, /\.(tfvars|tfstate)(\.json)?$/i, /(^|\/)\.(aws|ssh|gnupg|kube|docker|azure|gcloud)(\/|$)/,
  /(^|\/)(kubeconfig|\.?kube[-_]?config)(\.[a-z]+)?$/i, /(^|\/)config\/gcloud(\/|$)/, /\.(kdbx|jks|keystore|ovpn)$/i];
export const denied = (file) => DENY.some((re) => re.test(file));

// First complete JSON value in a model reply: fenced or bare, ignoring any text (even more JSON) around it.
export function extractJson(t) {
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fence ? fence[1] : t;
  const start = body.search(/[\[{]/);
  if (start < 0) throw new Error("no JSON in reply");
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < body.length; i++) {
    const c = body[i];
    if (inStr) { if (esc) esc = false; else if (c === "\\") esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true;
    else if (c === "{" || c === "[") depth++;
    else if ((c === "}" || c === "]") && --depth === 0) return JSON.parse(body.slice(start, i + 1));
  }
  throw new Error("unterminated JSON in reply");
}

const norm = (t) => t.replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();
// How a judge's quote relates to the screen it was given: "exact", "whitespace-normalised" or false.
export function quoteMatch(screen, quote) {
  if (!quote) return false;
  if (screen.includes(quote)) return "exact";
  return norm(screen).includes(norm(quote)) ? "whitespace-normalised" : false;
}

export const UNSUPPORTED_MARK = "SCREENSHOT UNSUPPORTED";
// A capability the lab lacks (herdr has no screenshot) is neither a pass nor a failure of the tool under test.
// Only when the step itself is about a screenshot: a stray screenshot action must not hide a real result.
export function withCapability(j, did, tried) {
  if (!/screenshot/i.test(tried || "") || !did.some((d) => d.startsWith(UNSUPPORTED_MARK))) return j;
  return { ...j, verdict: "unsupported", note: [j.note, "the lab cannot do what was asked (no screenshot in herdr); nothing was tested"].filter(Boolean).join("; ") };
}
export const VERDICTS = ["pass", "fail", "unclear", "unsupported"];
export const tally = (verdicts) => VERDICTS.map((v) => `${verdicts.filter((x) => x === v).length} ${v}`).join(", ");
// Is this process the lab's own `herdr server`? Checked before any signal is sent, because a pid can be reused.
// cmdline and environ are the raw /proc contents (NUL-separated).
export function isLabServer({ cmdline = "", environ = "" }, sock) {
  const argv = cmdline.split("\0").filter(Boolean);
  if (!argv.length || path.basename(argv[0]) !== "herdr" || !argv.slice(1).includes("server")) return false;
  return environ.split("\0").includes(`HERDR_SOCKET_PATH=${sock}`);
}

// "14d" / "12h" / "30m" -> milliseconds; null when it is not that form.
export function parseAge(text) {
  const m = /^(\d+)([dhm])$/.exec(text || ""); if (!m) return null;
  return +m[1] * { d: 864e5, h: 36e5, m: 6e4 }[m[2]];
}

// lab-*.md reports in `dir` last modified more than `ageMs` before `now`. Other files are never listed.
export function oldReports(dir, ageMs, now = Date.now()) {
  let names; try { names = fs.readdirSync(dir); } catch { return []; }
  return names.filter((n) => /^lab-[a-z0-9]+\.md$/.test(n))
    .map((n) => ({ file: path.join(dir, n), mtime: fs.statSync(path.join(dir, n)).mtimeMs }))
    .filter((r) => now - r.mtime > ageMs);
}
