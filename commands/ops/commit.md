# Generate Git Commit

Based on the `Instructions` below, take the `Variables` follow the `Run` section to create a git commit with a properly formatted message. Then follow the `Report` section to report the results of your work.

## Instructions

- Generate a concise commit message in the format: `<issue_class>: <commit message>`
- The `<commit message>` should be:
  - Present tense (e.g., "add", "fix", "update", not "added", "fixed", "updated")
  - 50 characters or less
  - Descriptive of the actual changes made
  - No period at the end
- Examples:
  - `feat: add user authentication module`
  - `fix: login validation error`
  - `chore: update dependencies to latest versions`
- Extract context from the changes to make the commit message relevant

## Run

1. Run `git status` and `git diff HEAD` to understand all changes (both tracked modifications and untracked files)
2. Stage all changes: run `git add -A` to stage everything. If `git add -A` fails (e.g. due to special files), fall back to staging explicitly: `git add <specific files and directories>`
3. Before committing, run `git status` to verify that ALL changed and untracked files are staged. If any are missing, stage them individually.
4. Run `git commit -m "<generated_commit_message>"` to create the commit

## Report

Return ONLY the commit message that was used (no other text)
