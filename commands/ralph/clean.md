# Ralph Worktree & Branch Cleanup

Remove all git worktrees and branches matching the `ralph/` or `ralph-worktree-` pattern.

## Run

1. List all worktrees: `git worktree list --porcelain`
2. For each worktree whose path contains `ralph-worktree`:
   - Run `git worktree remove --force <path>` to remove it
3. List all local branches: `git branch`
4. For each branch starting with `ralph/`:
   - Run `git branch -D <branch>` to delete it
5. Run `git worktree prune` to clean up stale worktree metadata

## Report

Print a summary:
- Worktrees removed (paths)
- Branches deleted (names)
- Any errors encountered
