"""Plan execution utility.

Usage:
    python scripts/run_plan.py SPEC/ACTIVE/<NNNN-name>/plan.md

Reads a plan's task list and runs each task in a fresh `claude -p`
subprocess, in dependency order. State and per-task logs persist under
`.exec/<plan-slug>/` so runs are resumable after a crash, kill, or failure.
See SPEC/FEATURE-REQUEST/plan-execution-utility-2026-05-10.md for the spec.
"""

from __future__ import annotations

import argparse
import datetime as _dt
import json
import os
import re
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path

PER_TASK_TIMEOUT_S = 30 * 60
LOG_TAIL_LINES = 30
SUCCESS_RE = re.compile(r"STATUS[:\s\*]*\bSUCCESS\b", re.IGNORECASE)


# ---------- exceptions ----------


class PlanParseError(Exception):
    pass


class StateError(Exception):
    pass


class LockError(Exception):
    pass


# ---------- data ----------


@dataclass
class Task:
    id: str
    num: int
    title: str
    body: str
    what: str = ""
    files: str = ""
    tests: str = ""
    done_when: str = ""
    depends_on: list[str] = field(default_factory=list)


@dataclass
class Plan:
    path: Path
    tasks: dict[str, Task]
    validation_commands: str | None


# ---------- parser ----------

_TASK_HEADING_RE = re.compile(r"^###\s+T(\d+):\s*(.+?)\s*$")
_H2_RE = re.compile(r"^##\s+(.+?)\s*$")
_H3_RE = re.compile(r"^###\s+")
_FIELD_RE = re.compile(r"^-\s+\*\*([A-Za-z ]+):\*\*\s*(.*)$")
_DEP_REF_RE = re.compile(r"T(\d+)")
_TITLE_TRAIL_RE = re.compile(r"\s*✅.*$")


def parse_plan(path: Path) -> Plan:
    if not path.exists():
        raise PlanParseError(f"Plan not found: {path}")
    text = path.read_text()
    lines = text.splitlines()

    tasks: dict[str, Task] = {}
    current: Task | None = None
    current_lines: list[str] = []
    in_validation = False
    validation_lines: list[str] = []

    def _close_task() -> None:
        nonlocal current, current_lines
        if current is not None:
            current.body = "\n".join(current_lines).rstrip()
            tasks[current.id] = current
            current = None
            current_lines = []

    for line in lines:
        task_m = _TASK_HEADING_RE.match(line)
        h2_m = _H2_RE.match(line)
        if task_m:
            _close_task()
            in_validation = False
            num = int(task_m.group(1))
            raw_title = task_m.group(2).strip()
            title = _TITLE_TRAIL_RE.sub("", raw_title).strip()
            current = Task(id=f"T{num}", num=num, title=title, body="")
            current_lines = [line]
            continue
        if h2_m:
            _close_task()
            section_name = h2_m.group(1).strip().lower()
            in_validation = section_name.startswith("validation")
            continue
        if _H3_RE.match(line) and current is not None:
            _close_task()
            continue
        if current is not None:
            current_lines.append(line)
            field_m = _FIELD_RE.match(line)
            if field_m:
                fname = field_m.group(1).strip().lower()
                fval = field_m.group(2).strip()
                if fname == "what":
                    current.what = fval
                elif fname == "files":
                    current.files = fval
                elif fname == "tests":
                    current.tests = fval
                elif fname == "done when":
                    current.done_when = fval
                elif fname == "depends on":
                    if fval.lower().rstrip(".").strip() in ("none", ""):
                        current.depends_on = []
                    else:
                        current.depends_on = [f"T{m}" for m in _DEP_REF_RE.findall(fval)]
        elif in_validation:
            validation_lines.append(line)

    _close_task()

    if not tasks:
        raise PlanParseError("No tasks found in plan")

    for tid, t in tasks.items():
        for dep in t.depends_on:
            if dep not in tasks:
                raise PlanParseError(f"Task {tid} has unknown dependency {dep}")

    validation_text = "\n".join(validation_lines).strip() if validation_lines else None
    return Plan(path=path, tasks=tasks, validation_commands=validation_text or None)


# ---------- topological sort ----------


def topological_sort(tasks: dict[str, Task]) -> list[str]:
    dependents: dict[str, list[str]] = {tid: [] for tid in tasks}
    for tid, t in tasks.items():
        for dep in t.depends_on:
            dependents[dep].append(tid)
    in_degree = {tid: len(t.depends_on) for tid, t in tasks.items()}

    def _by_num(tid: str) -> int:
        return tasks[tid].num

    queue = sorted([tid for tid, d in in_degree.items() if d == 0], key=_by_num)
    result: list[str] = []
    while queue:
        tid = queue.pop(0)
        result.append(tid)
        added = []
        for d_tid in dependents[tid]:
            in_degree[d_tid] -= 1
            if in_degree[d_tid] == 0:
                added.append(d_tid)
        queue.extend(added)
        queue.sort(key=_by_num)

    if len(result) != len(tasks):
        remaining = sorted(tid for tid in tasks if tid not in result)
        raise PlanParseError(f"Cycle detected involving tasks: {', '.join(remaining)}")
    return result


# ---------- state ----------


def _utcnow() -> str:
    return _dt.datetime.now(_dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _atomic_write_json(path: Path, data: dict) -> None:
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(data, indent=2))
    os.replace(tmp, path)


def _new_task_state(task: Task, run_dir: Path) -> dict:
    return {
        "title": task.title,
        "status": "pending",
        "depends_on": list(task.depends_on),
        "started_at": None,
        "completed_at": None,
        "log_path": str(run_dir / f"{task.id}.log"),
        "exit_code": None,
        "attempts": 0,
    }


def _new_state(plan: Plan, run_dir: Path) -> dict:
    now = _utcnow()
    return {
        "plan_path": str(plan.path),
        "run_dir": str(run_dir),
        "created_at": now,
        "updated_at": now,
        "tasks": {tid: _new_task_state(t, run_dir) for tid, t in plan.tasks.items()},
        "validation": {
            "status": "pending",
            "log_path": None,
            "exit_code": None,
            "attempts": 0,
        },
    }


def load_or_init_state(plan: Plan, run_dir: Path) -> dict:
    state_path = run_dir / "state.json"
    if not state_path.exists():
        return _new_state(plan, run_dir)
    try:
        state = json.loads(state_path.read_text())
    except json.JSONDecodeError as e:
        raise StateError(
            f"Corrupted state.json at {state_path}: {e}. "
            f"Delete the run dir to start over."
        ) from e

    state.setdefault("validation", {
        "status": "pending", "log_path": None, "exit_code": None, "attempts": 0,
    })
    state.setdefault("tasks", {})

    plan_ids = set(plan.tasks)
    state_ids = set(state["tasks"])
    removed = sorted(state_ids - plan_ids)
    added = sorted(plan_ids - state_ids)
    for tid in removed:
        del state["tasks"][tid]
    for tid in added:
        state["tasks"][tid] = _new_task_state(plan.tasks[tid], run_dir)
    if removed or added:
        print(f"plan changed: dropped {removed}, added {added}")

    for tid, ts in state["tasks"].items():
        plan_title = plan.tasks[tid].title
        if ts.get("status") == "completed" and ts.get("title") != plan_title:
            print(
                f"{tid} title changed since completion — body may have changed; "
                f"not re-running. Run `rm -rf {run_dir}` to start over."
            )
        ts["depends_on"] = list(plan.tasks[tid].depends_on)

    for ts in state["tasks"].values():
        if ts["status"] in ("in_progress", "blocked"):
            ts["status"] = "pending"

    return state


def deps_satisfied(task_id: str, plan: Plan, state: dict) -> bool:
    for dep in plan.tasks[task_id].depends_on:
        if state["tasks"][dep]["status"] != "completed":
            return False
    return True


def _transitive_dependents(plan: Plan, root: str) -> list[str]:
    result: list[str] = []
    seen = {root}
    queue = [root]
    while queue:
        cur = queue.pop(0)
        for tid, t in plan.tasks.items():
            if cur in t.depends_on and tid not in seen:
                seen.add(tid)
                queue.append(tid)
                result.append(tid)
    return result


# ---------- lock ----------


def _acquire_lock(run_dir: Path) -> Path:
    lock = run_dir / "run.lock"
    if lock.exists():
        try:
            pid = int(lock.read_text().strip() or "0")
        except ValueError:
            pid = 0
        if pid > 0:
            try:
                os.kill(pid, 0)
                raise LockError(f"Another run is active (PID {pid}). Refusing to start.")
            except ProcessLookupError:
                pass
            except PermissionError:
                raise LockError(f"Another run is active (PID {pid}). Refusing to start.")
    lock.write_text(str(os.getpid()))
    return lock


def _release_lock(lock: Path) -> None:
    try:
        lock.unlink()
    except FileNotFoundError:
        pass


# ---------- subprocess execution ----------


def _build_task_prompt(task: Task, plan_path: Path) -> str:
    return (
        f"Implement this task from the plan at {plan_path}:\n\n"
        f"## Task\n"
        f"{task.body}\n\n"
        f"## Context\n"
        f"- Read the full plan file for overall context.\n"
        f"- Read CLAUDE.md to discover the test runner and project conventions.\n"
        f"- Implement the task: write code, write tests, run tests.\n"
        f"- Tests MUST pass. If they fail, fix the code (not the tests).\n\n"
        f"## Report\n"
        f"When done, report EXACTLY:\n\n"
        f"### Result\n"
        f"**STATUS:** SUCCESS or FAILURE\n"
        f"**Summary:** {{1-2 sentences}}\n"
        f"**Files Changed:** {{list}}\n"
        f"**Test Output:** {{pass/fail counts and command}}\n"
        f"**Issues:** {{problems encountered, or \"None\"}}\n"
    )


def _build_validation_prompt(plan_path: Path, validation_text: str) -> str:
    return (
        f"Execute the Validation Commands from the plan at {plan_path}. "
        f"Run every command in order; report SUCCESS only if every command exits zero. "
        f"The Validation Commands section is reproduced verbatim below:\n\n"
        f"{validation_text}\n\n"
        f"## Report\n"
        f"When done, report EXACTLY:\n\n"
        f"### Result\n"
        f"**STATUS:** SUCCESS or FAILURE\n"
        f"**Summary:** {{1-2 sentences}}\n"
        f"**Output:** {{pass/fail summary per command}}\n"
        f"**Issues:** {{problems encountered, or \"None\"}}\n"
    )


def _run_claude(prompt: str, log_path: Path, timeout_s: int) -> tuple[int, bool]:
    cmd = ["claude", "-p", prompt, "--dangerously-skip-permissions"]
    with log_path.open("wb") as logf:
        proc = subprocess.Popen(cmd, stdout=logf, stderr=subprocess.STDOUT)
        try:
            exit_code = proc.wait(timeout=timeout_s)
        except subprocess.TimeoutExpired:
            proc.terminate()
            try:
                proc.wait(timeout=10)
            except subprocess.TimeoutExpired:
                proc.kill()
                proc.wait()
            with log_path.open("ab") as f:
                f.write(f"\n\nTIMEOUT after {timeout_s}s\n".encode())
            exit_code = 124
        except KeyboardInterrupt:
            proc.terminate()
            try:
                proc.wait(timeout=10)
            except subprocess.TimeoutExpired:
                proc.kill()
                proc.wait()
            raise
    text = log_path.read_text(errors="replace")
    return exit_code, bool(SUCCESS_RE.search(text))


def _print_log_tail(log_path: Path, n: int = LOG_TAIL_LINES) -> None:
    if not log_path.exists():
        return
    text = log_path.read_text(errors="replace")
    tail = "\n".join(text.splitlines()[-n:])
    print(f"\n--- tail of {log_path} ---")
    print(tail)
    print(f"--- end of {log_path} ---\n")


# ---------- main loop ----------


def _run_task(plan: Plan, tid: str, state: dict, state_path: Path, run_dir: Path) -> bool:
    """Run one task. Returns True on success, False on failure."""
    task = plan.tasks[tid]
    ts = state["tasks"][tid]
    prev = ts["status"]
    ts["status"] = "in_progress"
    ts["started_at"] = _utcnow()
    ts["attempts"] = int(ts.get("attempts", 0)) + 1
    state["updated_at"] = _utcnow()
    _atomic_write_json(state_path, state)
    print(f"{tid}: {prev} → in_progress")

    log_path = run_dir / f"{tid}.log"
    prompt = _build_task_prompt(task, plan.path)
    exit_code, marker = _run_claude(prompt, log_path, PER_TASK_TIMEOUT_S)
    ts["exit_code"] = exit_code
    ts["completed_at"] = _utcnow()
    if exit_code == 0 and marker:
        ts["status"] = "completed"
        ts["error_summary"] = None
        state["updated_at"] = _utcnow()
        _atomic_write_json(state_path, state)
        print(f"{tid}: in_progress → completed")
        return True
    detail = f"exit {exit_code}" + ("" if marker else " (no STATUS: SUCCESS marker)")
    ts["status"] = "errored"
    ts["error_summary"] = f"Subprocess {detail} — see log tail"
    state["updated_at"] = _utcnow()
    _atomic_write_json(state_path, state)
    print(f"{tid}: in_progress → errored ({detail})")
    return False


def _run_validation(plan: Plan, state: dict, state_path: Path, run_dir: Path) -> bool:
    v = state["validation"]
    log_path = run_dir / "Tvalidation.log"
    v["status"] = "in_progress"
    v["log_path"] = str(log_path)
    v["attempts"] = int(v.get("attempts", 0)) + 1
    state["updated_at"] = _utcnow()
    _atomic_write_json(state_path, state)
    print("Tvalidation: pending → in_progress")

    prompt = _build_validation_prompt(plan.path, plan.validation_commands or "")
    exit_code, marker = _run_claude(prompt, log_path, PER_TASK_TIMEOUT_S)
    v["exit_code"] = exit_code
    if exit_code == 0 and marker:
        v["status"] = "completed"
        state["updated_at"] = _utcnow()
        _atomic_write_json(state_path, state)
        print("Tvalidation: in_progress → completed")
        return True
    v["status"] = "errored"
    state["updated_at"] = _utcnow()
    _atomic_write_json(state_path, state)
    print(f"Tvalidation: in_progress → errored (exit {exit_code})")
    return False


def _print_summary(state: dict, order: list[str]) -> None:
    print("\nTask summary:")
    for tid in order:
        ts = state["tasks"][tid]
        print(f"  {tid:8s} {ts['status']:11s} attempts={ts['attempts']:<3d} {ts['title']}")
    v = state.get("validation", {})
    if v.get("attempts"):
        print(f"  {'Tvalidation':8s} {v['status']:11s} attempts={v['attempts']}")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Execute a plan file's task list.")
    parser.add_argument("plan_path", help="Path to the plan markdown file.")
    args = parser.parse_args(argv)

    plan_path = Path(args.plan_path)
    if not plan_path.exists():
        print(f"Plan not found: {plan_path}", file=sys.stderr)
        return 2

    try:
        plan = parse_plan(plan_path)
        order = topological_sort(plan.tasks)
    except PlanParseError as e:
        print(f"ERROR: {e}", file=sys.stderr)
        return 2

    plan_slug = plan_path.stem
    run_dir = Path(".exec") / plan_slug
    run_dir.mkdir(parents=True, exist_ok=True)

    try:
        lock = _acquire_lock(run_dir)
    except LockError as e:
        print(f"ERROR: {e}", file=sys.stderr)
        return 3

    try:
        try:
            state = load_or_init_state(plan, run_dir)
        except StateError as e:
            print(f"ERROR: {e}", file=sys.stderr)
            return 2

        state_path = run_dir / "state.json"
        state["updated_at"] = _utcnow()
        _atomic_write_json(state_path, state)

        for tid in order:
            ts = state["tasks"][tid]
            if ts["status"] == "completed":
                continue
            if not deps_satisfied(tid, plan, state):
                if ts["status"] != "blocked":
                    ts["status"] = "blocked"
                    state["updated_at"] = _utcnow()
                    _atomic_write_json(state_path, state)
                    print(f"{tid}: → blocked (deps not satisfied)")
                continue
            ok = _run_task(plan, tid, state, state_path, run_dir)
            if not ok:
                for d_tid in _transitive_dependents(plan, tid):
                    d_ts = state["tasks"][d_tid]
                    if d_ts["status"] not in ("completed", "errored"):
                        d_ts["status"] = "blocked"
                state["updated_at"] = _utcnow()
                _atomic_write_json(state_path, state)
                _print_log_tail(run_dir / f"{tid}.log")
                return 1

        if plan.validation_commands:
            if state["validation"]["status"] != "completed":
                ok = _run_validation(plan, state, state_path, run_dir)
                if not ok:
                    _print_log_tail(run_dir / "Tvalidation.log")
                    return 1

        print("\nALL TASKS COMPLETE")
        _print_summary(state, order)
        return 0
    finally:
        _release_lock(lock)


if __name__ == "__main__":
    raise SystemExit(main())
