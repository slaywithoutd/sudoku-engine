# Decision log

Updated: 2026-09-12.

Status vocabulary: **Confirmed** = explicit user requirement or answer; **Proposed** = recommendation awaiting an answer; **Superseded** = retained historical decision replaced by another entry.

Current status: all 38 interview questions are answered. Entries are chronological; any historical 'Open details' subsequently settled by D038's approved first-release specification or another later decision are no longer active questions. Unsettled later-phase details are explicitly scheduled in the roadmap under D044.

## D001 — Preserve project knowledge in Markdown

- Status: Confirmed.
- Source: initial user request.
- Decision: record project decisions in Markdown so another chat can resume work.
- Consequence: keep vision, decisions, unresolved questions, reference evidence, and current handoff synchronized.

## D002 — Product scope includes creation, play, and solving

- Status: Confirmed as long-term direction.
- Source: initial user description.
- Decision: plan a platform with all three capabilities, plus personal/community library and future AI-assisted rules.
- Consequence: milestone scope must not silently discard these ambitions. D009/D035/D043 establish delivery order; D044 schedules later design checkpoints.

## D003 — Start with minimal PC board mechanics

- Status: Confirmed.
- Source: initial user request.
- Decision: initially prioritize a simple board, arrow navigation, number entry by clicking, Shift annotations, and Ctrl+Z undo.
- Consequence: keep initial board mechanics small. D007/D013 add the menu and first-release destinations; D038 settles detailed behavior. The earlier board-only scope interpretation is superseded by those clarifications.
- Follow-up: note/input/navigation/history/persistence details are resolved by the subsequent decisions and approved first-release specification.

## D004 — Favor human logic before guessing

- Status: Confirmed as solver direction.
- Source: initial user description.
- Decision: the solver should apply human logic, falling back to guessing/backtracking only when no applicable supported logical step remains.
- Consequence: define the supported technique set, step ordering, explanations, and visible treatment of search. 'No supported step found' must not be confused with 'no logical deduction exists'.

## D005 — Broad customization and shared solving capabilities

- Status: Confirmed as direction; architecture subsequently adopted in D037.
- Source: initial user description.
- Decision: support customizable boards/rules and reuse solver capabilities for hints, with a reusable algorithm repository and eventual AI-assisted extension.
- Consequence: distinguish requested behavior from the suggested factory implementation; D037 selects shared state and rule/technique assembly.

## D006 — Visual direction

- Status: Confirmed.
- Source: initial user description.
- Decision: simple presentation initially; clean, rounded, innovative presentation later, using SudokuPad, Sudoku - The Clean One, and f-puzzles as references.

## D007 — Start menu and separate entry paths

- Status: Confirmed.
- Source: user's Round 1 Q1 answer.
- Decision: start on a menu with three main actions plus configuration: access Library/Explore and select a puzzle to go straight into play; create a puzzle; solve a puzzle.
- Consequence: entering clues and pressing Play is no longer the mandatory application entry flow. Creation and solving have their own entry paths.
- Working labels: Play, Create, Solve, and Settings. Exact wording is not settled.
- Follow-up: D013 settles first-release destination scope and D014 settles initial puzzle entry sources.
- Open details: creation-to-play transition, navigation and unsaved progress, exact library actions, and settings.

## D008 — Desktop web browser first

- Status: Confirmed.
- Source: user's Round 1 Q2 answer.
- Decision: deliver the initial platform in a desktop web browser.
- Consequence: an installed desktop application is not required initially. Hosting, offline support, persistence, and backend execution location remain open.

## D009 — Delivery sequence

- Status: Confirmed.
- Source: user's Round 1 Q3 answer.
- Decision: build capabilities in this order: create basic puzzles → play basic puzzles → solve basic puzzles → create and play variants → solve variants.
- Follow-up: D035 inserts classic construction assistance after classic solving and before variant creation/play; the original relative order remains intact.
- Working interpretation: 'basic puzzle' means classic Sudoku, consistent with the existing 9×9 application; exact first-stage scope will be specified during design.
- Consequence: classic creation and play precede the classic solver; variant authoring/play precede variant solving. This replaces the proposed solver/hints-first priority after board mechanics.
- Follow-up: D010 establishes playable-before-engine-support policy; D013/D038 settle the first release; D035 inserts classic assistance; D043 delays hints until variant solving; D044 schedules remaining stages' design details in the roadmap.

## D010 — Playable rules may precede engine support

- Status: Confirmed.
- Source: user's Round 1 Q4 answer, accepting the recommended distinction.
- Decision: users may create and play puzzles with written/custom rules before the engine understands them. Clearly distinguish playable rules from engine-supported rules.
- Consequence: the platform cannot claim reliable full-puzzle automated hints or uniqueness verification while required rules lack engine support. Any available partial checking must state its scope.
- Open details: capability indicators; whether unsupported operations are disabled or provide explicitly limited results; how mixed supported/unsupported rules are presented; publication policy. Exact capability categories and UI remain to be designed.

## D011 — Configurable puzzle quality and visible status

- Status: Confirmed.
- Source: user's Round 1 Q5 answer.
- Decision: 'perfect' means exactly one solution and a complete logical solving path without guessing. Creators must also be able to target uniqueness alone or allow open puzzles with many solutions. Users must be aware of the puzzle's status.
- Consequence: perfection is an optional quality target, not a condition for every playable puzzle. A uniqueness-only target does not assert that guessing is required; it simply does not require a demonstrated logical path.
- Verification implication: distinguish the creator's requested target from verified properties. Unsupported rules, incomplete checks, and a solver getting stuck cannot establish perfection, uniqueness, or a need for guessing. The exact representation is still to be designed.
- Open details: default selected target; accepted human technique set and meaning of advanced contradiction techniques; verification method and resource limits; solution-count display (exact versus bounded); whether open puzzles require multiple solutions or merely permit them; handling of zero-solution drafts; user-facing labels.

## D012 — Personal use before community

- Status: Confirmed.
- Source: user's Round 1 Q6 answer.
- Decision: initial usable versions serve personal use; community sharing comes later.
- Consequence: multi-user accounts and community sharing are not initial release requirements. The requested Library/Explore menu still needs explicit treatment of future community functionality.
- Open details: personal persistence, backups, hosting, and initial library scope. Personal use does not by itself imply browser-only storage or offline operation.

## D013 — First usable release scope

- Status: Confirmed.
- Source: user's Round 2 Q7 answer.
- Decision: deliver the start menu, classic 9×9 creation and play, a personal saved-puzzle list, and basic Settings first. Clearly mark Solve and community Explore as future features.
- Consequence: release creation/play before implementing the classic solver; the agreed longer-term delivery sequence remains D009. Initial Library serves personal puzzles.
- Open details: exact settings, saved-list actions, future-feature presentation, and acceptance criteria.

## D014 — Manual and text puzzle entry

- Status: Confirmed.
- Source: user's Round 2 Q8 answer.
- Decision: enter clues manually or paste an 81-cell classic puzzle string.
- Consequence: initial import scope does not require SudokuPad/f-puzzles format support.
- Open details: blank-cell symbols, whitespace handling, malformed input feedback, conflict handling, and whether importing replaces an open draft or creates a new one.

## D015 — Shift corner notes initially

- Status: Confirmed.
- Source: user's Round 2 Q9 answer.
- Decision: implement corner annotations first. Holding Shift temporarily uses corner-note entry; releasing it restores the selected tool.
- Consequence: centre notes are deferred. Existing fixed-position 3×3 notes are not the chosen first-release style.
- Open details: corner-note arrangement, modifier handling for onscreen buttons, note toggling, interaction with filled cells, and note preservation/deletion semantics.

## D016 — Single-cell selection initially

- Status: Confirmed.
- Source: user's Round 2 Q10 answer.
- Decision: support single-cell selection first; multi-selection comes later.
- Consequence: drag/modifier selection of multiple cells and batch edits are outside the first release.
- Open details: arrow behavior at board edges, initial selection, selection of givens, and keyboard focus.

## D017 — Creation conflicts and configurable play feedback

- Status: Confirmed.
- Source: user's Round 2 Q11 answer.
- Decision: highlight classic row/column/box conflicts during creation and block finishing creation while any conflict remains. During play, allow mistakes and let the user choose whether conflicts are highlighted.
- Consequence: conflicting clue entry is permitted in an unfinished draft; the restriction applies to finishing creation rather than entering each digit. Creation conflict highlighting is required; play highlighting is configurable.
- Verification scope: these are local classic-rule checks, not checks against a known solution and not proof of solvability, uniqueness, or perfection. A conflict-free draft may still have no completion.
- Follow-up: D021 settles draft autosave and the Finish action; D026 settles the default play-highlighting setting.
- Open details: how blocked completion explains conflicts.

## D018 — Browser-local persistence and file backup

- Status: Confirmed.
- Source: user's Round 2 Q12 answer.
- Decision: automatically save personal puzzles and play progress in the current browser, with JSON file export/import for backup. No cross-browser or cross-device synchronization is required initially.
- Consequence: initial personal persistence does not require server-side accounts or database storage. JSON backup import is separate from the 81-cell puzzle-string entry in D014.
- Open details: browser storage mechanism, schema/versioning, whether backups include settings and undo history, import merge/replace behavior, storage-failure feedback, and handling unfinished drafts.

## D019 — Technology stack open for design

- Status: Confirmed.
- Source: user's Round 2 Q13 answer.
- Decision: no stack preference; propose the best fit during design.
- Consequence: the existing Java/Spring and plain JavaScript stack is an option, not a requirement. Compare approaches against the agreed delivery sequence, browser persistence, interaction needs, and future solver extensibility before choosing.
- Follow-up: D037 approves the browser-first TypeScript/Vite architecture, plain TypeScript views, IndexedDB, and later solver worker. D028 establishes local launch.
- Open details: implementation package versions and stage-specific execution details.

## D020 — Undo boundaries

- Status: Confirmed.
- Source: user's Round 2 Q14 answer.
- Decision: Ctrl+Z undoes value/note edits and erase/reset actions, restoring affected notes. Selection and navigation are outside history. Creation and play keep separate histories.
- Consequence: editing and reset actions must have reversible state changes; movement alone does not consume an undo step. A creation history must not allow a player to alter locked clues.
- Follow-up: D027 confirms history persistence across refresh/reopen.
- Open details: redo, history limits, transitions, and grouping of bulk operations such as import. These boundaries do not imply every library deletion or backup import belongs in board undo.

## D021 — Autosaved drafts and explicit finishing

- Status: Confirmed.
- Source: user's Round 3 Q15 answer.
- Decision: autosave unfinished drafts even when they contain conflicts. Finish checks for conflicts and adds the puzzle to the playable library, with an option to play immediately.
- Consequence: saving work and finishing a playable puzzle are distinct operations. Conflicts block Finish, not draft autosave. Until the solver exists, finished puzzles identify solvability and uniqueness as unverified.
- Open details: exact Finish/immediate-play UI, draft naming/list presentation, empty-board handling, and recovery when saving fails.

## D022 — Edit finished puzzles through draft copies

- Status: Confirmed.
- Source: user's Round 3 Q16 answer.
- Decision: changing a finished puzzle's starting clues creates a new draft copy. Preserve the original puzzle and its play progress.
- Consequence: clue editing must not silently mutate a puzzle used by an existing play session. The copy follows the normal draft/Finish workflow.
- Open details: copy naming, metadata copied, and whether to show a relationship to the original.

## D023 — Preserve notes beneath entered values

- Status: Confirmed.
- Source: user's Round 3 Q17 answer.
- Decision: entering a full-size digit hides existing notes in that cell without deleting them. Erasing the digit reveals the notes again.
- Consequence: player values and annotations must be stored independently; rendering a value must not destroy annotations. Undo restores the appropriate previous value/note state.
- Open details: note entry while a value is present and explicit clearing of notes versus values. Reset remains a distinct undoable action under D020.

## D024 — Manual notes in the first release

- Status: Confirmed.
- Source: user's Round 3 Q18 answer.
- Decision: notes are manual initially. Add optional automatic candidate cleanup later.
- Consequence: placing a digit does not automatically remove that candidate from notes elsewhere in its row, column, or box. This applies independently of whether conflict highlighting is enabled.
- Open details: later cleanup defaults and behavior will be designed when that feature is scheduled.

## D025 — Wraparound arrows and selectable givens

- Status: Confirmed.
- Source: user's Round 3 Q19 answer.
- Decision: arrow navigation wraps to the opposite board edge. Given clues are selectable for inspection but remain uneditable during play.
- Behavior: Left from column 1 goes to column 9 in the same row; Right from column 9 goes to column 1. Up from row 1 goes to row 9 in the same column; Down from row 9 goes to row 1. Navigation does not skip givens.
- Consequence: selecting or navigating onto a given does not permit changing its digit or using Undo to change its clue. Navigation remains outside undo history per D020.
- Open details: initial selection and keyboard focus behavior.

## D026 — Play conflict highlighting off by default

- Status: Confirmed.
- Source: user's Round 3 Q20 answer.
- Decision: start play with conflict highlighting off. Provide a Settings switch to enable it. Creation always highlights conflicts.
- Consequence: the play preference must not disable creation feedback or its conflict check on Finish. These remain classic-rule conflict checks, not solution-based mistake detection.
- Open details: settings scope and persistence behavior within the selected browser storage design.

## D027 — Persist draft and play undo histories

- Status: Confirmed.
- Source: user's Round 3 Q21 answer.
- Decision: save undo history with each draft and play session so it remains usable after refresh or reopening. Keep their histories separate.
- Consequence: persistence must include reversible edit information as well as current values and notes. Restoring saved state must preserve the agreed history boundaries.
- Open details: history limits, storage representation/versioning, and whether exported backups carry history.

## D028 — Localhost launch initially

- Status: Confirmed.
- Source: user's Round 3 Q22 answer.
- Decision: run the initial personal version locally on the user's PC and open it through localhost.
- Consequence: initial delivery does not require hosting or a deployed URL. Provide a reproducible local startup workflow. Local operation does not by itself settle technology choices or installable/offline web-app support.
- Open details: stack-specific startup command, stable local origin for browser storage, and any future hosting plan.

## D029 — Explainable contradiction techniques count as logic

- Status: Confirmed.
- Source: user's Round 4 Q23 answer.
- Decision: allow explainable contradiction techniques within a chosen human technique set to contribute to a perfect puzzle's logical solution path.
- Consequence: temporarily assuming a candidate in a named, explained deduction is not automatically disqualifying. Open-ended guess/backtrack search does not certify perfection. Preserve the distinction in the solving trace and quality result.
- Open details: exact allowed techniques, technique settings/defaults, chain or proof complexity limits, and verification of deductions. Naming an arbitrary search procedure a technique is not sufficient evidence of this agreed logical path.

## D030 — Grow the classic human-technique library incrementally

- Status: Confirmed.
- Source: user's Round 4 Q24 answer.
- Decision: release the classic solver with a small, reliable set of explained human techniques, then expand the technique library over time. When supported techniques stall, it may use clearly identified search.
- Consequence: a broad advanced technique set is not required for the first solver release. A solve that uses search does not verify perfect status; it also does not prove that a human logical path is impossible.
- Open details: initial technique list, ordering, trace representation, search limits, and verification criteria. The visible solver interface remains under Q25.

## D031 — Solved board with expandable explanation trace

- Status: Confirmed.
- Source: user's Round 4 Q25 answer.
- Decision: show the solved board and offer an expandable, ordered step-by-step explanation, including where search was needed.
- Consequence: retain structured reasoning and search-use information during solving so the visible trace reflects the actual solving process. Expanding the trace is optional for the user.
- Open details: step navigation/highlighting, explanation detail, treatment of unsuccessful search branches, and trace display for incomplete or unsatisfiable solves.

## D032 — Initial built-in variant group

- Status: Confirmed.
- Source: user's Round 4 Q26 answer.
- Decision: first implement diagonal Sudoku, killer cages, and thermometers as built-in variants.
- Consequence: apply D009's sequence: authoring/play support for these variants precedes their solver support. Their exact order within the group is not yet chosen.
- Open details: diagonal selection, cage rules and coverage, thermometer shape/overlap semantics, supported combinations, and initial board scope under Q27.

## D033 — Classic base for the first variant editor

- Status: Confirmed.
- Source: user's Round 4 Q27 answer.
- Decision: start variant authoring on a classic 9×9 board with digits 1–9 and classic rules, adding combinable variant constraints.
- Consequence: the initial variant group from D032 can be combined on this base. Custom sizes, symbols, regions, layouts, and classic-rule opt-outs are later scope rather than prerequisites for the first variant editor.
- Open details: constraint parameter semantics, combination validation, and the later customization roadmap. This staged scope does not remove the long-term customization ambition.

## D034 — Irreducible added clues for initial construction assistance

- Status: Confirmed.
- Source: user's Round 4 Q28 answer.
- Decision: the initial creation assistant respects locked clues and seeks a result where no added clue can individually be removed without breaking the requested quality target.
- Consequence: test removability of added clues against the selected target; locked clues are not candidates for removal. This does not promise globally fewest additions or a uniquely determined generated result.
- Verification limitation: a failed or timed-out quality check is not proof that the target is broken. In particular, a logical solver stalling after clue removal does not prove that no qualifying logical path exists. The operational criterion and evidence required for the claim must be defined before implementation.
- Open details: target-specific checks, added-clue versus other editable-element scope, handling unreachable targets, resource limits, and reporting partial or unverified results. Multi-solution targets need their own definition before applying a removal test.

## D035 — Classic construction assistance after classic solving

- Status: Confirmed.
- Source: user's Round 4 Q29 answer.
- Decision: add automatic puzzle-completion assistance after the classic solver, initially for classic puzzles.
- Consequence: refined sequence is classic creation → classic play → classic solver → classic construction assistance → variant creation/play → variant solver. D009's original stages retain their relative order.
- Open details: placement of hints, expansion of assistance to variants, and detailed assistant inputs/verification.

## D036 — Reviewed proposals for AI-generated rule support

- Status: Confirmed.
- Source: user's Round 4 Q30 answer.
- Decision: before AI-generated rule code is registered as trusted engine support, require explicit rule examples, automated validation, and the user's review. AI may draft the rule and implementation before this review.
- Consequence: generation does not automatically register trusted code. Retain a reviewable proposal and evidence; use the reviewed rule version when recording engine capabilities.
- Open details: rule specification format, validation depth, review UI, restricted execution, AI provider/cost, and version migrations. Passing examples alone is not a general correctness proof.

## D037 — Adopt browser-first architecture

- Status: Confirmed.
- Source: user's Round 5 Q31 answer, approving the written platform proposal.
- Decision: adopt `superpowers/specs/2026-09-12-platform-design.md`'s browser-first architecture: TypeScript + Vite, plain TypeScript views, IndexedDB for state/history, and a worker for later solving.
- Scope: adopt the documented separation of puzzle definitions, drafts, play sessions, commands/history, persistence, UI, rule registry, exact solving, human deductions, orchestration, and construction assistance. Compose rules/techniques through shared solver state and a registry rather than generating a monolithic solve implementation per combination.
- Consequence: migrate the small existing implementation during the authorized implementation phase; Java/Spring is not required by the selected architecture. Preserve domain boundaries so later execution changes remain possible. This design approval does not mean implementation has started.
- Follow-up: D038–D044 resolve the remaining Round 5 choices. Later subsystem details are explicitly deferred under D044.

## D038 — Approve first-release behavior defaults

- Status: Confirmed.
- Source: user's Round 5 Q32 answer.
- Decision: adopt `superpowers/specs/2026-09-12-first-release-design.md`, including its screen/lifecycle, input, import, backup, settings, feedback, layout, and acceptance-check sections.
- Included defaults: redo; layered erasure; note entry ignored in filled cells; persistent notes tool; clues only in drafts; one active play session per puzzle; copy-on-edit; string import into a new draft; versioned backups with histories/settings; merge with copies on conflicts and a restore summary; Portuguese UI; light presentation; library deletion confirmation; visible save failures; no silent history trimming.
- Consequence: previously open first-release details settled by that document are governed by this decision. Approval is not evidence that implementation exists or tests have run.

## D039 — Perfect is the default assisted-creation target

- Status: Confirmed.
- Source: user's Round 5 Q33 answer.
- Decision: default the assistant to Perfect: exactly one solution and a complete allowed logical path. Creators may choose other targets.
- Consequence: a selected target does not itself confer verified status; evidence remains required.

## D040 — Open permits any positive solution count

- Status: Confirmed.
- Source: user's Round 5 Q34 answer.
- Decision: Open requires at least one solution, with uniqueness optional. Display verified status separately.
- Consequence: both single- and multiple-solution puzzles qualify; zero-solution puzzles do not. Finding one solution establishes existence without establishing an exact count. If existing clues already admit a solution, no added clue may be necessary.
- Later scope: requested exact counts/ranges are not required for the first assistant.

## D041 — First assistant adds clues without changing entered clues

- Status: Confirmed.
- Source: user's Round 5 Q35 answer.
- Decision: treat all entered clues as locked and add digits only to empty cells in the first classic assistant.
- Consequence: no original clue may be changed or removed. Individual unlock controls and editing/removal of original clues are later scope.

## D042 — Configurable work limits and honest incomplete results

- Status: Confirmed.
- Source: user's Round 5 Q36 answer.
- Decision: solving and construction have configurable time limits and Cancel. If the requested property cannot be verified in budget, return an explicit incomplete/unknown result.
- Consequence: partial work cannot establish unsatisfiability, uniqueness, perfection, or irreducibility without the required evidence. Preserve any independently verified properties while identifying unverified ones.
- Later design: concrete default limits and progress granularity require representative benchmarks at the solver/assistant stages.

## D043 — Gameplay hints follow variant solving

- Status: Confirmed.
- Source: user's Round 5 Q37 answer.
- Decision: defer gameplay hints until variant solving is complete.
- Consequence: no solver-backed gameplay Check, next-step hints, candidate fill, reveal, or correction tools are required during classic solving or classic assistance. The agreed first-release conflict highlighting and valid-full-board completion checks remain included; they are ordinary gameplay feedback, not solver-backed hints.
- Architecture: retain reusable explanation steps during solver implementation so hints can consume them later. The solver's own expandable trace remains included in the classic solver stage.

## D044 — Detailed first-release plan with later design checkpoints

- Status: Confirmed.
- Source: user's Round 5 Q38 answer.
- Decision: produce a detailed first-release implementation plan and full milestone roadmap. Defer exact later variant mechanics, advanced hints, custom geometry, community, and AI execution/provider details to their own design phases before implementation.
- Consequence: the current interview is complete for the agreed planning scope. Do not continue asking later-phase implementation details now or silently treat them as settled. The roadmap records dependencies and the questions to resolve at each checkpoint.
- Deliverable boundary: finish planning documents now; application implementation is a subsequent task, not part of this planning deliverable.

## Resolved proposals

| ID | Disposition | Result |
| --- | --- | --- |
| P001 | Replaced by user's alternative. | D007: start menu with separate Play, Create, and Solve paths plus configuration. |
| P002 | Accepted. | D008: desktop web browser first. |
| P003 | Replaced by user's sequence. | D009: classic creation → classic play → classic solver → variant creation/play → variant solver. |
| P004 | Accepted. | D010: allow creation/play before engine support and distinguish support clearly. |
| P005 | Refined by user. | D011 defines quality choices; D039 later makes Perfect the default and D040 settles Open. |
| P006 | Accepted. | D012: personal use first, community sharing later. |
| P007 | Accepted. | D013: first release includes menu, classic creation/play, personal saved list, basic Settings; Solve/community Explore are future features. |
| P008 | Accepted. | D014: manual clue entry and 81-cell puzzle string import. |
| P009 | Accepted. | D015: temporary Shift corner notes; centre notes later. |
| P010 | Accepted. | D016: single-cell selection first; multi-selection later. |
| P011 | Refined by user. | D017: creation highlights conflicts and blocks finishing; play highlighting configurable. D026 later sets play highlighting off by default. |
| P012 | Accepted. | D018: automatic browser-local puzzle/progress saving with JSON file backup export/import; no initial device/browser sync. |
| P013 | Replaced by user's preference. | D019: no stack preference; propose best fit during design. |
| P014 | Accepted. | D020: undo edits/erase/reset with notes, exclude navigation, and separate creation/play histories. |
| P015 | Accepted. | D021: autosave even conflicting drafts, explicitly finish into the library, offer immediate play, and identify unverified solver properties. |
| P016 | Accepted. | D022: create a draft copy when changing finished clues; preserve original puzzle and progress. |
| P017 | Accepted. | D023: retain notes hidden beneath values; erasing a value reveals them. |
| P018 | Accepted. | D024: manual notes initially; optional automatic cleanup later. |
| P019 | Replaced by user's alternative. | D025: wrap to the opposite edge; givens selectable but locked during play. |
| P020 | Accepted. | D026: play conflict highlighting off by default, configurable in Settings; creation highlighting always on. |
| P021 | Accepted. | D027: persist separate draft/play undo histories across refresh/reopen. |
| P022 | Accepted. | D028: run locally on the user's PC and access localhost initially. |
| P023 | Accepted. | D029: explainable contradiction techniques within the chosen human technique set may qualify for perfection. |
| P024 | Accepted. | D030: grow explained classic techniques incrementally, with identified search fallback that does not certify perfection. |
| P025 | Accepted. | D031: solved board plus expandable ordered explanation trace that identifies search. |
| P026 | Accepted. | D032: initial built-in variants are diagonal, killer cages, and thermometers. |
| P027 | Accepted. | D033: initial combinable variants use classic 9×9/digits 1–9; broader board customization later. |
| P028 | Accepted. | D034: preserve locked clues and seek no individually removable added clue under the selected quality target; no global-minimum guarantee. |
| P029 | Accepted. | D035: classic construction assistance follows classic solving and precedes variant work. |
| P030 | Accepted. | D036: examples, automated validation, and user review precede trusted AI-generated rule registration. |
| P031 | Accepted. | D037: adopt the written browser-first TypeScript/Vite/IndexedDB architecture, plain views, and later solver worker. |
| P032 | Accepted. | D038: approve the written first-release defaults. |
| P033 | Accepted. | D039: Perfect is the default assisted-creation target. |
| P034 | Accepted. | D040: Open accepts any positive solution count. |
| P035 | Accepted. | D041: first assistant preserves all entered clues and only adds digits. |
| P036 | Accepted. | D042: configurable limits, cancellation, and honest incomplete outcomes. |
| P037 | Replaced by user's alternative. | D043: gameplay hints wait until variant solving is complete. |
| P038 | Accepted. | D044: detailed first-release plan, full roadmap, and explicit later design checkpoints. |

## Current unresolved scope

All 38 interview questions are answered. There are no pending proposals for this planning scope. Historical entries retain the context of questions that were open when recorded; subsequent decisions and the approved specifications supersede those open details. Remaining later-phase questions are explicitly deferred to the roadmap checkpoints under D044.

Record each answer here with its rationale and consequences. If an answer changes a confirmed decision, retain and mark the older entry superseded.
