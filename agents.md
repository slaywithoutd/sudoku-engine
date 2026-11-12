# Commit and Pull Request Rules

## Commits

- Do not add `Co-Authored-By` trailers to commit messages.
- Do not add "Generated with Claude Code" lines to pull request descriptions.

# Autonomous Work

The user hands over work with an approved spec or plan and expects it back finished and verified, not in pieces. Work alone until the acceptance criteria pass, and come back only with a result.

## The loop for each task

1. Read the task's deliverable and acceptance in the spec or plan. The acceptance is the definition of done. "Looks right" is not done. A measured result is, for example "engine and reference agree on all 131 cases".
2. Implement, then run the task's own acceptance checks.
3. If a check fails, find the cause and fix it, then run the checks again. Keep iterating, trying another approach when one does not work. Do not report a failure you have not investigated.
4. Have a subagent that has not seen your reasoning review the diff independently. Fix its findings, commit them as `fix(<area>): <task> review`, and re-run the checks.
5. Commit the task (one commit per task) and move straight to the next one. Do not stop for approval between tasks.

## When to come back before the end

Come back only when you cannot continue without the user:

- A decision outside the approved scope: changing a spec decision, an acceptance target or a `D<n>` entry, or adding a new dependency or technique.
- An acceptance target you cannot reach after real attempts. Bring the measurements, the approaches you tried, two or three options and your recommendation. Never lower a target silently, and never mark a task done while it misses its acceptance.
- An action that needs permission: a push, deleting a remote branch, a force operation, or touching files another session owns.

Everything else is yours to decide. Record each choice in the commit message or in the progress record.

## The final report

When the whole milestone (or the batch you were given) is done, deliver one report:

- What was built, task by task, with commit hashes.
- The evidence: each acceptance check with its command and result, and the whole-suite gate (`npm test`, `npm run typecheck`, `npm run lint`, run one at a time).
- Deviations from the spec and why, open risks, and what was not verified, such as measurements taken on battery.
- A merge recommendation, yes or no, with the reason. Merge into `master` only after the user says yes. Push only after the user asks.

Do not narrate progress along the way. Keep the progress record in `docs/history/` current, so the user can look whenever they want.

## Measurements

Before a timing or benchmark run, check whether the laptop is on battery (`Win32_Battery.BatteryStatus`; 2 means mains). Record the power state next to every timing. A target judged on battery must be confirmed on mains before the final report, or reported as unconfirmed.

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
