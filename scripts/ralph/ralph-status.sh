#!/bin/bash
# Usage: ralph-status.sh [project-root]
PROJECT_ROOT="${1:-$(pwd)}"

python3 - "$PROJECT_ROOT" << 'PYEOF'
import json, os, glob, sys

base = sys.argv[1]
# Find active task
task_dir = sorted(os.listdir(f'{base}/SPEC/ACTIVE/'))[0] if os.path.exists(f'{base}/SPEC/ACTIVE/') else None
if not task_dir:
    print("No active task in SPEC/ACTIVE/")
    sys.exit(1)

# Logs live inside the worktree: worktrees/<task>/.runs/<task>/
logs = sorted(glob.glob(f'{base}/worktrees/{task_dir}/.runs/{task_dir}/ralph_claude_iter*.log'))
if not logs:
    print("No Ralph logs found — is ralph.sh running?")
    sys.exit(1)
latest = logs[-1]
iter_num = os.path.basename(latest).replace('ralph_claude_iter','').replace('.log','')

last_text = ''
with open(latest) as f:
    for line in f:
        try:
            obj = json.loads(line)
            if obj.get('type') == 'assistant':
                for c in obj['message'].get('content', []):
                    if c.get('type') == 'text' and c['text'].strip():
                        last_text = c['text'].strip()
        except: pass

tasks_file = f'{base}/worktrees/{task_dir}/SPEC/ACTIVE/{task_dir}/tasks.md'
done, todo = [], []
section = ''
with open(tasks_file) as f:
    for line in f:
        if line.startswith('## ') or line.startswith('### '):
            section = line.strip('# \n')
        if '- [x]' in line: done.append(line.strip())
        elif '- [ ]' in line: todo.append((section, line.strip()))

progress_file = f'{base}/worktrees/{task_dir}/.runs/{task_dir}/ralph_progress.txt'
last_progress = {}
if os.path.exists(progress_file):
    with open(progress_file) as f:
        for line in f:
            try: last_progress = json.loads(line)
            except: pass

print(f"\033[1m=== Ralph — {task_dir} | Iteration {iter_num} ===\033[0m")
print(f"  Tasks done: {len(done)}  |  Remaining: {len(todo)}")
if last_progress.get('tests_passed'):
    print(f"  Tests: {last_progress['tests_passed']} passing")
print()
print(f"\033[33mCurrently:\033[0m {last_text[:400]}")
print()
print(f"\033[36mUp next:\033[0m")
last_sec = ''
for sec, t in todo[:6]:
    if sec != last_sec:
        print(f"  \033[90m[{sec}]\033[0m")
        last_sec = sec
    print(f"  {t}")
PYEOF
