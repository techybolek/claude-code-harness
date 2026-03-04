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

1. Run `git diff HEAD` to understand what changes have been made
2. Run `git add -A` to stage all changes
3. Run `git commit -m "<generated_commit_message>"` to create the commit

## Report

Return ONLY the commit message that was used (no other text)
