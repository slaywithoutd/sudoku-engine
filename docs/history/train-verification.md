# Training puzzles verification

Updated: 2026-11-13. This record is the acceptance evidence for merging `feat/train` (training puzzles, "Train", D106) into `master`. Per-task detail is in the [progress record](train-progress.md).

## Result

Every task's acceptance passes (T1–T5 and the optional T6), each task had an independent review whose findings were fixed, and the whole-suite gate passes: `npm test` with no failure (one worker crashed out of memory and its file passed on re-run), typecheck clean, lint at `master`'s baseline (0 errors, 3,342 warnings, none on a line this branch adds), and Playwright passes. The Escargot 15 s test failed on battery under full-suite load (it passes alone on both this branch and `master` in the same minutes) and passed in the full suite re-run on mains after the merge. Recommendation: merge.

## Commits

| Task | Commit | Review fix |
| --- | --- | --- |
| Approval: proposal merged and approved, D106, roadmap row, README line | `b3d81c3`, merge `92d5d89` (on `master`) | — |
| T1 pack of 500 positions, builder, independent checks | `76ed94e` | folded into the task commit (the fix changed the pack, which was rebuilt) |
| T2 domain, format version 4, backup migration | `321db1f` | folded into the task commit |
| Formatting of the T1–T2 files | `3514331` | — |
| T3 run screen | `efa57af` | `789a3f3` |
| T4 hub, statistics, history, study | `21d80c1` | `9685b46` |
| T5 key step after the answer | `d896424` | `a1ede29` |
| T6 timed run | `eedb1f4` | `849515a` |
| Lint pass over the branch (reviewed: no behaviour change) | `40041d0` | — |
| Lint findings from the final gate | `d0324d7` | — |
| Gate findings in the backup and hub specs | `59f7d8a` | — |

## Acceptance, task by task

All commands from `web/`. Power for the per-task checks: mains (`BatteryStatus` 2), CPU 1.6 GHz (the laptop's slow state) unless noted.

| Task | Acceptance (spec §6) | Command | Result |
| --- | --- | --- | --- |
| T1 | Same seeds give a byte-identical pack. Every entry checked by code importing nothing from `src/solver`: oracle solution; masks hold the solution digit; scan entries have a single from placed digits; technique entries have none in the shown candidates and one after `removed`; targets agree with the solution. | `TRAIN_PACK=write npx vitest run tests/unit/training-pack-build.test.ts` then `TRAIN_PACK=check …` (twice: after the review fixes, 956 s, and after the lint refactor, 748 s); `npx vitest run tests/unit/training-pack.test.ts` | Both full rebuilds byte-identical to the committed pack (sha256 `f1a3a48e…1d80`). 502 independent checks passed, including a transitive import check (no `src/solver` module reached), the catalogue tier of every key step, pattern cells on every technique position, at most three positions per source puzzle. |
| T2 | Unit tests for every transition; a version 1, 2 or 3 backup restores with empty training data; round trip of a version 4 backup; the ring never exceeds its bound. | `npx vitest run tests/unit/training.test.ts tests/unit/backup.test.ts tests/storage` | All passed (48 in `training.test.ts`). Transitions, median, categories, queue, ring of 500 (537 attempts recorded, 500 kept, still valid), v1–v3 → empty section, v4 round trip, restore opt-in and never from an old backup, rejection of 13 corrupt shapes. |
| T3 | Playwright with a fixed position: correct digit → streak 1 and a recorded time; wrong digit → streak 0, a miss, the intended placement shown; losing focus covers the board and stops the clock; reload during an attempt records nothing. | `npx playwright test tests/e2e/train.spec.ts` | 5 passed (the fifth: a note modifier never answers; Next returns focus to the board). |
| T4 | Playwright: statistics match a scripted sequence of attempts; unit tests for the median and for category assignment. | `npx playwright test tests/e2e/train-hub.spec.ts`; `tests/unit/training.test.ts` | 2 passed (correct, correct, miss, correct in one category: streak 1, longest 2, accuracy 75 %, best and median from the stored times, history order, Study without a record; the category filter persists and limits the sprint; Start disabled with every category off). Unit tests passed. |
| T5 | The explanation shows the key step's name, cells and removed candidates; visual test in both colour modes. | `npx playwright test tests/e2e/train-explain.spec.ts` | 4 passed. Light and dark: "Found with" + the step's name, never "requires"; every pattern cell drawn as reasoning; every removed candidate visible and struck through, including on a position whose removal falls in a target cell; text, legend and struck-candidate contrast checked; screenshots in the test output. A miss and the study view show the same step. |
| T6 | Ends at three minutes or the third miss; the result is recorded once. | `npx playwright test tests/e2e/train-timed.spec.ts`; `tests/unit/training.test.ts` | 5 passed (third miss ends and records once; still on at about 179 s of active time, over after 180 s, a five-minute pause not counted; a run left early not recorded; nothing selected after an auto-advance; every category off records nothing; a version 4 library without `runs` still loads). |

## Pack

`src/assets/training-pack.json`, `training-pack@1`, 333,076 bytes, loaded on demand: 500 positions from 849 seeds and 368 source puzzles (at most 3 each), Explain `explain-fair@3` with the `up-to-wings-fish@1` set.

| Category | Positions | Tier |
| --- | --- | --- |
| Scanning (singles from the placed digits; 132 found with Hidden Single, 68 with Naked Single) | 200 | 0 |
| Naked and hidden subsets (C04) | 120 | 1 |
| Wings (C11, XY-Wing) | 106 | 2 |
| Single-digit patterns (C10, Turbot Fish) | 63 | 2 |
| Fish (C06, X-Wing) | 11 | 2 |

No position of C03, C05 or C13 appeared in the seeds harvested; harder categories need a harder corpus (spec §5.2).

## Whole-suite gate

| Check | Power and CPU | Result |
| --- | --- | --- |
| `npm test` (12:17, 1,316 s) | mains, 1.6 GHz | 98 of 99 files passed; 2,946 passed, 11 skipped. One worker died with "Zone Allocation failed - process out of memory" 5 s into `tests/unit/solver/stall-case.test.ts` (unchanged by this branch) while the machine had 2.6 GB of RAM free; re-run alone: 3 passed. Total 2,949 passed / 11 skipped / 0 failed (master: 2,390 / 10). |
| `npm run typecheck` (12:40) | mains, 1.6 GHz | clean |
| `npm run lint` (after `d0324d7`) | mains, 1.6 GHz | 0 errors, 3,342 warnings (master's baseline); no warning on a line this branch adds |
| `npm run test:e2e`, first run (12:46) | battery, 1.6 GHz | 71 passed, 1 skipped, 2 failed: `backup.spec.ts` still expected version 4 to be refused (fixed: now 5); the hub statistics test let the fake clock run before the position appeared (fixed in the test). Both fixed in `59f7d8a`. The two known environmental tests (`appearance`, Escargot at 15 s) passed. |
| `npm run test:e2e`, second run (12:59, 7.3 min) | battery, 1.6 GHz | 72 passed, 1 skipped, 1 failed: `solver-screen.spec.ts` "Escargot at the 15 s preset…" reported "stopped at tier 4 by the time limit" instead of "stalled at tier n", the known environmental failure of this laptop's slow state (see the [M2.7 verification](m27-verification.md)). A/B in the same minutes (13:06–13:15, battery, 1.6 GHz), that test alone, alternating checkouts: `feat/train` passed (15.8 s, 15.4 s), `master` passed (14.3 s, 14.2 s, 17.9 s). Same outcome on both; the failure appears only under full-suite load. All 16 Train tests and the other 56 passed. |
| `npm run test:e2e`, third run (13:20, 4.3 min, on `master` at `e06a6d6` after the merge) | **mains**, 1.6 GHz | **73 passed, 1 skipped, 0 failed**. Both known environmental tests passed, the Escargot 15 s test included. The first attempt that minute did not run: port 5174 was still held by a `test:serve` Vite process left from the 12:59 run (pid stopped, port freed, suite re-run). |

## Deviations from the spec

- T1: the harvest runs Explain with the `up-to-wings-fish@1` technique set (M2.7) and a 4M-unit budget instead of the full set: the full set spent the budget in tier ≥ 3 searches (over 2 s per seed). A tier ≤ 2 step can never be set-limited under that set, so the "no simpler step" label is unchanged; positions after a tier ≥ 3 step are not harvested.
- T1: the engine's presentation-only `patternCells` (`src/solver/classic-run.ts`) now also reads wing, short-path and fish pattern fields, so the C06, C10 and C11 key steps carry their pattern cells. The Solve screen highlights those cells too. Proofs and acceptance never read it.
- T5: "Found with" uses the engine's step name, except C04, which the engine always names "Naked Pair"; there the name is derived from where the removals fall relative to the pattern cells (Naked/Hidden Pair/Triple).
- T2: restore keeps local training statistics unless asked; a backup without training statistics never replaces them.
- §4.2: a due missed position may return within the sprint that already showed it; the "never twice" rule applies to fresh picks.
- Review fixes for T1 and T2 were folded into their task commits; T3–T6 have separate review commits.

## Open risks and what was not verified

- The pack holds tiers 0–2 only; C03, C05 and C13 are absent from it.
- A reload starts a new sprint, so positions seen before it can return.
- After an auto-advance in a timed run nothing is selected, so an arrow key starts at A1.
- Bundle (`npm run build`): the pack is its own chunk loaded only by the Train screens, 315,986 bytes (88.4 kB gzip), against 155,611 bytes (50.5 kB gzip) for the main bundle and 702,850 bytes for the solver worker. The spec expected it to stay well under the app bundle; it is about a third of the whole app. A denser encoding of the candidate masks would shrink it; not done in this milestone.
- The full Playwright suite was re-run on mains after the merge (third run above): all 73 tests passed, so nothing is left unconfirmed on power. No run was made in the CPU's fast state; every run of this milestone was at 1.6 GHz.
