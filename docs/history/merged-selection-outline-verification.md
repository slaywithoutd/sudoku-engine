# Merged selection outline verification

Updated: 2026-11-12. This record is the acceptance evidence for merging `feat/merged-selection-outline` into `master`. The branch draws a multi-cell selection as one merged, outlined shape (SudokuPad style) instead of a box per cell: `web/src/ui/selection-outline.ts` (geometry), `web/src/ui/board.ts` (two SVG overlays, fill under the cells and outline above the grid lines), `web/src/styles.css`.

## Result

The whole-suite gate passes at `e558700`: vitest 0 failed, typecheck clean, lint 0 errors with the same warning count as `master`, Playwright 0 failed. An independent review found one real geometry bug and three CSS defects, all fixed in `e558700` (below). Ready to merge.

## Commits

| Commit | What |
| --- | --- |
| `df54477` | feat(ui): merge selected cells into one outlined shape (the original work) |
| `b7a5f74` | earlier merge of `master` into the branch |
| `daecd9a` | merge of `master` at `846267e` (M2.6) into the branch; clean, no conflicts |
| `e558700` | fix(ui): merged selection outline review |

## Environment

Windows 11 Pro 10.0.26200, Node v24.19.0. Every command ran from `web/`, one heavy check at a time. **Power: on mains for every run** (`Win32_Battery.BatteryStatus` 2, read before and after the e2e and `npm test` runs).

## Command record

| Check | Commit | Result | Duration |
| --- | --- | --- | --- |
| `npx vitest run tests/unit/selection-outline.test.ts` | `daecd9a` | 10 passed | 0.5 s |
| `npm run typecheck` | `daecd9a` | exit 0 | — |
| `npm run lint` | `daecd9a` | exit 0 but **1 error** (`no-unnecessary-condition`, `tests/unit/selection-outline.test.ts:9`), 3,361 warnings (19 new `id-length` in the branch's two new files) | — |
| `npx vitest run tests/unit/selection-outline.test.ts` | `e558700` | 14 passed | 1.3 s |
| `npm run test:e2e` | `e558700` | **52 passed, 1 skipped, 0 failed**; exit 0 | 2.7 min (from 16:22 -03:00) |
| `npm test` | `e558700` | **89 files passed; 2,191 passed, 10 skipped, 0 failed**; exit 0 | 1,907.7 s (16:26–16:58 -03:00) |
| `npm run lint` | `e558700` | **0 errors, 3,342 warnings** (same as `master`); exit 0 | — |
| `npm run typecheck` | `e558700` | exit 0 | — |

Against the M2.6 gate on `master` (88 files, 2,177 passed, 10 skipped), the extra file and 14 tests are `selection-outline.test.ts`. The 10 vitest skips and the Playwright skip (`solver-m26-benchmark.spec.ts`, gated by `M26_BENCH`) are the same environment-gated ones as on `master`.

## Visual snapshots

None changed. `tests/e2e/visual.spec.ts` writes screenshots to the test output (`page.screenshot`), not to `toHaveScreenshot` baselines, and the repository has no snapshot directory, so there was nothing to update. Checked by eye: in `creator-conflicts.png` (1280×800), the selected conflicting cell shows its red tint inside the single outline, and nothing else on the board moved.

## Independent review and fixes (`e558700`)

A subagent that had not seen the implementation reasoning reviewed `master...feat/merged-selection-outline`.

1. **Outline bridged empty cells (high).** When a region touched itself diagonally around a pocket, and the selection was built in an unsorted order (ctrl-click), the loop walk closed as soon as it came back to its start vertex. That drew stroke and fill across unselected cells. Repro: click order `68,50,69,60,49,58,51`. Fix: the start edge stays available, and the loop closes only when the turn rule picks it again. Fuzzing 200,000 random selections in random click order, checking that every outline corner lies inside a selected cell: old code had 2,542 failures, new code 0.
2. **Selected cells lost their conflict tint (medium).** The rule that clears the selected cell's own layer outranked `.cell.conflict::before`. Selected conflicts keep the tint again (checked in the app and in the visual screenshot).
3. **Hover painted over the merged fill (low).** The clearing rule now outranks the hover rule (checked in the app: a hovered selected cell's layer is transparent).
4. **Colored cells tinted past the outline at concave corners (low).** `concaveCorners()` marks corners where both sides are merged but the diagonal cell is not. `board.ts` sets `notch-*` classes, and the tint clips a 6% square there (checked in the app on an L-shaped selection).
5. **Coverage.** `appearance.spec.ts` measured note contrast against the selected cell's own `::before`, which is now transparent. It now measures against `.selection-fill path`. New unit tests: the unsorted pinch repro, a seeded property test (5,000 random selections in random order, every corner inside a selected cell), and `concaveCorners`.

The review found no issues with stale outlines (every selection change goes through `update()`), with listener or DOM leaks (both overlays are created once per mount and removed with the board), or with the theme tokens (`--selection` and `--selection-border` only, 3 px stroke in high contrast).

The lint error and the branch's 19 new warnings were fixed in the same commit: renamed short identifiers, and the test split into two `describe` blocks.

## Not verified

- Playwright ran on Chromium only. Other browsers were not checked.
- No unit test covers the `board.ts` wiring (path `d` and `merged-*` / `notch-*` classes). The e2e suite and the in-app checks above cover it.
