# M2.7 verification

Updated: 2026-11-12. This record is the acceptance evidence for merging `feat/m27-technique-selection` (M2.7, D105) into `master`: technique selection and a single Solve view. Per-task detail is in the [progress record](m27-progress.md).

## Result

Every task's acceptance passes, each task had an independent review whose findings were fixed in their own commit, and the whole-suite gate passes except three Playwright tests that time out or hit the wall-clock safety stop on this laptop's slow state and battery. All three fail the same way on `master`'s code run in the same minutes (A/B below), so they are environmental, not regressions; they should be re-run on mains in the fast state. Recommendation: merge.

## Commits

| Task | Commit | Review fix |
| --- | --- | --- |
| Approval: S1 note merged, proposal and note approved, D105, roadmap, README | `251be06`, merge `77856f7` | — |
| S1 §7 checks (all seven agree with the note) | `227f64f` | — |
| S2 engine, settings, backup (format version 3) | `4773fce` | `be54ba8` |
| S3 technique selector, presets, wording | `e7af297` | `efebe52` (applied after S4) |
| S4 one Solve view with a summary header | `eddae59` | `88cfd06` |
| S5 stall case (the §2 puzzle is Escargot) | `e03ed82` | `cab942a` |
| Stop reason for an interrupted lower job (D105 item 8) | `06f2d9c` | `9387934` |
| README screenshot recaptured | `4011482` | — |
| Lint findings from the final gate | `0fd4e6f` | — |

## Acceptance, task by task

| Task | Acceptance (spec) | Command (from `web/`) | Result |
| --- | --- | --- | --- |
| S1 | Approved; names `incomplete-cheaper-tier` for a set with gaps. §7 checks run before S2. | throwaway probes (scratchpad) on `master` `77856f7` | Approved under D105. All seven checks agree with the note's reading ([progress](m27-progress.md)). |
| S2 | Default set gives today's key and byte-identical `@1`/`@2`/`@3` traces; each preset terminates consistently (table-driven); count and checker identical across sets on the corpus. S1 note §6 tables 1–5. | `npx vitest run tests/unit/solver/technique-sets.test.ts tests/unit/solver/technique-sets-corpus.test.ts tests/unit/solver/solve-request.test.ts tests/unit/backup.test.ts`; unchanged `golden-traces`, `result-contract`, `policies-v3`, `count-first` | 37 + 131 + 3 + 45 passed. Ten default keys byte-identical to literals recorded from `master`; golden traces unmodified and passing; 9 sets × 6 cases under `@3` and 5 presets under `@1`, outcomes pinned; 131 cases × 4 sets with identical count and solution. |
| S3 | Playwright: "No fish" on the §2 puzzle changes the coverage shown, not the count. | `npx playwright test tests/e2e/solver-techniques.spec.ts` | 2 passed. Count line identical; coverage 33 → 28 enabled plus 5 not selected (the five fish families, none with a step). |
| S4 | Playwright: no toggle; the header shows the M2.6 summary lines; the step list is unchanged for the corpus cases. | `npx playwright test tests/e2e/solver-view.spec.ts` | 3 passed. No Analyze/Explain radios; header with count, logic, highest tier, steps per tier, coverage; step names equal the engine's on `easy`, `hidden-singles`, `seventeen`. |
| S5 | Count `unique` and the stored solution match the Algorithm X oracle; `human` incomplete or stalled, no technique asserted. | `npx vitest run tests/unit/solver/stall-case.test.ts` | 3 passed. The puzzle is the corpus case `escargot`; no duplicate added (deviation below). |
| Stop reason (D105 item 8) | A stop caused by an interrupted lower job has its own reason. | `npx vitest run tests/unit/solver/stop-reason.test.ts tests/unit/solver/result-contract.test.ts tests/unit/solver-copy.test.ts` | Passed. Escargot under `@1` with C33 interrupted reports `lower-interrupted`; `@3` climbs to tier 6 (`tier-cap`). |

## Whole-suite gate

Windows 11 Pro 10.0.26200, Node v24.19.0, Chromium (Playwright 1.63.0). Every npm command ran from `web/`, one heavy check at a time. Power was read before and after each run.

| Check | Commit | Power | Result | Duration |
| --- | --- | --- | --- | --- |
| `npm test` | `4011482` | mains (slow state, CPU 1.6 GHz) at the start, battery from about half way | **95 files passed; 2,390 passed, 10 skipped, 0 failed**; exit 0 | 4,554.8 s (20:04–21:20 -03:00) |
| `npm run typecheck` | `0fd4e6f` | battery | exit 0 | — |
| `npm run lint` | `4011482` | battery | exit 1: **3 errors** (`no-unnecessary-condition`), 3,354 warnings, 12 of them on lines the branch added | — |
| `npm run lint` | `0fd4e6f` | battery | **0 errors, 3,342 warnings** (the `master` baseline); none on lines the branch added; exit 0 | — |
| unit tests importing files changed by `0fd4e6f` | `0fd4e6f` | battery | `technique-sets`, `solver-copy`: 43 passed; `stop-reason`, `technique-selection`, `solver-copy`: 11 passed | 304 s, 68 s |
| `npm run test:e2e` | `0fd4e6f` | battery (CPU 1.6 GHz) | **54 passed, 1 skipped, 3 failed** (below) | 10.8 min (21:36 -03:00) |

The 10 vitest skips and the Playwright skip (`solver-m26-benchmark.spec.ts`, gated by `M26_BENCH`) are the environment-gated ones `master` has. Against the merged-outline gate (89 files, 2,191 passed), the six new files and 199 tests are `technique-sets`, `technique-sets-corpus` (one test per corpus case), `solve-request`, `stall-case`, `stop-reason` and `technique-selection`, plus new cases in `backup`, `solver-copy` and `result-contract`. `npm test` ran one commit before the lint fix; that commit changes no engine code (renames, two redundant `?.`/`??` removed, split test helpers), and every unit test importing a file it changed was re-run on it.

### The three Playwright failures, A/B against `master`

| Test | On the branch (`0fd4e6f`) | `master`'s code, same minutes, same machine |
| --- | --- | --- |
| `appearance.spec.ts` "all ten appearances … survive reload" | 30 s test timeout waiting on a navigation click; again when re-run alone | same timeout |
| `persistence.spec.ts` "library survives a true browser restart …" (two cold Chromium profiles) | 30 s test timeout; again when re-run alone | same timeout |
| `solver-screen.spec.ts` "Escargot at the 15 s preset … reports where logic stalled" | "stopped at tier 4 by the time limit" instead of "stalled at tier n" | same text |

`master`'s code was run from an archive of `master` in the session scratchpad with the checkout's `node_modules` linked, not from a worktree. The same three tests passed at S3 (`e7af297`) on mains in the fast state (the first two in the full `settings`/`solver-screen` runs, 1.5–8 s). Measured cause for the third: the engine alone ran Escargot's 1.8M-unit budget in 24–33 s on mains in the slow state, against about 9 s earlier the same day, on `master`'s code as on the branch, with the identical result (`tier-cap`, 28 steps); the 15 s preset's time safety stop then comes first.

### Re-run on mains (2026-11-13, after `561fd03`)

Power on mains (`Win32_Battery.BatteryStatus` 2, read before and after), CPU still in the slow state (`CurrentClockSpeed` 1,600 MHz). Every run from `web/`, one at a time, `master` (`77856f7`) and the branch (`561fd03`) checked out in turn in the main checkout.

| Run | Branch (`561fd03`) | `master` (`77856f7`) |
| --- | --- | --- |
| `appearance`, `persistence`, `solver-screen` spec files (08:28) | 9 passed, 2 failed: `appearance` "all ten appearances", Escargot 15 s; `persistence` passed | — |
| `appearance.spec.ts:5 --repeat-each 3` | 2 passed, 1 failed | 1 passed, 2 failed |
| Escargot at the 15 s preset (branch line 186, `master` line 170) | failed: "Logic: stopped at tier 4 by the time limit; 14 techniques not tried" | failed with the same text |

`persistence` passes on mains. `appearance` is flaky against its 30 s test timeout on both sides in the slow state, and Escargot fails identically on both, so neither is a regression from M2.7. Both are expected to pass in the fast state, as they did at S3; that was not re-measured.

## Deviations

- **Format version 3 (D105).** The library `formatVersion` and the backup `version` go to 3, against the S1 note §5.6 (which kept 2); versions 1 and 2 load with the defaults. An older build refuses a version-3 library ("Unsupported data version."). The next format change (training puzzles) bumps it again.
- **S5 adds no corpus case.** The proposal's §2 puzzle is AI Escargot, already the case `escargot`; `stall-case.test.ts` pins the identity and the S5 acceptance.
- **S3 review fix after S4.** `efebe52` was committed after `eddae59` because S4 was already in progress when the S3 review came back.
- **Table 3 budgets.** The S1 note's table 3 runs at 1.2M work units for the singles cases and 600k for the hard ones (S2 notes); the named outcome "tier 6 is served" for `C01, C02, C22` on Escargot is checked as `highestTierTried` 6 (served), since no tier-6 step is found within that budget.

## Open risks

- The three Playwright tests above are confirmed environmental by A/B on battery and again on mains in the slow state (2026-11-13); `persistence` passes on mains; `appearance` and Escargot were not re-run in the fast state after the last commit.
- After a rollback to a pre-M2.7 build, a library written by this build is refused until the newer build returns (format version 3).
- The table-3 test file takes 90 s in the fast state and about 320 s in the slow state; the whole suite took 76 min here against 20–32 min in earlier gates.
- `docs/media/explain.png` was recaptured on this build; `docs/media/play.png` is unchanged.

## Not verified

- Firefox and WebKit (not installed), as for M2.6.
- Any timing target on mains in the fast state after `e7af297`; no M2.7 acceptance is a timing target.
- Variant and conditional profiles with a technique set: the engine accepts them (rows per profile are pinned), but the Solve screen runs `classic-expanded@1` only.
