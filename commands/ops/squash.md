# Squash Git History

Squash all commits on the current branch into a single, clean conventional commit.

## Run

1. **Check preconditions**
   - Verify this is a git repo
   - Check for uncommitted changes: `git status --porcelain` — if any exist (modified or staged files, not untracked), stop and tell the user to stash or commit them first

2. **Find commits to squash**
   ```bash
   git log --oneline
   ```
   - If 0 or 1 commit: tell the user there's nothing to squash and stop
   - Count total commits on the branch: `git rev-list --count HEAD`

3. **Show the user what will be squashed** and ask for confirmation before proceeding

4. **Draft a commit message** by reading the commits and diff:
   ```bash
   git log --reverse
   git diff HEAD~<N> HEAD --stat   # where N = total commit count - 1, or use root
   ```
   Write a single conventional commit message capturing the full intent:
   ```
   <type>(<scope>): <short summary>

   [optional body]
   ```
   Types: `feat`, `fix`, `refactor`, `chore`, `docs`, `test`, `style`, `perf`

5. **Show the draft message** to the user and ask for confirmation or edits. Wait for approval.

6. **Execute the squash** using `git commit-tree` (works for all branches, including orphans):
   ```bash
   TREE=$(git cat-file -p HEAD | grep tree | awk '{print $2}')
   NEW=$(git commit-tree $TREE -m "<confirmed message>")
   git reset --hard $NEW
   ```

7. **Confirm success**: show `git log --oneline` and report the final commit message used
