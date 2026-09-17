# UX overhaul — 2026-09-16

Merged into `master` on 2026-09-17.

The global layout work that followed (commit `37aed22`) belongs to the same overhaul: application-wide fullscreen that survives navigation, a sidebar that collapses to a rail, and a responsive game grid that fits the board, keypad and actions at every proportion.

## Principles applied

The product assumes players already know Sudoku. Game screens show the board, a compact top bar and one side column; explanations live on **Help**. Play, Create and Solve share one puzzle surface (`web/src/ui/puzzle-editor.ts`): board, keypad, keyboard map, selection and cell clipboard.

## Decisions

| Topic | Decision | Reason |
| --- | --- | --- |
| Component library | No HeroUI dependency; `web/src/ui/components.ts` provides select, menu, segmented switch and switch modelled on HeroUI's anatomy and keyboard behaviour. | HeroUI requires React and Tailwind; the app is dependency-free TypeScript. |
| Solver Analyze / Explain | One engine run (engine Explain mode) with two presentations. | Engine Analyze stays disabled until its defaults are benchmarked (D063). |
| Solver progress | Indeterminate bar, phase, steps found and elapsed time; no percentage. | The engine cannot estimate completion honestly. |
| Selection | `selected = -1` means none. Clicking the selected cell, clicking outside the board and its controls, or `Esc` clears it; arrows or Tab restore it. | Consistent on every screen, including touch. |
| Notes | Corner notes (`notes`) fill corners then edges in digit order; center notes (`center`) own the middle. | Avoids the old 3 × 3 layout colliding with center notes (SudokuPad convention). |
| Colors | Six cell background colors; optional patterns and a color-blind-safe palette. Notes stay monochrome. | Chosen by the user; patterns keep colors distinguishable without hue. |
| Fill notes | Candidates from row, column and box only; one undoable edit. | Must not use the solution or solving techniques. |
| Timer | Counts only while started, unpaused, unsolved, visible and focused; samples more than 5 s apart (sleep) are not counted; hidden timers keep counting. Start options: immediately or on the first move. Pausing covers the board. | "Start paused" required an extra click with no benefit; not counting inactive time is always on rather than a setting. |
| Keypad | One setting: Shown / Minimized / Hidden (touch screens always keep the restore bar); layout 1 2 3 or 7 8 9 on top; completed digits are dimmed, not removed. | Show/hide and minimize were duplicates; removing keys would shift the layout. |
| Mark correct digits | Uses the unique solution from the exact search in a worker; unavailable for non-unique puzzles. | Puzzles are not otherwise checked for uniqueness. |
| Copy / paste | Copies digit, corner and center notes and color, never clue status; pasting never changes clues and is undoable. Copy puzzle writes 81 characters; Export game writes JSON that Import accepts. | Predictable round trips. |
| Explain visuals | Board shows the grid before the step, candidates before elimination, reasoning cells (pattern `cell`/`cells`), changed cells and struck-through eliminations. | Cells come from technique patterns and are presentation-only. |
| Data | `formatVersion` 2 / backup version 2; version 1 libraries and backups load with defaults. Empty note layers and colors are omitted from stored cells. | Keeps old records and histories valid. |

## Verification

The E2E suites under `web/tests/e2e/` cover deselection, note layers, colors, copy/paste, Fill notes, timer accounting (with a fake clock and simulated hidden pages), settings, shortcuts, import files, Library → Solver and Explain navigation.
