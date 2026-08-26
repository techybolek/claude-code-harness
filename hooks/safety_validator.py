#!/usr/bin/env python3
"""
Safety Validator Hook for Claude Code
======================================

Purpose:
    Pre-tool-use validation layer that blocks potentially destructive operations
    before they execute. Acts as a safety gate for Bash, Read, Write, and Edit tools.

Protected Against:
    - Recursive deletion of root filesystem (rm -rf /)
    - Recursive deletion of all files (rm -rf *)
    - Recursive deletion of home directory (rm -rf ~)
    - Disk wiping operations (dd if=/dev/zero)
    - Access to environment files (.env, .env.production, etc.)
    - Access to secret files (.secret, .secret.local, etc.)
    - Access to SSH private keys (id_rsa, id_ed25519, id_ecdsa)
    - Access to credential files (.pem, credentials)
    - Bash access to sensitive files (cat/head/tail/cp/less/more/bat on .env,
      .secret, keys) - checked per argument, so a mixed command is blocked

Exceptions:
    - Files ending with .example are allowed (safe template files)
    - e.g., .env.example, .secret.example can be read for structure reference
    - .env.local is allowed (local dev overrides Claude is expected to edit)

Exit Codes:
    0 - Tool use permitted (validation passed)
    2 - Tool use blocked (dangerous operation detected)

Integration:
    Configured as PreToolUse hook in .claude/settings.json
    Receives tool call JSON via stdin from Claude Code
"""

import json
import os
import re
import shlex
import sys

# Path markers that identify a sensitive file
SENSITIVE_MARKERS = [
    r"\.env\b",
    r"\.secret",
    r"id_rsa",
    r"id_ed25519",
    r"id_ecdsa",
    r"\.pem\b",
    r"credentials",
]

# Suffixes that override the markers above
ALLOWED_SUFFIXES = (".example", ".env.local")

# Commands that read/copy file contents
READER_COMMANDS = {"cat", "head", "tail", "cp", "less", "more", "bat"}

# Shell tokens that end one command and start another
SEGMENT_SEPARATORS = {"|", "||", "&&", ";", "&", "|&"}


def is_sensitive_path(token):
    """True if token looks like a sensitive file path and is not explicitly allowed."""
    if token.endswith(ALLOWED_SUFFIXES):
        return False
    return any(re.search(m, token, re.IGNORECASE) for m in SENSITIVE_MARKERS)

data = json.load(sys.stdin)
tool_name = data.get("tool_name", "")
tool_input = data.get("tool_input", {})

# Block dangerous bash commands
if tool_name == "Bash":
    command = tool_input.get("command", "")

    dangerous_patterns = [
        # rm -rf variations: handles -rf, -r -f, --recursive --force, etc.
        r"rm\s+(-[a-zA-Z]*r[a-zA-Z]*\s+-[a-zA-Z]*f[a-zA-Z]*|-[a-zA-Z]*f[a-zA-Z]*\s+-[a-zA-Z]*r[a-zA-Z]*|-[a-zA-Z]*rf[a-zA-Z]*|-[a-zA-Z]*fr[a-zA-Z]*|--recursive\s+--force|--force\s+--recursive)\s+/\s*$",
        # rm -rf /* or rm -rf *
        r"rm\s+(-[a-zA-Z]*r[a-zA-Z]*\s+-[a-zA-Z]*f[a-zA-Z]*|-[a-zA-Z]*f[a-zA-Z]*\s+-[a-zA-Z]*r[a-zA-Z]*|-[a-zA-Z]*rf[a-zA-Z]*|-[a-zA-Z]*fr[a-zA-Z]*|--recursive\s+--force|--force\s+--recursive)\s+(/\*)?\*",
        # rm -rf ~ (home directory)
        r"rm\s+(-[a-zA-Z]*r[a-zA-Z]*\s+-[a-zA-Z]*f[a-zA-Z]*|-[a-zA-Z]*f[a-zA-Z]*\s+-[a-zA-Z]*r[a-zA-Z]*|-[a-zA-Z]*rf[a-zA-Z]*|-[a-zA-Z]*fr[a-zA-Z]*|--recursive\s+--force|--force\s+--recursive)\s+~",
        # rm -rf $HOME
        r"rm\s+(-[a-zA-Z]*r[a-zA-Z]*\s+-[a-zA-Z]*f[a-zA-Z]*|-[a-zA-Z]*f[a-zA-Z]*\s+-[a-zA-Z]*r[a-zA-Z]*|-[a-zA-Z]*rf[a-zA-Z]*|-[a-zA-Z]*fr[a-zA-Z]*|--recursive\s+--force|--force\s+--recursive)\s+\$HOME",
        # dd disk operations
        r"dd\s+.*if=/dev/(zero|random|urandom).*of=/dev/",
        r"dd\s+.*of=/dev/[a-z]+\s",
    ]

    for pattern in dangerous_patterns:
        if re.search(pattern, command, re.IGNORECASE):
            print("BLOCKED: Dangerous command pattern detected", file=sys.stderr)
            sys.exit(2)

    # Additional simple checks for common dangerous patterns
    dangerous_simple = [
        ("rm -rf /", "recursive delete root"),
        ("rm -rf /*", "recursive delete root contents"),
        ("rm -rf ~", "recursive delete home"),
        ("rm -rf $HOME", "recursive delete home"),
        ("> /dev/sda", "overwrite disk"),
        ("mkfs.", "format filesystem"),
        (":(){ :|:& };:", "fork bomb"),
    ]

    for pattern, description in dangerous_simple:
        if pattern in command:
            print(f"BLOCKED: {description}", file=sys.stderr)
            sys.exit(2)

    # Block Bash access to sensitive files, argument by argument, so that an
    # allowed path (.env.local) cannot smuggle a blocked one alongside it.
    try:
        tokens = shlex.split(command)
    except ValueError:
        tokens = command.split()

    segments, current = [], []
    for token in tokens:
        if token in SEGMENT_SEPARATORS:
            segments.append(current)
            current = []
        else:
            current.append(token)
    segments.append(current)

    for segment in segments:
        if not any(os.path.basename(t) in READER_COMMANDS for t in segment):
            continue
        for token in segment:
            if is_sensitive_path(token):
                print(
                    f"BLOCKED: Cannot access sensitive file via Bash: {token}",
                    file=sys.stderr,
                )
                sys.exit(2)

# Block access to sensitive files
if tool_name in ["Read", "Write", "Edit"]:
    file_path = tool_input.get("file_path", "")

    # .example templates and .env.local are safe to touch
    if is_sensitive_path(file_path):
        print(f"BLOCKED: Cannot modify sensitive file: {file_path}", file=sys.stderr)
        sys.exit(2)

sys.exit(0)
