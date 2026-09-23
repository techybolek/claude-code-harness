# Generate Git Commit

Create one git commit for the current change, with a Conventional Commits message.

## Message

```
<type>(<scope>): <description>

[optional body]
```

- `type`: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`, `build`, `ci`, `style`.
- `scope`: optional — the area touched (module, package, command), e.g. `feat(auth): …`. Omit it when the change spans no single area.
- `description`: imperative present tense ("add", not "added"), lowercase, no trailing period, ≤ 72 chars for the whole first line.
- Body: only when the *why* isn't obvious from the description — 1–3 short lines, wrapped at 72. No file lists, no restating the diff.
- Breaking change: `!` after the type/scope and a `BREAKING CHANGE:` footer.
- Follow the repo's own convention if `git log --oneline -10` shows a different one.

## Run

1. `git status`, `git diff HEAD`, and `git log --oneline -10`.
2. Stage:
   - Something already staged → commit exactly that; don't add more.
   - Nothing staged → stage the files that belong to this change by name (`git add <paths>`), never `git add -A`. Leave out unrelated edits, secrets/credentials (`.env`, keys), local config, and build/generated output.
   - If the changes are clearly several unrelated changes, stage only the main one and name the rest in the report.
3. `git diff --cached --stat` to confirm what's staged.
4. Commit (use a heredoc for a multi-line message):
   ```bash
   git commit -F - <<'EOF'
   <message>
   EOF
   ```
   If a pre-commit hook fails: fix it and recommit when the cause is in the staged change, otherwise stop and report it. Never `--no-verify`.

## Report

The commit message used. If any changed files were left unstaged, one more line: `Not committed: <files>`.
