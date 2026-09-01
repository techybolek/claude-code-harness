#!/usr/bin/env python3
"""
Safety Validator Hook for Claude Code
======================================

Purpose:
    Pre-tool-use validation for Bash. Blocks a small set of commands that are
    catastrophic and never intentional, and nothing else.

Design:
    Commands are tokenized and checked argument by argument. Nothing is matched
    as a substring of the raw command line, so a path that merely *contains* a
    dangerous string (rm -rf /home/me/node_modules, grep mkfs. docs/disk.md)
    is not blocked.

Blocked:
    - Recursive rm whose target is the filesystem root, a top-level system
      directory, the home directory, or a bare glob (/, /*, *, ~, $HOME, /etc, ...)
    - dd / redirection writing to a block device (/dev/sda, /dev/nvme0n1, ...)
    - mkfs invoked on a block device
    - The classic fork bomb

Not in scope:
    Secret-file access is deliberately not gated here. The previous marker-based
    check fired only on cat/head/Read/Write while sed, grep, awk, python, curl
    and shell redirection walked straight past it, so it produced false
    positives and lost turns without providing protection. Claude Code's own
    permission prompts remain in force.

Exit Codes:
    0 - permitted
    2 - blocked (message on stderr is shown to the model)

Integration:
    PreToolUse hook, matcher "Bash", in ~/.claude/settings.json
"""

import json
import os
import re
import shlex
import sys

# Targets that mean "the whole filesystem", "everything here", or "my home".
CATASTROPHIC_TARGETS = {
    "/",
    "*",
    "~",
    "$HOME",
    "${HOME}",
}

# Top-level directories that should never be removed recursively as a whole.
SYSTEM_DIRS = {
    "/bin", "/boot", "/dev", "/etc", "/home", "/lib", "/lib32", "/lib64",
    "/opt", "/proc", "/root", "/run", "/sbin", "/srv", "/sys", "/usr", "/var",
}

# Character devices that are safe sinks, unlike block devices.
SAFE_DEVICES = {"/dev/null", "/dev/zero", "/dev/stdout", "/dev/stderr", "/dev/tty"}

BLOCK_DEVICE = re.compile(
    r"^/dev/(sd[a-z]+\d*|nvme\d+n\d+(p\d+)?|hd[a-z]+\d*|vd[a-z]+\d*|xvd[a-z]+\d*"
    r"|mmcblk\d+(p\d+)?|disk\d+.*|loop\d+)$"
)

# Shell tokens that end one command and start another.
SEGMENT_SEPARATORS = {"|", "||", "&&", ";", "&", "|&", "(", ")", "{", "}"}

# Wrappers to look through when identifying the command being run.
WRAPPERS = {"sudo", "doas", "env", "time", "nohup", "command", "exec", "stdbuf"}


def block(reason):
    print(f"BLOCKED: {reason}", file=sys.stderr)
    sys.exit(2)


def normalize_target(token):
    """Strip trailing slashes and a trailing glob so /etc/ and /etc/* compare as /etc."""
    token = re.sub(r"/\*+$", "", token)
    token = token.rstrip("/")
    return token or "/"


def is_catastrophic_target(token):
    if token in CATASTROPHIC_TARGETS:
        return True
    normalized = normalize_target(token)
    if normalized in CATASTROPHIC_TARGETS or normalized in SYSTEM_DIRS:
        return True
    # ./* and $HOME/* style bare wipes
    return normalized in {".", "$HOME", "${HOME}", "~"}


def split_segments(tokens):
    segments, current = [], []
    for token in tokens:
        if token in SEGMENT_SEPARATORS:
            if current:
                segments.append(current)
            current = []
        else:
            current.append(token)
    if current:
        segments.append(current)
    return segments


def strip_wrappers(segment):
    """Drop leading env assignments and wrapper commands (sudo, env, time, ...)."""
    i = 0
    while i < len(segment):
        token = segment[i]
        if re.match(r"^[A-Za-z_][A-Za-z0-9_]*=", token):
            i += 1
        elif os.path.basename(token) in WRAPPERS:
            i += 1
        elif token.startswith("-"):
            i += 1  # a flag belonging to the wrapper we just skipped
        else:
            break
    return segment[i:]


def check_rm(args):
    """Block recursive rm whose target is root, a system dir, home, or a bare glob."""
    recursive = False
    targets = []
    end_of_flags = False
    for token in args:
        if token == "--":
            end_of_flags = True
        elif not end_of_flags and token.startswith("--"):
            if token in ("--recursive", "--dir"):
                recursive = True
        elif not end_of_flags and token.startswith("-") and len(token) > 1:
            if "r" in token.lower():
                recursive = True
        else:
            targets.append(token)

    if not recursive:
        return
    for target in targets:
        if is_catastrophic_target(target):
            block(f"recursive delete of {target}")


def check_dd(args):
    for token in args:
        if token.startswith("of="):
            target = token[3:]
            if target not in SAFE_DEVICES and BLOCK_DEVICE.match(target):
                block(f"dd writing to block device {target}")


def check_mkfs(args):
    for token in args:
        if BLOCK_DEVICE.match(token):
            block(f"format filesystem on {token}")


def check_redirections(tokens):
    """Block `> /dev/sda` and friends."""
    for i, token in enumerate(tokens):
        target = None
        if token in (">", ">>"):
            target = tokens[i + 1] if i + 1 < len(tokens) else None
        elif token.startswith(">") and len(token) > 1:
            target = token.lstrip(">")
        if target and target not in SAFE_DEVICES and BLOCK_DEVICE.match(target):
            block(f"overwrite block device {target}")


def main():
    try:
        data = json.load(sys.stdin)
    except (ValueError, OSError):
        sys.exit(0)  # fail open: a broken payload should not stall the session

    if data.get("tool_name") != "Bash":
        sys.exit(0)

    command = data.get("tool_input", {}).get("command", "")

    if re.sub(r"\s+", "", command).find(":(){:|:&};:") != -1:
        block("fork bomb")

    try:
        tokens = shlex.split(command)
    except ValueError:
        tokens = command.split()

    check_redirections(tokens)

    for segment in split_segments(tokens):
        args = strip_wrappers(segment)
        if not args:
            continue
        name = os.path.basename(args[0])
        rest = args[1:]
        if name == "rm":
            check_rm(rest)
        elif name == "dd":
            check_dd(rest)
        elif name == "mkfs" or name.startswith("mkfs."):
            check_mkfs(rest)

    sys.exit(0)


if __name__ == "__main__":
    main()
