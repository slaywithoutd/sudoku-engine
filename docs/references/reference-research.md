# Reference research

Checked: 2026-09-12. Scope: initial product/design research from primary sources. This is not an exhaustive interaction audit. Current findings came from published help, project documentation, and production source inspection; no interactive browser session was performed.

## SudokuPad

The [official application help](https://sudokupad.app/) documents arrow navigation, clicking/dragging to select, Ctrl-modified selection, numeric keyboard/onscreen entry, Shift+digit corner notes, Ctrl+digit centre notes, Ctrl+Shift+digit colours, Ctrl+Z undo, and Ctrl+Y redo. Z/X/C/V select the digit/corner/centre/colour tools.

Its help warns that Check performs basic Sudoku checks and may not work for special constraints or non-Sudoku grids. Therefore, visual support for a variant should not be treated as proof of rule enforcement or uniqueness.

Suggested project implication: use the documented interactions as defaults to discuss, while retaining the user's narrower initial scope. Centre notes, colours, multi-selection, and redo are not yet agreed first-milestone requirements.

## Creating variants for SudokuPad

In a [historical creator response](https://svencodes.itch.io/sudokupad/comments), Sven directed authors to external editors such as f-puzzles or SudokuLab, followed by import/conversion into SudokuPad. He described placing an encoded f-puzzles payload after `https://sudokupad.app/fpuzzles`.

The response is approximately three years old. It establishes an authoring workflow, not a claim that every current SudokuPad edition lacks authoring tools. Exact present-day import compatibility still needs testing before any integration commitment.

Practical workflow to investigate: create the grid in an authoring tool, add clues/variant graphics and rules, test the puzzle using that tool's supported capabilities, then export/import for play in SudokuPad. Written or cosmetic rules require separate verification if a solver does not implement them.

## SudokuMaker: additional relevant reference

[SudokuMaker](https://sudokumaker.app/) offers custom constraints written in JavaScript, separates cosmetic components from programmed constraints, and exposes logical-step operations, solution search, and SudokuPad export. The custom-constraint editor labels the feature experimental. These findings were inspected in its [production application source](https://sudokumaker.app/assets/main-D44ZZMA9.js); that hashed asset URL may change on deployment.

This is evidence that a customizable authoring/solving workflow is worth studying. It does not establish support for arbitrary natural-language rules, reliable AI-generated algorithms, or every combination of constraints.

## f-puzzles and external solver integration

The [SudokuSolver f-puzzles integration documentation](https://github.com/dclamage/SudokuSolver/wiki/fpuzzles-integration) describes configurable human-style logical steps, logical solution paths, 0/1/2+ solution checking, exact solution counting, and true candidates. It also documents userscript tooling for solution embedding, SudokuPad export, JSON editing, and fog support. The [solver repository](https://github.com/dclamage/SudokuSolver) provides implementation context.

These advanced capabilities belong to the documented integration and must not automatically be attributed to stock f-puzzles. A direct stock-editor feature inventory remains a later research task if needed for implementation.

## Sudoku - The Clean One

The [developer's application listing](https://play.google.com/store/apps/details?id=ee.dustland.android.dustlandsudoku&hl=en) emphasizes minimal visual detail, themes, quick resume, automatic saving, both cell-first and digit-first input, optional assistance, notes with automatic removal, and undo.

Design inference for this project: let the board dominate the screen, keep controls compact, and make assistance optional. This is an interpretation of the reference, not a user-approved layout or a requirement to reproduce its mobile interface.

## Architectural questions raised by the research

Recommendation, awaiting design discussion: describe support per rule using distinct capabilities:

1. Render the rule and explain it to a player.
2. Validate assignments or a completed board under the rule.
3. Search/count solutions under the rule.
4. Produce human-readable deductions involving the rule.

The platform must decide which capabilities are required for creation, play, hints, uniqueness claims, and community publication. It should not infer capabilities merely from a rule's appearance.
