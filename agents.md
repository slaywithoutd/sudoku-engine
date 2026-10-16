# Commit and Pull Request Rules

## Commits

- Do not add `Co-Authored-By` trailers to commit messages.
- Do not add "Generated with Claude Code" lines to pull request descriptions.

# Git Workflow

`master` is the only long-lived branch. Everything else is short-lived and is deleted once it is merged.

## Before starting work

- Run `git status`, `git branch -vv` and `git worktree list`. If something is unexpected (uncommitted changes, an unknown branch, a worktree marked `prunable`), report it before changing anything.
- Check whether the current branch is behind: `git log --oneline HEAD..master`. Merge `master` in before starting new work.
- The repository was moved from `Desktop/Inteli - Projects/` to `Desktop/projects/`. A worktree marked `prunable` whose folder still exists is fixed with `git worktree repair <path>`, not deleted.

## Branches

- Branch from `master` with a prefix and a short name: `feat/`, `fix/`, `docs/`, `test/`, `chore/` (for example `feat/m26-hardening`). A milestone gets one branch with one reviewed commit per task.
- Do not keep auto-generated names such as `claude/<adjective>-<name>`. Rename the branch (`git branch -m`) before the first commit.
- Merge into `master` with `git merge --no-ff <branch> -m "Merge branch '<branch>': <summary>"`, and only when the user asks.
- After the merge, delete the branch (`git branch -d`) and remove its worktree (`git worktree remove`). `git branch -d` compares against the current branch, so check that a branch is merged with `git branch --merged master`.

## Worktrees and the main checkout

- Parallel sessions work in `.claude/worktrees/<name>`, one writer per set of files. Do not touch another session's worktree.
- `master` must not stay checked out in a temporary worktree. Use one only for a single commit, then remove it.
- Do not end a session with uncommitted changes in the main checkout. Commit them on their branch, even as work in progress.

## What never goes into the repository

- Probe outputs, logs, profiles and one-off diagnostic tests (for example `solver-audit-*`). Write them to the session scratchpad or to `../sudoku-engine-archive/`, never to `web/` or the repository root.
- A `package.json`, `package-lock.json` or `node_modules/` at the repository root. Every npm command runs in `web/`.
- Untracked copies of documents. A spec or plan draft is committed on a `docs/` branch. A loose copy blocks the merge as soon as `master` gains the same path.

## Documents and decisions

- Before adding a `D<n>` entry, read the last number in `docs/decisions.md` on `master`. A draft written on a branch may cite a number that is already taken by the time it merges.
- Line endings are LF (`.gitattributes`); `docs/` is not formatted by Prettier.

## Remote

- `origin` is `github.com/slaywithoutd/sudoku-engine`. Pushing needs an account with write access to it. Ask before every push, never force-push `master`, and do not delete remote branches without asking.
- Heavy checks (`npm test` about 17–25 min, `npm run typecheck`, `npm run lint`) run one at a time, in the background, never in parallel.
