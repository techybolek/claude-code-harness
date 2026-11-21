// Real CLI runs: they need herdr on PATH (the lab refuses to start without it) but start nothing and call no model.
import test, { after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const LAB = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "lab.mjs");
const lab = (args, env = {}, cwd) => spawnSync("node", [LAB, ...args], { encoding: "utf8", cwd, env: { ...process.env, ...env } });
const labIds = () => fs.readdirSync(os.tmpdir()).filter((n) => /^lab-[a-z0-9]+$/.test(n));

test("--help documents run, explore and warnings", () => {
  const r = lab(["--help"]);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /lab run/); assert.match(r.stdout, /explores/); assert.match(r.stdout, /WARNING/);
});

test("a --project that does not exist stops before anything starts", () => {
  const before = labIds();
  const r = lab(["start", "--project", "definitely-not-here"]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /no such folder/);
  assert.deepEqual(labIds(), before);
});

test("prune lists old reports and deletes nothing without --yes; --yes deletes only those", () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "labtest-")); after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  const dir = path.join(cwd, "lab-reports"); fs.mkdirSync(dir);
  const old = path.join(dir, "lab-aaa111.md"), fresh = path.join(dir, "lab-bbb222.md"), other = path.join(dir, "keep.md");
  for (const f of [old, fresh, other]) fs.writeFileSync(f, "x");
  const t = (Date.now() - 30 * 864e5) / 1000; fs.utimesSync(old, t, t); fs.utimesSync(other, t, t);
  const dry = lab(["prune", "--older-than", "14d"], {}, cwd);
  assert.equal(dry.status, 0); assert.match(dry.stdout, /would delete .*lab-aaa111\.md/); assert.match(dry.stdout, /nothing deleted/);
  assert.ok(fs.existsSync(old));
  const real = lab(["prune", "--older-than", "14d", "--yes"], {}, cwd);
  assert.equal(real.status, 0); assert.ok(!fs.existsSync(old)); assert.ok(fs.existsSync(fresh)); assert.ok(fs.existsSync(other), "only lab-*.md are touched");
  assert.equal(lab(["prune", "--older-than", "soon"], {}, cwd).status, 2);
});

test("stop --stale removes a lab whose server is gone, and leaves a lab it cannot prove stale alone (private TMPDIR)", () => {
  const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), "labtest-")); after(() => fs.rmSync(tmpdir, { recursive: true, force: true }));
  const mkLab = (id, state) => { const d = path.join(tmpdir, id); fs.mkdirSync(d); fs.writeFileSync(path.join(d, "state.json"), JSON.stringify({ id, dir: d, sock: path.join(d, "h.sock"), ...state })); fs.writeFileSync(path.join(d, "auth.json"), "secret"); return d; };
  const dead = mkLab("lab-dead01", { serverPid: 2 ** 22 + 12345 });   // no such pid: its server is gone
  const young = mkLab("lab-young1", {});                              // no server recorded yet and just created: not provably stale
  const list = lab(["list"], { TMPDIR: tmpdir }); assert.match(list.stdout, /lab-dead01 .*STALE/); assert.doesNotMatch(list.stdout, /lab-young1 .*STALE/);
  const r = lab(["stop", "--stale"], { TMPDIR: tmpdir });
  assert.equal(r.status, 0); assert.match(r.stdout, /stopping lab-dead01/); assert.doesNotMatch(r.stdout, /lab-young1/);
  assert.ok(!fs.existsSync(dead), "scratch (and the credential copy in it) deleted"); assert.ok(fs.existsSync(young));
  assert.match(lab(["stop", "--stale"], { TMPDIR: tmpdir }).stdout, /no stale labs/);
});

test("refuses a --tool that is no Claude tool, plugin, .claude dir or command", () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "labtest-")); after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  const before = labIds();
  const r = lab(["start", "--tool", "nope"], {}, cwd);
  assert.equal(r.status, 2); assert.match(r.stderr, /tool "nope" not found/);
  assert.deepEqual(labIds(), before);
});

test("refuses to copy a user-level .claude (one holding .credentials.json)", () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "labtest-")); after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  fs.mkdirSync(path.join(cwd, ".claude")); fs.writeFileSync(path.join(cwd, ".claude", ".credentials.json"), "{}");
  const before = labIds();
  const r = lab(["start", "--tool", path.join(cwd, ".claude")], {}, cwd);
  assert.equal(r.status, 2); assert.match(r.stderr, /refusing to copy/);
  assert.deepEqual(labIds(), before);
});
