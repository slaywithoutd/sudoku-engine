# First-release implementation verification

_Historical record, kept as written on 2026-09-12. Branch and worktree names it mentions no longer exist; everything is on `master`._

Date: 2026-09-12. Scope: approved M1a + M1b only.

## Repository and delivery

- Planning baseline: `7c9512b`; worktree was clean when implementation began.
- Local branch: `release/first-release`, in the user's requested repository directory.
- Verified implementation commit: **`66b8381`**. The subsequent documentation commit completes the startup guide and handoff; it does not change executable code.
- No applicable `AGENTS.md` was found in the repository or its ancestor directories.
- Spring source, Maven files and wrappers are unchanged from the planning baseline. The active browser runtime is `web/`.
- Focused commits cover the tooling, reducer, lifecycle, backup validation, repository, controller, board, screens, backup UI, review fixes and release acceptance.
- Dependencies, build output, browser profiles and test artifacts remain ignored. No remote push, deployment or merge was performed.

## Executed release gates

Environment: Windows PowerShell, Node **24.19.0**, npm **11.17.0**. Exact package pins from the approved plan were installed; `package-lock.json` is committed. Playwright installed Chromium **153.0.8010.12**, revision **1243**.

| Command in `web/` | Actual outcome |
| --- | --- |
| `npm ci` | Exit 0; 45 packages installed; audit reported 0 vulnerabilities. |
| `npm run typecheck` | Exit 0. |
| `npm test` | Exit 0; **54 tests passed** in seven files. |
| `npm run build` | Exit 0; Vite 8.3.0 emitted HTML, CSS and JavaScript into `dist/`. |
| `npm run test:e2e` | Exit 0; **20 tests passed** in seven Chromium suites; final run 13.5 seconds. |
| `git diff --check` | Passed. |

Install was followed by separate typecheck, unit/storage tests, build and browser commands. After the last visual/accessibility corrections, typecheck, build, unit/storage tests and the complete browser suite were rerun successfully. Test execution emitted a harmless environment warning that `FORCE_COLOR` overrides `NO_COLOR`; no application/test failures remained.

## Acceptance coverage

| Approved check | Evidence executed |
| --- | --- |
| Manual/string creation, malformed import isolation | `classic.test.ts`, `library.test.ts`, `lifecycle.spec.ts`: exact syntax/whitespace validation; import creates a new draft; malformed input preserves existing work. |
| Conflicting drafts survive refresh and block Finish | `classic.test.ts`, `lifecycle.spec.ts`: all duplicate participants highlighted; refresh retains conflict and selection; Finish stays disabled. |
| Finish creates immutable playable puzzles | `library.test.ts`, `lifecycle.spec.ts`: archived history retained, selectable givens locked, empty drafts may finish, duplicate IDs rejected. |
| Arrow wrapping and keyboard/pointer agreement | `editor.test.ts`, `board.spec.ts`: four edges, Shift/symbol/numpad input, Shift-click, persistent tool, key repeat, numpad zero, form focus and listener cleanup. |
| Hidden notes and manual peer notes | `editor.test.ts`, `board.spec.ts`, `persistence.spec.ts`: value/erase layering, no peer cleanup and note restoration. |
| Separate durable undo/redo/reset | `editor.test.ts`, `library.test.ts`, `repository.test.ts`, `persistence.spec.ts`: no-op and redo boundaries, reset as one action, hidden notes, navigation excluded, refresh/reopen and actual browser restart. |
| Optional play conflicts, mandatory creation feedback | `lifecycle.spec.ts`, `completion.spec.ts`: default-off play feedback, setting persistence and creation behavior. |
| Edit-copy preserves original progress | `library.test.ts`, `lifecycle.spec.ts`: new draft identity, independent original clues/session, deletion reference cleanup. |
| Lossless validated backup restore | `backup.test.ts`, `repository.test.ts`, `backup.spec.ts`: actual JSON downloads/uploads, identical skips, conflicting records/sessions, graph remapping, history replay, hidden notes/redo, settings opt-in, malformed/newer rejection, preview cancellation/freshness and safe text rendering. |
| Visible failures and honest completion | `controller.test.ts`, `repository.test.ts`, `save-failure.spec.ts`, `completion.spec.ts`: abort/quota-like/open failures, dirty export/retry, competing saves, complete valid board, dismissal/retransition, full conflicting board without unsolicited error. |

Browser persistence checks use `http://127.0.0.1:5174`. The true restart test closes Chromium and relaunches the same temporary profile under Playwright's output directory, with `try/finally` closure. A separate context is verified to have a separate empty library. A two-page race demonstrates that the stale tab cannot overwrite the winner.

## Visual and interaction review

Inspected generated Home, creator-conflict, player and Settings screenshots at **1280×800** and **1920×1080**, plus the dedicated nine-note board screenshot. Checked clear 3×3 lines, equal rows, fixed-clue weight, selected/focused cells, conflict underlining, readable sorted corner notes and surrounding controls. The redundant creator heading was removed so both editor toolbars fit an 800-pixel-high desktop viewport. Browser assertions check horizontal overflow and the creator/player control bounds.

The board exposes nine accessible rows containing nine gridcells each, with Portuguese cell labels, locked-clue status, roving focus and visible selection. Text fields retain their normal keyboard handling and are not replaced during autosave notifications.

Reproducible artifacts are under `web/test-results/visual-desktop-visual-acceptance-1280x800/`, the corresponding `1920x1080` directory, and the board test's output directory. They are generated test results, not committed product data. Running another subset of Playwright tests can replace the previous artifact set.

## Review and fixes

Independent read-only reviews covered domain/backup correctness, the repository/controller/screens, and final restore/recovery/completion behavior. Three important findings were reproduced and fixed:

1. Inherited dictionary names such as `toString` could collide with session lookup. All Object.prototype property names are now reserved IDs; four regression cases cover lifecycle and import. Recorded in D045.
2. Concurrent Retry requests could leave the controller in `saving` after a successful commit. Retry now joins an in-flight recovery, with a concurrent-call regression.
3. Draft names previously saved only on blur. Input now updates live state immediately, and a focused-name refresh regression confirms durability.

Browser verification additionally caught numpad arrow-code precedence, numpad zero erasure, unequal automatic grid rows, corner-font line-box overflow and missing accessible row grouping. These were corrected and checked again. A TypeScript action-discriminant narrowing error and a test-fixture literal typing error were corrected during their owning tasks. Final independent review reported no remaining critical/important findings; its optional Portuguese wording correction was also applied.

Source and tests were formatted with Prettier 3.6.2 as an execution-time tool; it adds no application/runtime dependency and does not change the approved package pins.

## Limits and next work

- Desktop Chromium was tested. Other browsers and real assistive-technology combinations are not certified by these checks.
- Fake IndexedDB and explicit adapter failure injection exercise recovery paths, not real browser quota/eviction policy or power-loss guarantees.
- All histories are retained without silent trimming. The initial aggregate storage design and full history validation have not been benchmarked against very large libraries.
- Data belongs to the current browser/profile/origin. There is no server backup or synchronization; export JSON to retain independent recovery copies.
- No first-release implementation task remains. The next product checkpoint is **M2 classic solver design**; solver, variants, hints, construction assistance, community and AI were not included here.
