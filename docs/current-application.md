# Existing application baseline

Inspected 2026-09-12 at commit `a45d465` (`simple sudoku webpage`). Git working tree was clean before documentation was added. Findings below come from source inspection; the application was not run during this planning step.

## Stack

- Maven project; Java 17 configured in `pom.xml`.
- Spring Boot parent version 4.1.1 declared by the repository.
- Spring MVC backend, static HTML/CSS/JavaScript frontend.
- No frontend package manager or framework manifest found.
- Main frontend files: `src/main/resources/static/index.html`, `app.js`, and `style.css`.
- Existing UI text is Portuguese.

## Current board behavior

- Hard-coded 9×9 grid with 3×3 boxes.
- Starts in create mode; clicking a cell selects it.
- Keyboard digits and clickable number buttons enter values.
- Zero, Backspace, Delete, and the erase button clear values.
- In create mode, server validation blocks placements that violate classic row/column/box constraints.
- Play locks all current values as givens.
- Given cells cannot currently be selected in play mode.
- Play supports a notes button; notes use fixed positions in a 3×3 miniature grid inside a cell.
- Entering a value clears that cell's notes; note entry is ignored in filled cells.
- Reset clears player values and notes while preserving givens.
- New Board returns to an empty create board.
- Full boards trigger a validation/completion popup.

## Missing requested mechanics

- No arrow-key navigation handler.
- No explicit Shift annotation handling.
- No undo or redo history.

## State and backend

- Frontend stores grid, givens, invalid markers, notes, selection, and mode in JavaScript memory.
- No persistence or puzzle library found.
- `Board` fixes size to 9 and box size to 3.
- `BoardValidator` composes `RowRule`, `ColumnRule`, and `BoxRule` through `ValidationRule`.
- API endpoints: `POST /api/sudoku/validate-cell` and `POST /api/sudoku/validate-board`.
- No solve, solution-counting, hint, authoring-assistant, variant, or AI implementation found.
- The only checked-in test found is a Spring context-loading test.

## Implications for later design

- Existing validation strategies provide an early composition pattern, but they do not yet define a generalized constraint or deduction engine.
- Play validation can issue one request for every filled non-given cell after an entry; async responses mutate shared state. Immediate keyboard input/history design should account for stale responses and responsiveness.
- Clear separation between puzzle definition, player state, solver state, and view state is a proposal to evaluate, not an existing architecture.
- Choose the first milestone behavior before changing or replacing the current stack.
