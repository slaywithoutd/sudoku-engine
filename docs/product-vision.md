# Product vision

Source: user's project description, 2026-09-12. This is a faithful organized requirements capture, not an approved architecture or a promise to deliver everything in the first release.

## Immediate milestone

A simple design for PC with a Sudoku board. The user must be able to select cells, move with arrow keys, enter numbers, use Shift for annotations, and undo with Ctrl+Z. The initial mechanics and subsequent first-release refinements are specified in the approved `superpowers/specs/2026-09-12-first-release-design.md`.

Round 1 clarification: start with a menu offering three main paths plus configuration. Library/Explore leads directly into playing a selected puzzle; the other paths are Create and Solve. Round 2 below settles the initial destination scope. The confirmed delivery platform is a desktop web browser.

Round 2 decisions settle initial scope: start menu, classic 9×9 creation/play, personal saved-puzzle list, and basic Settings. Solve and community Explore are clearly marked as future features. Enter clues manually or paste an 81-cell puzzle string. Support temporary Shift corner notes and single-cell selection; centre notes and multi-selection follow later. Q32 approves the detailed behavior defaults, including Portuguese UI text.

Conflict behavior: creation always highlights row/column/box conflicts and cannot be finished while they remain. Play allows mistakes with conflict highlighting off by default and a Settings switch to enable it. These checks do not establish solvability or uniqueness.

Persistence: automatically save puzzles, progress, and history in this browser, with versioned JSON backups including settings. Restore validates before writing and merges conflicting records as copies. Initial versions do not require cross-browser/device synchronization.

Creation lifecycle: autosave drafts even with conflicts. An explicit Finish action checks conflicts and adds the puzzle to the playable library, with an option to play immediately. Solvability and uniqueness remain identified as unverified until solver checks exist. Editing a finished puzzle's clues creates a new draft copy, preserving the original puzzle and play progress.

Undo: reverse value/note edits, erases, and resets, restoring notes. Navigation and selection are outside history; creation/play histories are separate and persist across refresh/reopen and backups. Include redo and do not silently trim history initially.

Notes: entering a full-size value hides that cell's notes without deleting them; erasing the value reveals them. Notes remain manual initially: placing a digit does not remove candidates from row/column/box peers. Optional automatic cleanup is deferred.

Navigation: arrows wrap to the opposite edge within the same row or column. Given clues are selectable but locked during play; navigation does not skip them.

Technology: after requesting a best-fit proposal with no stack preference, the user approved the browser-first architecture in Round 5 Q31: TypeScript + Vite, plain TypeScript views, IndexedDB for state/history, and a worker for later solving. The original Java prototype was migrated to this stack and later removed (D098). Domain state, views, persistence, rules, and solving have separate boundaries.

Initial launch: run locally on the user's PC and access through localhost. A hosted deployment is not required for the first version.

## Create

- Create classic Sudoku, established variants, and user-defined variants.
- Confirmed in Round 4 Q26: the first built-in variant group is diagonal Sudoku, killer cages, and thermometers. Creation/play support precedes variant solver support under the agreed delivery sequence.
- Confirmed in Round 4 Q27: initial variants use a classic 9×9 board, digits 1–9, and classic rules with combinable variant constraints. Custom sizes, symbols, regions, and layouts come later.
- Customize board structure, available numbers or symbols, rules, and other puzzle properties as broadly as practical.
- Confirmed in Round 1 Q4: written/custom rules may be created and played before engine support exists. Clearly identify that distinction; reliable full-puzzle hints and uniqueness verification require support for all applicable rules.
- Investigate how puzzles and variants are authored for SudokuPad, with f-puzzles as another reference.
- Provide an assistant that starts from a partially authored puzzle, respects mandatory elements, and adds as little as possible to obtain a puzzle with exactly one solution.
- Confirmed in Round 4 Q28: preserve locked clues and seek a result where no added clue can individually be removed without breaking the requested target; do not promise globally fewest additions. Q35 locks all entered clues initially and permits only additions. Target-specific evidence is defined at the assistant design checkpoint.
- Support alternative solution-count goals, including deliberately allowing multiple solutions.
- Confirmed quality policy: Perfect means exactly one solution with a complete allowed logical path and is the default target. Creators may choose uniqueness alone or Open (at least one solution, uniqueness optional). Always distinguish the target from verified status. Requested exact counts/ranges are a later extension.
- Expand the collection of creation assistance tools over time.

Later design checkpoints define mandatory variant elements, expanded assistant edits, irreducibility evidence per target, technique details, and capability/status presentation. Configurable limits and Cancel are confirmed; unfinished checks report incomplete/unknown outcomes.

## Play

- Aim for interaction and configuration flexibility close to SudokuPad.
- Support multiple annotation styles, including the small/large distinction the user mentioned, colors, and additional useful markings.
- Offer different hint operations: verify, fill annotations, show the next logical step, remove incorrect entries or annotations, and reveal a value/location.
- Make gameplay settings extensively customizable.
- Initial corner-note behavior is approved; broader annotations and hint disclosure levels have later design checkpoints. Gameplay hints wait until variant solving is complete (Q37).

## Solve

- Let a user choose a puzzle and ask the engine to solve it through a simple interface.
- Confirmed in Round 4 Q25: show the solved board with an optional expandable ordered explanation of each step, identifying where search was used.
- Prefer human logical deductions. Guess and backtrack only when no supported logical move is available.
- Confirmed in Round 4 Q23: explainable contradiction techniques within a chosen human technique set count as logic for the perfect-puzzle criterion. Open-ended guess/backtrack search does not. The precise technique set and complexity bounds remain open.
- Confirmed in Round 4 Q24: start classic solving with a small reliable set of explained human techniques and grow it incrementally. Clearly identify search used after supported techniques stall; a search-assisted solve does not certify perfection or prove that a logical path is impossible.
- Reuse solving capabilities for gameplay hints.
- Maintain a repository of algorithms describing the step-by-step logic for supported variants.
- Compose applicable rules and techniques through the approved registry/shared-state architecture. The factory assembles capabilities; it does not generate a new monolithic source function for each combination.
- Handle interactions between rules, not just isolated rule types.
- Solving and construction use configurable limits and Cancel, with explicit incomplete/unknown results when verification cannot finish.

## AI-assisted rule development

Long-term ambition: AI reads a new rule, understands its meaning, develops solving logic, writes an implementation, and stores it in the algorithm library for reuse.

Confirmed in Round 4 Q30: require explicit examples, automated validation, and the user's review before registering generated code as trusted engine support. AI may generate a reviewable proposal beforehand.

Open decisions include how ambiguities are resolved, how generated implementations are checked, execution boundaries, versioning, and what capabilities can be claimed before verification. Automatic code generation is an aspiration, not an existing capability.

## Library and community

- Track created puzzles, played puzzles, and puzzles the user wants to play.
- Explore community puzzles.
- Initial personal storage/library and backup behavior are approved; richer library features, sharing, accounts, and community operations have later checkpoints.
- Confirmed in Round 1 Q6: personal use first, community sharing later.

## Presentation and references

- Initial target is a desktop web browser (confirmed in Round 1 Q2).
- Initial interface may be extremely simple.
- Long-term visual direction: clean, rounded, innovative.
- SudokuPad: interaction, authoring workflow, gameplay options.
- Sudoku - The Clean One: visual reference.
- f-puzzles: puzzle authoring reference.

## Delivery and subsystem decomposition

The user confirmed this delivery sequence in Q3 and refined it in Q29/Q37:

1. Create basic puzzles.
2. Play basic puzzles.
3. Solve basic puzzles.
4. Assist classic puzzle construction (inserted by Round 4 Q29).
5. Create and play variants.
6. Solve variants.
7. Add gameplay hints after variant solving is complete (Q37).

'Basic' is classic 9×9 Sudoku. The first-release specification is approved; the roadmap defines delivery checks and explicitly deferred design work for variant assistance, broader customization, community, and AI. A personal saved-puzzle list ships in the first release.

The following are subsystem planning areas, not a replacement delivery order:

1. Board interactions and state/history.
2. Puzzle definition and rule representation.
3. Exact solving and solution counting.
4. Human deduction engine and hint explanations.
5. Authoring tools and assisted construction.
6. Personal library and interoperability.
7. Community discovery and sharing.
8. AI-assisted rule development.

The approved architecture separates exact validity/solution counting from the narrower question of whether the supported human techniques can solve a puzzle. Q38 requests a detailed first-release plan and roadmap, with later subsystem details designed at explicit checkpoints.
