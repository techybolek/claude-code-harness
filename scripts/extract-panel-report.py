#!/usr/bin/env python3
"""Reconstruct a per-reviewer report from a Workflow run's persisted artifacts.

The review panel is a black box: review-flow-only.js flattens the three lens
panelists into one list (`panel.flatMap(p => p.blocking)`) before anything
downstream sees them, so the returned verdict cannot say which lens found what,
which reviewer was dead weight, or what any of it cost.

None of that is actually lost -- it is only unrendered. This reads it back:

  <session>/workflows/wf_<id>.json          run + phase + per-agent telemetry
  <session>/subagents/workflows/wf_<id>/
      journal.jsonl                         each agent's structured result
      agent-<id>.jsonl                      token usage, codex output pointer
      agent-<id>.meta.json                  the model ALIAS that was requested
  <session>/tool-results/<id>.txt           codex's own banner: its model + workdir

Read-only. Works retroactively on any run still on disk.

Usage:
    extract-panel-report.py                 latest run for the current repo
    extract-panel-report.py --list          every run on the machine
    extract-panel-report.py wf_ec8ad3db-fa7 one specific run
    extract-panel-report.py --json out.json machine-readable sibling
"""
import argparse
import glob
import json
import os
import re
import subprocess
import sys
import time

PROJECTS = os.path.expanduser("~/.claude/projects")

# Published per-MTok rates. EDIT THESE when pricing changes -- they are the only
# guess in this script, and every cost figure below is derived from them.
# Cache multipliers follow the convention recorded in notes/harness-tuning-log.md
# ("published rates, 1h-cache writes (2x)"), which reproduced the CLI's own
# figure within 1%.
RATES = {
    "claude-haiku-4-5": (1.00, 5.00),
    "claude-sonnet-5":  (3.00, 15.00),
    "claude-opus-5":    (15.00, 75.00),
    "claude-opus-4-8":  (15.00, 75.00),
}
CACHE_WRITE_5M = 1.25
CACHE_WRITE_1H = 2.00
CACHE_READ = 0.10


def rate_for(model):
    if not model:
        return None
    for key, val in RATES.items():
        if model.startswith(key):
            return val
    return None


def cost_of(model, u):
    r = rate_for(model)
    if not r:
        return None
    inp, out = r
    per = inp / 1_000_000
    return (
        u["input_tokens"] * per
        + u["cache_read_input_tokens"] * per * CACHE_READ
        + u["cache_write_5m"] * per * CACHE_WRITE_5M
        + u["cache_write_1h"] * per * CACHE_WRITE_1H
        + u["output_tokens"] * (out / 1_000_000)
    )


# ---------- discovery ----------

def discover_runs():
    runs = []
    for path in glob.glob(os.path.join(PROJECTS, "*", "*", "workflows", "wf_*.json")):
        try:
            with open(path) as fh:
                wf = json.load(fh)
        except Exception:
            continue
        if not wf.get("runId"):
            continue
        runs.append({"path": path, "mtime": os.path.getmtime(path), "wf": wf})
    runs.sort(key=lambda r: r["mtime"], reverse=True)
    return runs


def plan_of(wf):
    args = wf.get("args")
    if isinstance(args, dict):
        return args.get("planPath") or args.get("specPath") or ""
    return ""


def repo_slug():
    try:
        root = subprocess.run(
            ["git", "rev-parse", "--show-toplevel"],
            capture_output=True, text=True, check=True,
        ).stdout.strip()
    except Exception:
        return None
    # A worktree's slug extends the main repo's, so a prefix match covers both.
    common = re.sub(r"/worktrees/.*$", "", root)
    return common.replace("/", "-")


def pick_run(runs, run_id):
    if run_id:
        for r in runs:
            if r["wf"]["runId"] == run_id:
                return r
        sys.exit(f"No run {run_id} on disk. Try --list.")
    slug = repo_slug()
    if slug:
        for r in runs:
            # projects/<project-slug>/<session-id>/workflows/wf_x.json
            project = os.path.basename(os.path.dirname(os.path.dirname(os.path.dirname(r["path"]))))
            if project.startswith(slug):
                return r
    if not runs:
        sys.exit("No workflow runs found on disk.")
    print(f"note: no run matches the current repo; using the newest run overall", file=sys.stderr)
    return runs[0]


def print_list(runs):
    print(f"{'when':<12} {'workflow':<19} {'runId':<18} {'status':<10} {'agents':>6} {'mins':>6}  plan")
    for r in runs:
        wf = r["wf"]
        print("{:<12} {:<19} {:<18} {:<10} {:>6} {:>6.1f}  {}".format(
            time.strftime("%m-%d %H:%M", time.localtime(r["mtime"])),
            str(wf.get("workflowName"))[:19],
            wf["runId"],
            str(wf.get("status"))[:10],
            wf.get("agentCount") or 0,
            (wf.get("durationMs") or 0) / 60000,
            (plan_of(wf) or "")[:60],
        ))


# ---------- per-agent artifacts ----------

def transcript_dir(run):
    session = os.path.dirname(os.path.dirname(run["path"]))
    return session, os.path.join(session, "subagents", "workflows", run["wf"]["runId"])


def load_journal(tdir):
    """agentId -> structured result. The journal is a resume cache: no timing,
    no model, no label. It is used here for one thing only -- the result payload."""
    out = {}
    path = os.path.join(tdir, "journal.jsonl")
    if not os.path.exists(path):
        return out
    with open(path) as fh:
        for line in fh:
            try:
                o = json.loads(line)
            except Exception:
                continue
            if o.get("type") == "result" and o.get("agentId"):
                out[o["agentId"]] = o.get("result")
    return out


def agent_file(tdir, agent_id):
    path = os.path.join(tdir, f"agent-{agent_id}.jsonl")
    return path if os.path.exists(path) else None


def requested_alias(tdir, agent_id):
    path = os.path.join(tdir, f"agent-{agent_id}.meta.json")
    try:
        with open(path) as fh:
            return json.load(fh).get("model")
    except Exception:
        return None


def scan_agent(path):
    """One pass over a subagent transcript: token usage, resolved model, the
    codex tool-result pointers, and any inline codex banner."""
    usage = dict.fromkeys(
        ["input_tokens", "output_tokens", "cache_read_input_tokens",
         "cache_write_5m", "cache_write_1h", "thinking_tokens"], 0)
    models, pointers, banners = set(), [], []
    if not path:
        return usage, None, pointers, banners
    with open(path) as fh:
        for line in fh:
            try:
                o = json.loads(line)
            except Exception:
                continue
            msg = o.get("message")
            if isinstance(msg, dict):
                if msg.get("model"):
                    models.add(msg["model"])
                u = msg.get("usage")
                if isinstance(u, dict):
                    usage["input_tokens"] += u.get("input_tokens", 0)
                    usage["output_tokens"] += u.get("output_tokens", 0)
                    usage["cache_read_input_tokens"] += u.get("cache_read_input_tokens", 0)
                    cc = u.get("cache_creation") or {}
                    w5 = cc.get("ephemeral_5m_input_tokens")
                    w1 = cc.get("ephemeral_1h_input_tokens")
                    if w5 is None and w1 is None:
                        usage["cache_write_5m"] += u.get("cache_creation_input_tokens", 0)
                    else:
                        usage["cache_write_5m"] += w5 or 0
                        usage["cache_write_1h"] += w1 or 0
                    usage["thinking_tokens"] += (u.get("output_tokens_details") or {}).get("thinking_tokens", 0)
            blob = line
            for pid in re.findall(r"tool-results/([a-z0-9]+)\.txt", blob):
                if pid not in pointers:
                    pointers.append(pid)
            if "OpenAI Codex v" in blob:
                banners.append(blob)
    model = sorted(models)[-1] if models else None
    return usage, model, pointers, banners


CODEX_BANNER = re.compile(r"(?:^|\\n|\n)\s*(model|workdir|provider|reasoning effort):\s*([^\\\n\"]+)")


def codex_provenance(session, pointers, banners):
    """One record per codex invocation, in order. A seat may invoke codex more
    than once (a retry after a bad -C, a second attempt after a timeout), so a
    single banner is not the whole story -- the first one is often the discarded
    attempt."""
    texts = []
    for pid in pointers:
        p = os.path.join(session, "tool-results", f"{pid}.txt")
        if os.path.exists(p):
            try:
                with open(p, errors="replace") as fh:
                    texts.append(fh.read(4096))
            except Exception:
                pass
    texts.extend(b[:4096] for b in banners)
    runs = []
    for t in texts:
        if "OpenAI Codex" not in t:
            continue
        info = {}
        for key, val in CODEX_BANNER.findall(t):
            info.setdefault(key, val.strip().rstrip('",'))
        if info:
            runs.append(info)
    return runs


# ---------- seat roles ----------

def seat_role(label):
    """Derive role and lens from the agent label. Labels are stable across the
    harness revisions on disk; result SCHEMAS are not, so nothing here keys off
    the payload shape."""
    label = label or ""
    m = re.match(r"code review r(\d+):codex:(\S+)", label)
    if m:
        return "panelist", m.group(2), int(m.group(1))
    m = re.match(r"code review r(\d+):codex$", label)
    if m:
        return "re-reviewer", None, int(m.group(1))
    m = re.match(r"codex:(\S+)", label)          # codex-panel-report
    if m:
        return "panelist", m.group(1), 1
    m = re.match(r"adjudicate r(\d+)", label)
    if m:
        return "adjudicator", None, int(m.group(1))
    m = re.match(r"triage r(\d+)", label)        # pre-2026-08-27 two-seat shape
    if m:
        return "adjudicator", None, int(m.group(1))
    m = re.match(r"fix r(\d+)", label)
    if m:
        return "fixer", None, int(m.group(1))
    if re.match(r"(final )?validation", label):
        return "validator", None, 0
    return "other", None, 0


# Every list an adjudicating seat can return, across harness revisions:
# {fixed,rejected,declined,planDeviations} today, {confirmed,rejected,
# planDeviations} before 2026-08-27. Duck-typed on purpose.
OUTCOME_KEYS = {
    "fixed": "FIXED", "confirmed": "CONFIRMED", "rejected": "REJECTED",
    "declined": "DECLINED", "planDeviations": "ESCALATED",
}


def findings_of(result):
    if not isinstance(result, dict):
        return [], []
    return list(result.get("blocking") or []), list(result.get("nits") or [])


# ---------- finding identity ----------

LOC = re.compile(r"[\w./-]+\.\w{1,5}:\d+")
STOP = set("the a an of to in is are and or that this it for on with as be by".split())


def loc_of(text):
    m = LOC.search(text or "")
    return m.group(0) if m else None


def bag(text):
    return {w for w in re.findall(r"[a-zA-Z_]{4,}", (text or "").lower()) if w not in STOP}


def same_finding(a, b):
    """Findings get reworded between the panel and the adjudicator, so exact
    string equality is useless. Same file:line, or a strong token overlap."""
    la, lb = loc_of(a), loc_of(b)
    if la and lb and la == lb:
        return True
    ba, bb = bag(a), bag(b)
    if not ba or not bb:
        return False
    return len(ba & bb) / min(len(ba), len(bb)) >= 0.55


def match_outcome(finding, adjudications):
    for outcome, items in adjudications:
        for item in items:
            if same_finding(finding, item):
                return outcome
    return None


# ---------- rendering ----------

def fmt_tokens(n):
    if n >= 1_000_000:
        return f"{n/1_000_000:.1f}M"
    if n >= 1_000:
        return f"{n/1_000:.0f}k"
    return str(n)


def build(run):
    wf = run["wf"]
    session, tdir = transcript_dir(run)
    journal = load_journal(tdir)

    seats = []
    for rec in wf.get("workflowProgress") or []:
        if rec.get("type") != "workflow_agent":
            continue
        aid = rec.get("agentId")
        role, lens, rnd = seat_role(rec.get("label"))
        path = agent_file(tdir, aid) if aid else None
        usage, resolved, pointers, banners = scan_agent(path)
        result = journal.get(aid)
        blocking, nits = findings_of(result)
        seats.append({
            "label": rec.get("label"),
            "role": role, "lens": lens, "round": rnd,
            "agentId": aid,
            "state": rec.get("state"),
            "attempt": rec.get("attempt"),
            "durationMs": rec.get("durationMs") or 0,
            "queueMs": (rec.get("startedAt") or 0) - (rec.get("queuedAt") or 0),
            "toolCalls": rec.get("toolCalls"),
            "verdict": (result or {}).get("verdict") if isinstance(result, dict) else None,
            "lastToolSummary": rec.get("lastToolSummary"),
            "model": rec.get("model") or resolved,
            "modelRequested": requested_alias(tdir, aid) if aid else None,
            "usage": usage,
            "cost": cost_of(rec.get("model") or resolved, usage),
            "blocking": blocking, "nits": nits,
            "result": result,
            "codex": codex_provenance(session, pointers, banners),
        })

    adjudications = []
    for s in seats:
        if s["role"] == "adjudicator" and isinstance(s["result"], dict):
            for key, outcome in OUTCOME_KEYS.items():
                items = s["result"].get(key)
                if items:
                    adjudications.append((outcome, list(items)))

    panelists = [s for s in seats if s["role"] in ("panelist", "re-reviewer")]
    for s in panelists:
        others = [f for o in panelists if o is not s for f in o["blocking"]]
        s["findings"] = [{
            "text": f,
            "outcome": match_outcome(f, adjudications),
            "corroborated": any(same_finding(f, g) for g in others),
        } for f in s["blocking"]]

    return {"run": wf, "session": session, "tdir": tdir, "seats": seats,
            "panelists": panelists, "adjudications": adjudications}


def render(data):
    wf, out = data["run"], []
    args = wf.get("args") if isinstance(wf.get("args"), dict) else {}
    plan = plan_of(wf)
    o = out.append

    o(f"# Panel report — {os.path.basename(os.path.dirname(plan)) or wf.get('workflowName')}")
    o("")
    o("| | |")
    o("|---|---|")
    o(f"| Run | `{wf['runId']}` ({wf.get('workflowName')}) |")
    o(f"| Status | {wf.get('status')} |")
    o(f"| Plan | `{plan}` |")
    if args.get("baseRef"):
        o(f"| Base ref | `{args['baseRef']}` |")
    if args.get("specPath"):
        o(f"| Spec | `{args['specPath']}` |")
    o(f"| Duration | {(wf.get('durationMs') or 0)/60000:.1f} min |")
    o(f"| Agents | {wf.get('agentCount')} |")
    total_cost = sum(s["cost"] or 0 for s in data["seats"])
    o(f"| Est. cost | ${total_cost:.2f} |")
    o(f"| Transcripts | `{data['tdir']}` |")
    o("")

    if wf.get("status") != "completed":
        o(f"> **This run did not complete** (`{wf.get('status')}`). Findings below are partial.")
        o("")

    # ---- scorecard ----
    reviewers = [s for s in data["seats"] if s["role"] in ("panelist", "re-reviewer")]
    if not reviewers:
        o("_This run had no reviewer seats — nothing to score._")
        o("")
    if reviewers:
        o("## Scorecard")
        o("")
        o("| seat | lens | verdict | blocking | fixed | declined | rejected | escalated | unique | model | dur | tokens | cost |")
        o("|---|---|---|---:|---:|---:|---:|---:|---:|---|---:|---:|---:|")
        for s in data["seats"]:
            if s["role"] not in ("panelist", "re-reviewer"):
                continue
            fs = s.get("findings", [])
            def n(x):
                return sum(1 for f in fs if f["outcome"] == x)
            uniq = sum(1 for f in fs if not f["corroborated"])
            u = s["usage"]
            toks = u["input_tokens"] + u["output_tokens"] + u["cache_read_input_tokens"] + u["cache_write_5m"] + u["cache_write_1h"]
            verdict = s["verdict"] or s["lastToolSummary"] or s["state"]
            o("| {} | {} | {} | {} | {} | {} | {} | {} | {} | {} | {:.0f}m | {} | {} |".format(
                s["label"], s["lens"] or "—", verdict, len(fs),
                n("FIXED") + n("CONFIRMED"), n("DECLINED"), n("REJECTED"), n("ESCALATED"),
                uniq if fs else "—",
                (s["model"] or "?").replace("claude-", ""),
                s["durationMs"] / 60000, fmt_tokens(toks),
                f"${s['cost']:.2f}" if s["cost"] is not None else "?"))
        o("")
        o("`unique` = findings no other reviewer independently raised. A lens with "
          "blocking findings but zero unique ones corroborated others' work without "
          "adding coverage of its own.")
        o("")

    # ---- non-reviewer seats ----
    others = [s for s in data["seats"] if s["role"] not in ("panelist", "re-reviewer")]
    if others:
        o("## Other seats")
        o("")
        o("| seat | role | model (requested) | dur | tokens | cost |")
        o("|---|---|---|---:|---:|---:|")
        for s in others:
            u = s["usage"]
            toks = sum(u[k] for k in ("input_tokens", "output_tokens", "cache_read_input_tokens", "cache_write_5m", "cache_write_1h"))
            o("| {} | {} | {} ({}) | {:.0f}m | {} | {} |".format(
                s["label"], s["role"], (s["model"] or "?").replace("claude-", ""),
                s["modelRequested"] or "?", s["durationMs"] / 60000, fmt_tokens(toks),
                f"${s['cost']:.2f}" if s["cost"] is not None else "?"))
        o("")

    # ---- alias drift ----
    drift = [s for s in data["seats"]
             if s["modelRequested"] and s["model"]
             and not s["model"].startswith(f"claude-{s['modelRequested']}")
             and s["modelRequested"] not in s["model"]]
    if drift:
        o("## ⚠ Model alias drift")
        o("")
        o("A bare alias can silently resolve to the session model (CLI ≥ 2.1.219). "
          "These seats did not run on what the script asked for:")
        o("")
        for s in drift:
            o(f"- `{s['label']}` — requested `{s['modelRequested']}`, ran `{s['model']}`")
        o("")

    # ---- codex provenance ----
    prov = [s for s in data["seats"] if s.get("codex")]
    if prov:
        # The workdir the run SHOULD have reviewed: the one most seats used.
        tally = {}
        for s in prov:
            for inv in s["codex"]:
                if inv.get("workdir"):
                    tally[inv["workdir"]] = tally.get(inv["workdir"], 0) + 1
        expected = max(tally, key=tally.get) if tally else None

        o("## Codex provenance")
        o("")
        o(f"Expected workdir: `{expected}`" if expected else "Workdir not recorded.")
        o("")
        o("| seat | invocations | codex model | workdir(s) | reasoning |")
        o("|---|---:|---|---|---|")
        offenders = []
        for s in prov:
            invs = s["codex"]
            wds = [i.get("workdir", "?") for i in invs]
            models = sorted({i.get("model", "?") for i in invs})
            # Collapse repeats: the expected workdir is a check, deviations are named.
            seq, prev, count = [], None, 0
            for w in wds + [None]:
                if w == prev:
                    count += 1
                    continue
                if prev is not None:
                    mark = "✓" if prev == expected else f"**`{prev}`**"
                    seq.append(mark + (f"×{count}" if count > 1 else ""))
                prev, count = w, 1
            shown = " → ".join(seq)
            o("| {} | {} | {} | {} | {} |".format(
                s["label"], len(invs), ", ".join(models), shown,
                invs[-1].get("reasoning effort", "—")))
            if expected and expected not in wds:
                offenders.append(s)
        o("")
        retried = [s for s in prov if len({i.get("workdir") for i in s["codex"]}) > 1]
        if retried:
            o("Seats that invoked codex in more than one workdir (a retry — the last "
              "invocation is the one that produced the transcribed report): "
              + ", ".join(f"`{s['label']}`" for s in retried))
            o("")
        if offenders:
            o("> ⚠ **Never reviewed the expected workdir:** "
              + ", ".join(f"`{s['label']}`" for s in offenders)
              + ". A verdict from the wrong directory is INVALID, not a pass "
                "(this exact failure produced false PASSes on 2026-08-04).")
            o("")
        allmodels = {i.get("model") for s in prov for i in s["codex"] if i.get("model")}
        if len(allmodels) > 1:
            o(f"> ⚠ Panelists ran on different codex models: {', '.join(sorted(allmodels))}.")
            o("")

    # ---- findings ----
    o("## Findings by reviewer")
    o("")
    for s in data["seats"]:
        if s["role"] not in ("panelist", "re-reviewer"):
            continue
        verdict = s["verdict"] or s["lastToolSummary"] or s["state"]
        o(f"### {s['label']} — {verdict}")
        o("")
        if verdict == "UNAVAILABLE":
            u = s["usage"]
            o(f"_Reviewer did not run — codex was unavailable. Cost of the failed seat: "
              f"{fmt_tokens(u['output_tokens'])} output tokens, {s['durationMs']/60000:.0f} min._")
            o("")
            continue
        fs = s.get("findings", [])
        if not fs:
            o("_No blocking findings._")
        for f in fs:
            tag = f["outcome"] or "UNMATCHED"
            mark = "" if f["corroborated"] else " ·unique"
            o(f"- **[{tag}]**{mark} {f['text']}")
        if s["nits"]:
            o("")
            o(f"<details><summary>{len(s['nits'])} nits</summary>")
            o("")
            for nit in s["nits"]:
                o(f"- {nit}")
            o("")
            o("</details>")
        o("")

    unmatched = [f for s in data["panelists"] for f in s.get("findings", []) if not f["outcome"]]
    if unmatched and data["adjudications"]:
        o(f"> {len(unmatched)} finding(s) could not be matched to an adjudicator outcome. "
          "Either the adjudicator reworded them past recognition, or the run ended "
          "before they were ruled on.")
        o("")

    # ---- run verdict + logs ----
    result = wf.get("result")
    if isinstance(result, dict):
        o("## Run verdict")
        o("")
        for key in ("validation", "review"):
            if result.get(key):
                o(f"- **{key}:** {result[key]}")
        for key, title in (("planDeviations", "Plan deviations (human ruling required)"),
                           ("unresolvedFindings", "Unresolved"),
                           ("declined", "Declined — real, deliberately unfixed")):
            items = result.get(key)
            if items:
                o("")
                o(f"**{title} ({len(items)}):**")
                for i, item in enumerate(items, 1):
                    o(f"{i}. {item}")
        o("")

    logs = wf.get("logs")
    if logs:
        o("## Workflow log")
        o("")
        for line in logs:
            o(f"- `{line}`")
        o("")

    o("---")
    o(f"_Generated by extract-panel-report.py from run artifacts. Costs are estimates "
      f"from the rate table in the script; verify against current published rates._")
    return "\n".join(out)


def main():
    ap = argparse.ArgumentParser(description="Per-reviewer report from a Workflow run's artifacts.")
    ap.add_argument("run_id", nargs="?", help="runId (default: newest run for this repo)")
    ap.add_argument("--list", action="store_true", help="list runs on disk and exit")
    ap.add_argument("-o", "--out", help="write markdown here (default: stdout)")
    ap.add_argument("--json", dest="json_out", help="also write the structured data here")
    args = ap.parse_args()

    runs = discover_runs()
    if args.list:
        print_list(runs)
        return 0

    run = pick_run(runs, args.run_id)
    data = build(run)
    md = render(data)

    if args.out:
        with open(args.out, "w") as fh:
            fh.write(md + "\n")
        print(args.out)
    else:
        print(md)

    if args.json_out:
        slim = {
            "runId": data["run"]["runId"],
            "workflowName": data["run"].get("workflowName"),
            "status": data["run"].get("status"),
            "args": data["run"].get("args"),
            "durationMs": data["run"].get("durationMs"),
            "seats": [{k: v for k, v in s.items() if k != "result"} for s in data["seats"]],
        }
        with open(args.json_out, "w") as fh:
            json.dump(slim, fh, indent=2)
        print(args.json_out, file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
