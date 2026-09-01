#!/usr/bin/env python3
"""Behaviour check for the safety validator hook. exit 0 = all expectations met."""
import json, subprocess, sys

HOOK = "/home/tromanow/.claude/hooks/safety_validator.py"

# (expected_blocked, tool, arg)
CASES = [
    # --- must be BLOCKED -------------------------------------------------
    (True,  "Bash", "rm -rf /"),
    (True,  "Bash", "rm -rf /*"),
    (True,  "Bash", "rm -fr /*"),
    (True,  "Bash", "rm -rf / --no-preserve-root"),
    (True,  "Bash", "rm -rf *"),
    (True,  "Bash", "rm -rf ~"),
    (True,  "Bash", "rm -rf $HOME"),
    (True,  "Bash", "rm -rf ${HOME}/"),
    (True,  "Bash", "rm -r /etc"),
    (True,  "Bash", "rm -rf /usr/*"),
    (True,  "Bash", "sudo rm -rf /"),
    (True,  "Bash", "rm --recursive --force /"),
    (True,  "Bash", 'rm -rf "/"'),
    (True,  "Bash", "npm test && rm -rf /"),
    (True,  "Bash", "dd if=/dev/zero of=/dev/sda bs=1M"),
    (True,  "Bash", "dd if=backup.img of=/dev/nvme0n1"),
    (True,  "Bash", "mkfs.ext4 /dev/sdb1"),
    (True,  "Bash", "echo x > /dev/sda"),
    (True,  "Bash", ":(){ :|:& };:"),

    # --- must be ALLOWED (regressions from the old hook) ------------------
    (False, "Bash", "rm -rf /home/tromanow/proj/node_modules"),
    (False, "Bash", "rm -rf ~/proj/dist"),
    (False, "Bash", "rm -rf $HOME/tmp/build"),
    (False, "Bash", "rm -rf ./build ./dist"),
    (False, "Bash", "rm -rf /var/tmp/scratch"),
    (False, "Bash", "rm -f package-lock.json"),
    (False, "Bash", "grep -n mkfs. docs/disk.md"),
    (False, "Bash", "cat src/auth/credentials.ts"),
    (False, "Bash", "head -20 docs/credentials.md"),
    (False, "Bash", "cat README.md  # mentions .env setup"),
    (False, "Bash", "cp .env.example .env.local"),
    (False, "Bash", "dd if=/dev/urandom of=seed.bin bs=1k count=1"),
    (False, "Bash", "echo done > /dev/null"),
    (False, "Bash", "git log --oneline | head -5"),
    (False, "Bash", 'echo "unbalanced quote'),

    # --- non-Bash tools are no longer this hook's business ----------------
    (False, "Read",  "/home/tromanow/proj/.env"),
    (False, "Write", "/home/tromanow/proj/src/credentials.ts"),
]

failures = 0
for expected, tool, arg in CASES:
    payload = {"tool_name": tool,
               "tool_input": {"command": arg} if tool == "Bash" else {"file_path": arg}}
    p = subprocess.run([sys.executable, HOOK], input=json.dumps(payload),
                       capture_output=True, text=True)
    blocked = p.returncode == 2
    ok = blocked == expected
    failures += not ok
    print(f"{'ok  ' if ok else 'FAIL'} {'BLOCK' if blocked else 'allow':5} {tool:5} {arg}"
          f"{'   ' + p.stderr.strip() if blocked else ''}")

print(f"\n{len(CASES) - failures}/{len(CASES)} as expected")
sys.exit(1 if failures else 0)
