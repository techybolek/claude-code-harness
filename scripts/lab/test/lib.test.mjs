import test, { after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { denied, extractJson, quoteMatch, withCapability, tally, UNSUPPORTED_MARK, isLabServer, parseAge, oldReports } from "../lib.mjs";

const made = [];
const tmp = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), "labtest-")); made.push(d); return d; };
after(() => made.forEach((d) => fs.rmSync(d, { recursive: true, force: true })));

test("deny-list withholds secrets, agent files, expectation and scenario files", () => {
  for (const f of [".env", ".env.local", "k/server.pem", "id_rsa", "secrets.json", "AGENTS.md", "sub/CLAUDE.md", ".pi/extensions/x.ts",
    ".claude/skills/a/SKILL.md", "expectations.md", "a/expectation.md", "lab-scenarios.md", "lab-reports/x.md"]) assert.ok(denied(f), f);
  for (const f of ["src/app.ts", "README.md", "package.json", "docs/environment.md"]) assert.ok(!denied(f), f);
});

test("extractJson reads fenced, bare and surrounded JSON", () => {
  assert.deepEqual(extractJson('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(extractJson('{"a":[1,2]}'), { a: [1, 2] });
  assert.deepEqual(extractJson('Sure! {"a":2} hope that helps'), { a: 2 });
  assert.deepEqual(extractJson("[1,2]"), [1, 2]);
  assert.deepEqual(extractJson('{"a":1}\n{"b":2}'), { a: 1 }, "two objects: the first wins");
  assert.deepEqual(extractJson('{"a":"x}y","b":"q\\"}"} trailing }'), { a: "x}y", b: 'q"}' }, "braces inside strings");
  assert.throws(() => extractJson("no json here"));
});

test("quoteMatch: exact, whitespace-normalised, absent", () => {
  const screen = "  Split after which message?\n\n  → 2.  assistant:   hi there\n";
  assert.equal(quoteMatch(screen, "Split after which message?"), "exact");
  assert.equal(quoteMatch(screen, "2. assistant: hi there"), "whitespace-normalised");
  assert.equal(quoteMatch(screen, "invented text"), false);
  assert.equal(quoteMatch(screen, ""), false);
});

test("a missing screenshot capability is UNSUPPORTED, not pass, fail or unclear", () => {
  const j = { verdict: "unclear", got: "x", quote: "q" };
  const did = ["typed ls", `${UNSUPPORTED_MARK}: herdr has none`];
  const r = withCapability(j, did, "Take a screenshot.");
  assert.equal(r.verdict, "unsupported");
  assert.equal(withCapability(j, did, "Run /split. Does the picker open?").verdict, "unclear", "a stray screenshot action must not hide a real result"); assert.match(r.note, /cannot do what was asked/);
  assert.equal(withCapability(j, ["typed ls"], "Take a screenshot.").verdict, "unclear", "untouched without the mark");
  assert.equal(j.verdict, "unclear", "input is not mutated");
});

test("tally counts every verdict kind", () => {
  assert.equal(tally(["pass", "pass", "pass", "unsupported"]), "3 pass, 0 fail, 0 unclear, 1 unsupported");
});

test("deny-list also withholds cloud, registry and VCS credentials", () => {
  for (const f of [".npmrc", "web/.npmrc", ".netrc", ".pypirc", ".git-credentials", "infra/prod.tfvars", "terraform.tfstate", ".aws/credentials",
    "home/.ssh/config", ".kube/config", "kubeconfig", "kube-config.yaml", ".docker/config.json", "keys/store.jks", "vpn/work.ovpn", "db.kdbx"]) assert.ok(denied(f), f);
  for (const f of ["src/npmrc-docs.md", "docs/aws-guide.md", "infra/main.tf", "src/kubernetes.ts", "README.md"]) assert.ok(!denied(f), f);
});

test("isLabServer accepts only our own herdr server (a reused pid must not match)", () => {
  const sock = "/tmp/lab-abc123/h.sock", env = (v) => `PATH=/bin\0HERDR_SOCKET_PATH=${v}\0HOME=/x\0`;
  assert.equal(isLabServer({ cmdline: "/usr/local/bin/herdr\0server\0", environ: env(sock) }, sock), true);
  assert.equal(isLabServer({ cmdline: "herdr\0server\0", environ: env("/home/u/.config/herdr/h.sock") }, sock), false, "another herdr server (e.g. yours)");
  assert.equal(isLabServer({ cmdline: "herdr\0pane\0list\0", environ: env(sock) }, sock), false, "not the server subcommand");
  assert.equal(isLabServer({ cmdline: "/usr/bin/vim\0server\0", environ: env(sock) }, sock), false, "unrelated process");
  assert.equal(isLabServer({ cmdline: "", environ: "" }, sock), false, "process gone");
});

test("parseAge reads 14d / 12h / 30m and nothing else", () => {
  assert.equal(parseAge("14d"), 14 * 864e5); assert.equal(parseAge("12h"), 12 * 36e5); assert.equal(parseAge("30m"), 30 * 6e4);
  for (const bad of ["", "14", "d", "-1d", "1w", "1.5d", undefined]) assert.equal(parseAge(bad), null, String(bad));
});

test("oldReports lists only old lab-*.md files", () => {
  const dir = tmp(), now = Date.now(), day = 864e5;
  const mk = (name, ageDays) => { const f = path.join(dir, name); fs.writeFileSync(f, "x"); const t = (now - ageDays * day) / 1000; fs.utimesSync(f, t, t); };
  mk("lab-old111.md", 30); mk("lab-new222.md", 1); mk("notes.md", 90); mk("lab-old333.txt", 90);
  assert.deepEqual(oldReports(dir, 14 * day, now).map((r) => path.basename(r.file)), ["lab-old111.md"]);
  assert.deepEqual(oldReports(path.join(dir, "missing"), day, now), []);
});
