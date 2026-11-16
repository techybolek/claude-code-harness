#!/usr/bin/env python3
"""Harness steward helpers (deterministic, no LLM).

extract <since-iso> <out-dir>
    Digest every main-session transcript under ~/.claude/projects modified since
    <since-iso> into a compact markdown file, group digests into batches for the
    reader agents, and print a JSON manifest on stdout.
cost <workflow-dir>
    Approximate $ cost of one workflow run from its agent transcripts.
"""
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

PROJECTS = Path.home() / ".claude" / "projects"
MAX_USER_MSG = 1200      # chars kept per user message
MAX_CONTEXT = 400        # chars of assistant text kept before each user message
MAX_ERRORS = 40          # tool errors listed per session (rest counted)
MAX_DIGEST = 60_000      # chars per session digest
BATCH_CHARS = 180_000    # digest chars per reader agent

# $/MTok: input, output, cache read, cache write (5m). Approximate.
PRICES = {
    "claude-fable-5-2": (8, 40, 0.20, 10),
    "claude-opus-5-5": (4, 20, 0.20, 5),
    "claude-sonnet-5-5": (2, 10, 0.10, 2.5),
    "claude-haiku-5-5": (0.10, 0.50, 0.01, 0.125),
}


def parse_ts(s):
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


def text_of(content):
    if isinstance(content, str):
        return content
    return "\n".join(b.get("text", "") for b in content if isinstance(b, dict) and b.get("type") == "text")


def clip(s, n):
    s = s.strip()
    return s if len(s) <= n else s[:n] + f" […+{len(s) - n} chars]"


def user_line(raw):
    """Return the human-meaningful part of a user string message, or None."""
    s = raw.strip()
    m = re.search(r"<command-name>(.*?)</command-name>.*?(?:<command-args>(.*?)</command-args>)?", s, re.S)
    if m:
        return f"[command] {m.group(1)} {clip(m.group(2) or '', 300)}".strip()
    if s.startswith("<task-notification>"):
        status = re.search(r"<status>(.*?)</status>", s, re.S)
        summ = re.search(r"<summary>(.*?)</summary>", s, re.S)
        return f"[task-notification] {status.group(1) if status else ''} {clip(summ.group(1), 200) if summ else ''}".strip()
    if s.startswith("<local-command") or s.startswith("<system-reminder>"):
        return None
    if s.startswith("[Request interrupted"):
        return "[INTERRUPTED by user]"
    return clip(s, MAX_USER_MSG)


def digest_session(path):
    lines = []
    models, out_tok, errors, rejected, n_user = {}, 0, [], 0, 0
    last_assistant, cwd, first_ts, last_ts = "", None, None, None
    for raw in path.open(encoding="utf-8", errors="replace"):
        try:
            rec = json.loads(raw)
        except json.JSONDecodeError:
            continue
        ts = rec.get("timestamp")
        if ts:
            first_ts = first_ts or ts
            last_ts = ts
        cwd = cwd or rec.get("cwd")
        t = rec.get("type")
        msg = rec.get("message") or {}
        if t == "assistant":
            m = msg.get("model")
            if m:
                models[m] = models.get(m, 0) + 1
            out_tok += (msg.get("usage") or {}).get("output_tokens", 0) or 0
            txt = text_of(msg.get("content") or [])
            if txt.strip():
                last_assistant = txt
        elif t == "user":
            c = msg.get("content")
            if isinstance(c, str) or (isinstance(c, list) and any(b.get("type") == "text" for b in c if isinstance(b, dict))):
                line = user_line(c if isinstance(c, str) else text_of(c))
                if line:
                    n_user += 1
                    if last_assistant:
                        lines.append(f"> assistant (tail): {clip(last_assistant[-MAX_CONTEXT:], MAX_CONTEXT)}")
                        last_assistant = ""
                    lines.append(f"USER: {line}")
            elif isinstance(c, list):
                for b in c:
                    if isinstance(b, dict) and b.get("type") == "tool_result" and b.get("is_error"):
                        body = b.get("content")
                        body = body if isinstance(body, str) else json.dumps(body)[:600]
                        if "doesn't want to proceed" in body or "rejected" in body[:200]:
                            rejected += 1
                            lines.append("[TOOL CALL REJECTED by user]")
                        else:
                            errors.append(clip(body.replace("\n", " "), 200))
    if n_user == 0 and not errors:
        return None
    wf = summarize_workflows(path.with_suffix(""))
    head = [
        f"# Session {path.stem}",
        f"project: {cwd}  |  {first_ts} → {last_ts}",
        f"models: {models}  |  output tokens: {out_tok}  |  user messages: {n_user}  |  tool errors: {len(errors)}  |  rejected tool calls: {rejected}",
    ]
    if wf:
        head.append("workflow runs:\n" + "\n".join(wf))
    if errors:
        shown = errors[:MAX_ERRORS]
        head.append("tool errors:\n" + "\n".join(f"- {e}" for e in shown)
                    + (f"\n- […{len(errors) - len(shown)} more omitted]" if len(errors) > len(shown) else ""))
    body = "\n".join(lines)
    text = "\n".join(head) + "\n\n## Conversation (user turns)\n" + body
    if len(text) > MAX_DIGEST:
        keep = MAX_DIGEST // 2
        text = text[:keep] + f"\n\n[… {len(text) - MAX_DIGEST} chars of the middle omitted by extractor …]\n\n" + text[-keep:]
    return {"text": text, "cwd": cwd, "lastTs": last_ts}


def summarize_workflows(session_dir):
    out = []
    for j in sorted((session_dir / "subagents" / "workflows").glob("*/journal.jsonl")):
        started, results, nulls = 0, 0, 0
        for raw in j.open(encoding="utf-8", errors="replace"):
            try:
                r = json.loads(raw)
            except json.JSONDecodeError:
                continue
            if r.get("type") == "started":
                started += 1
            elif r.get("type") == "result":
                results += 1
                if r.get("value") is None:
                    nulls += 1
        out.append(f"- {j.parent.name}: agents started {started}, results {results}, null/died {nulls}")
    return out


def extract(since_iso, out_dir):
    since = parse_ts(since_iso)
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    sessions, skipped = [], 0
    for p in sorted(PROJECTS.glob("*/*.jsonl")):
        if datetime.fromtimestamp(p.stat().st_mtime, timezone.utc) < since:
            continue
        d = digest_session(p)
        if not d:
            skipped += 1
            continue
        f = out / f"{p.stem}.md"
        f.write_text(d["text"], encoding="utf-8")
        sessions.append({"id": p.stem, "file": str(f), "chars": len(d["text"]), "project": d["cwd"]})
    batches, cur, size = [], [], 0
    for s in sorted(sessions, key=lambda s: s["chars"]):
        if cur and size + s["chars"] > BATCH_CHARS:
            batches.append(cur)
            cur, size = [], 0
        cur.append(s["file"])
        size += s["chars"]
    if cur:
        batches.append(cur)
    print(json.dumps({"since": since_iso, "sessions": len(sessions), "skippedEmpty": skipped,
                      "digestChars": sum(s["chars"] for s in sessions), "batches": batches}))


def cost(wf_dir):
    total, by_model = 0.0, {}
    for p in Path(wf_dir).glob("agent-*.jsonl"):
        for raw in p.open(encoding="utf-8", errors="replace"):
            try:
                rec = json.loads(raw)
            except json.JSONDecodeError:
                continue
            msg = rec.get("message") or {}
            if rec.get("type") != "assistant" or not msg.get("usage"):
                continue
            m = msg.get("model", "?")
            pi, po, pr, pw = PRICES.get(m, PRICES["claude-opus-5-5"])
            u = msg["usage"]
            c = (u.get("input_tokens", 0) * pi + u.get("output_tokens", 0) * po
                 + u.get("cache_read_input_tokens", 0) * pr + u.get("cache_creation_input_tokens", 0) * pw) / 1e6
            by_model[m] = by_model.get(m, 0) + c
            total += c
    print(json.dumps({"approxUsd": round(total, 2), "byModel": {k: round(v, 2) for k, v in by_model.items()}}))


if __name__ == "__main__":
    if len(sys.argv) == 4 and sys.argv[1] == "extract":
        extract(sys.argv[2], sys.argv[3])
    elif len(sys.argv) == 3 and sys.argv[1] == "cost":
        cost(sys.argv[2])
    else:
        sys.exit(__doc__)
