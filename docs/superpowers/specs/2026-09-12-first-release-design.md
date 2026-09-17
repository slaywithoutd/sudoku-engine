# First usable release: approved behavior

Date: 2026-09-12. Status: APPROVED by Q32/D038. All behavior defaults below were accepted by the user. First-release implementation and verification are complete; see [release evidence](../../release-verification.md). The behavior below remains the approved contract.

## Confirmed scope

Localhost desktop-browser application with a start menu, classic 9×9 creator/player, personal saved-puzzle list, and basic Settings. Solve and community Explore identify future features. Manual clue entry and an 81-cell puzzle string are supported. Persistence is local to the browser with JSON file backup.

Shift temporarily enters corner notes. Select one cell at a time. Arrows wrap within the same row/column; given clues are selectable but locked in play. Player digits hide existing notes, and erasing the digit reveals them. Notes are manual, without automatic peer cleanup.

Creation always highlights conflicts and blocks Finish while conflicts exist; drafts autosave anyway. Play conflict highlighting is off by default and configurable. Undo reverses edits, erases, and resets, restores notes, ignores navigation, and persists separately for drafts and play sessions.

## Screens and lifecycle

- Home: Play, Create, Solve, and Settings. Solve is clearly marked as coming later.
- Play: personal library with Drafts and Puzzles views; an Explore affordance is identified as coming later.
- Create: starts an autosaved draft; offers manual entry and Paste Puzzle.
- Drafts can be named and reopened. Finish creates an immutable playable puzzle, then offers Play Now or Return to Library.
- Play opens or resumes that puzzle's current play session. Reset clears player values/notes as one undoable action while preserving givens. Only one current play session per puzzle initially.
- Edit a finished puzzle opens a new draft copy; it does not alter the original or its session.
- Library supports open/resume, rename, edit-copy, and delete. Deletion requires an explicit confirmation and is separate from board undo; this is a product flow, not an agent approval policy.
- Untitled records receive an automatic name. A zero-clue draft may finish because open games are allowed, but no solvability or uniqueness status is inferred from conflict checks.

## Precise input behavior

| Action | Result |
| --- | --- |
| Open board | Select row 1, column 1; restore saved selection when resuming. |
| Click a cell | Select it, including givens. |
| Arrow key | Move one cell, wrapping at the opposite edge; prevent page scrolling when the board owns input. |
| Keyboard 1–9 or number button | Enter/replace the selected editable cell's digit. Entering the same digit is a no-op. |
| Hold Shift + digit/button during play | Toggle that corner note on an empty editable cell. Ignore note entry into a filled cell. |
| Notes button | Toggle a persistent corner-note tool; Shift temporarily forces corner mode and release restores the tool. |
| Erase / Delete / Backspace / 0 | If a player value exists, clear it and reveal retained notes; otherwise clear visible notes as one action. In creation, clear the clue. |
| Ctrl+Z | Undo the latest state-changing board action; do nothing when history is empty. |
| Ctrl+Y or Ctrl+Shift+Z | Redo; a new edit after undo discards the redo branch. |
| Typing in name/import/settings fields | Normal form input; board shortcuts do not intercept it. |

Creation initially enters clues only; corner annotations are a play tool. Givens reject digit, note, and erase edits during play. Corner marks are small sorted candidates at cell corners, not the existing fixed 3×3 digit positions. Rendering must accommodate all nine candidates without overflow.

Selection changes do not create history entries. Note/number button clicks preserve the board's selected cell. Mouse and keyboard input call the same editing actions, including Shift handling. Blur must not leave a modifier stuck on.

Keep persisted board history initially without silently trimming it; handle storage failure through an unsaved indicator and export/retry. A measured history cap, if needed later, must become an explicit documented behavior. JSON backup includes history as specified below.

## Puzzle-string import

Accept exactly 81 cell characters after removing whitespace: digits 1–9 are givens, `0` and `.` are empty. Reject other characters and incorrect lengths before modifying stored data. Import creates a new draft, preserving an existing draft.

A syntactically valid string with conflicts is accepted as an unfinished draft with conflicts highlighted. Finish remains blocked until conflicts are resolved. String import does not verify solvability or uniqueness.

## Library, saving, and backups

Autosave draft/play changes and their histories atomically. Save preferences and selection too, with selection outside undo. Preserve work when navigating back to Home/Library.

JSON export includes all drafts, puzzle definitions, play sessions, notes, histories, and settings in a versioned format. Validate the whole backup before writing; invalid or unsupported newer formats leave existing data untouched.

Restore merges by default. Identical records are skipped; conflicting IDs/content are imported as linked copies with remapped references, preserving existing data. Show a summary before applying. Keep current settings unless the user explicitly chooses to restore backup settings. Restore is an atomic library operation, not a board undo action.

Deletion removes the chosen puzzle and its related session after confirmation, or just the selected draft. Backup is the recovery mechanism for confirmed deletion. Rich search/tags, multiple attempt history, and community accounts are later library features.

## Feedback and Settings

Settings initially contains the play conflict-highlighting switch and backup export/import. Keep the existing Portuguese UI language initially; documentation may stay in English. No theme customization is required for this release.

Creation highlights all cells participating in duplicate row/column/box conflicts and explains why Finish is blocked. During play, the same visible-conflict check runs only as needed for enabled feedback or completion checking; no solution is consulted.

On a full conflict-free play board, show a dismissible completion message. This certifies that the filled classic board obeys its rules, not that the puzzle has only one solution. A full conflicting board is not marked completed. When play highlighting is off, avoid an unsolicited error popup that reveals mistakes; leave the board editable.

Finished puzzle metadata says that solvability/uniqueness have not been checked until a future solver supplies evidence. Draft/ready/in-progress/completed are lifecycle statuses, distinct from solution-count or perfection claims.

## Layout

Use a simple light interface with a prominent square board, compact number/erase controls, and rounded surrounding panels/buttons. Preserve clear 3×3 boundaries and readable corners. Use visible selection/focus and distinguish givens from player values without relying only on color.

The board can use an HTML grid initially. Keep rendering separate from domain state so the variant editor can add an SVG constraint layer later without changing puzzle/history semantics. Final visual polish and extensive gameplay settings remain later work.

## First-release acceptance checks

1. Create a draft by manual input and by a valid 81-cell string; malformed input does not alter saved work.
2. A conflicting draft survives refresh, shows conflicts, and cannot Finish until resolved.
3. Finish adds a puzzle to the library and Play opens it with locked but selectable givens.
4. Arrows wrap correctly in all directions; keyboard and onscreen inputs agree, including Shift notes.
5. Entering a value preserves hidden notes; erasing reveals them; manual peer notes remain unchanged.
6. Undo/redo restores values and notes through edits and reset, excludes navigation, and survives refresh/reopen without crossing creation/play histories.
7. Play conflicts are hidden by default and shown when enabled; creation feedback remains active regardless of that setting.
8. Editing a finished puzzle creates a draft copy and preserves original progress.
9. Backup/restore round-trips the agreed data, handles duplicate/conflicting records, and rejects malformed backups without partial writes.
10. Save failures remain visible; a full valid board reports completion without claiming uniqueness.

Run domain/persistence tests for these stateful contracts and browser checks for real input/focus behavior. This document defines the verification contract; [release verification](../../release-verification.md) records the completed implementation checks and their limits.
