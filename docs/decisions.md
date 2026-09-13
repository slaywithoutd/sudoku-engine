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

All 38 interview questions are answered. The expanded M2 specification, concrete contracts, bounded technique matrix and complete 27-task plan are ready for review under D059–D064; solver implementation is not authorized. Explain is the default of two modes, and Perfect excludes uniqueness-dependent paths. No new product question blocks this proposal. Cost-table calibration, phase share, resource defaults and rollout benefit have explicit future benchmark gates, not measured answers. Historical entries retain their original context; subsequent decisions and approved specifications supersede earlier details. Other later-phase questions remain deferred under D044.

Record each answer here with its rationale and consequences. If an answer changes a confirmed decision, retain and mark the older entry superseded.

## D045 — Reserve inherited object keys for record IDs

- Status: implementation detail under D038, 2026-09-12.
- Decision: runtime validation and ID allocation reject all own Object.prototype property names plus prototype, not only the three example dangerous IDs in the plan.
- Reason: independent review reproduced inherited-key collisions in session lookup and restore. UUID-generated product IDs are unaffected; malformed backups reject atomically.

## D046 — M2 design authorization and preserved requirements

- Status: Confirmed, 2026-09-12.
- Source: user's M2 continuation request after verified implementation `66b8381` and documentation `2507adc`.
- Decision: produce a reviewable classic solver specification and detailed implementation plan, update Markdown progress/decisions and make focused local commits. Do not implement the solver before design approval or restart the completed first-release interview.
- Confirmed scope: browser-first TypeScript/Vite/plain views/IndexedDB; worker execution; human-first baseline singles/intersections/pairs; ordered expandable trace and solved board; separate evidence-backed count classification; configurable limits/Cancel with honest incomplete status; isolated snapshot with no play-progress overwrite. Search-assisted completion cannot certify Perfect. Hints wait for M5; construction, variants, community and AI are outside M2.
- Repository inspection: clean `release/first-release` at `2507adc`, no applicable AGENTS.md; documentation branch `docs/m2-solver-design` preserves that release head.
- Later inspection: concurrent uncommitted UI/layout changes appeared under `web/`; they were preserved and excluded from the M2 documentation commits. The spec/plan account for the observed sidebar and optional board controls container without approving or reverting that work.
- Deliverables: [M2 specification](superpowers/specs/2026-09-12-m2-classic-solver-design.md) and [implementation plan](superpowers/plans/2026-09-12-m2-classic-solver.md). D047–D052 are recommendations, not newly confirmed user behavior.

## D047 — Temporary original-clue solver workspace

- Status: Proposed for M2 review.
- Decision: Home Solve opens a dedicated temporary workspace with manual/string input or copied live draft/finished-puzzle clues. Never read player entries/notes as solver constraints. Input/results survive in-app navigation; leaving cancels active work; refresh clears the workspace. Optional Save Clues creates a normal independent draft.
- Persistence recommendation: results, trace and limit preference remain memory-only. No IndexedDB/library/backup version changes and no saved puzzle verification metadata. Existing draft/play autosaving remains intact. Clearly label temporary analysis and clarify library/player copy about the absence of saved analysis.
- Rationale: fits the inspected controller/repository boundaries and avoids introducing certificate lifecycle/restore semantics before M2 evidence is tested. Durable result storage would need a later explicit migration/backup design.
- Current contract: revised screen specification §§2–3, engine contracts §9 and plan T23–T25; historical task/section numbering is superseded by D059.

## D048 — Deterministic candidate and explanation baseline

- Status: Proposed for M2 review.
- Revision: the fixed six-technique-only scope and flat-only proof/order contract are superseded by D054–D057. Keep this entry as the initial kernel proposal, not the final requested engine capability.
- Decision: 9-bit masks separate from manual notes; monotone checked candidate state; ordered naked single → hidden single → locked pointing → locked claiming → naked pair → hidden pair. Restart at singles after every productive pattern; define precise unit/cell/digit tie breaks, all row/column/box pair coverage and both intersection directions.
- Explanation contract: versioned typed premises/effects/revisions with explicit peer eliminations; no hidden cascading placements. Retain full human prefix and labeled search boundary/completion, successful guess path and failed-branch summary counts. Exact count enumeration is separate from the human explanation trace.
- Historical rationale: deterministic replay and soundness checks were practical for the initial small technique set. The former advanced-technique exclusion is superseded by D054/D060; no full fallback search-tree trace remains the proposal.
- Current contract: engine contracts §§3–6 and technique matrix; plan T03–T19. The old six-technique-only order is not executable scope.

## D049 — Exact evidence checked against original clues

- Status: Proposed implementation method; evidence requirements remain Confirmed by D011/D030/D042/D046.
- Revision: independent count evidence remains required; the logical profile expands under D054 and Perfect's exclusion of uniqueness-dependent paths is confirmed in D056.
- Decision: resumable MRV depth-first exact enumeration with singles propagation starts from original givens after the human pass. Count at most two distinct validated witnesses; unique/zero requires exhausted root search except direct duplicate-clue zero proof. A human solution establishes existence but is not pre-added to the exact enumeration counter.
- Consequence: one witness with unfinished checking remains unknown with lower bound one; two witnesses establish at least two, never exactly two. Count-only search does not mark a complete human path search-assisted. Perfect evidence requires independent unique classification and complete replay-valid baseline deductions with no fallback, and is not a quality label for already-complete input.
- Inconsistency policy: quarantine incompatible human evidence; discard exhaustion that contradicts a validated witness. Preserve independently validated evidence without silently selecting a contradictory conclusion.
- Rationale: counting from human-pruned candidates would allow a bad deduction to create false uniqueness. Runtime DFS plus a separate test-only exact-cover oracle gives distinct correctness checks without multiple production engines.
- Current contract: engine contracts §7; plan T01/T06/T20/T25. D063 adds a proposed human-phase ceiling without changing original-clue count independence.

## D050 — Identity-bound checkpoints and immediate cancellation

- Status: Proposed for M2 review.
- Decision: one dedicated worker per run; exact snapshot content key, local input revision, snapshot UUID and fresh request UUID accompany versioned sequenced messages. Source library revision is provenance, not the freshness authority for unrelated saves. The former full-checkpoint transport is superseded by D062's bounded proof chunks and atomic complete-step acceptance.
- Cancellation: controller terminalizes the request before terminating the worker; preserve only previously accepted evidence and ignore every late message. Navigation and total-budget watchdog use the same ordering. No acknowledgement-dependent Cancel protocol or shared memory. Typed startup/runtime/protocol errors preserve prior valid evidence.
- Rationale: a worker may be aborted without flushing its discoveries; a blocked worker cannot acknowledge a cancellation message promptly. Immediate identity invalidation resolves result/Cancel races without writes to the original record.
- Current contract: engine contracts §8; plan T21–T25. Browser-standard/Vite sources are linked beside the contracts.

## D051 — Proposed total time budget and benchmark gate

- Status: Proposed and unmeasured; configurable limits/Cancel remain Confirmed under D042/D046.
- Decision: one total 1–120 integer-second limit, default 10 seconds, covering validation/human/exact work and startup; rerun restarts from original clues. Target 8 ms worker slices and 100 ms routine progress; emit evidence milestones immediately. Main watchdog plus worker-local deadline stop unfinished checks without inventing conclusions.
- Validation required: independent labeled corpus, production Chromium measurements on the user's PC, separate documented slower CPU-throttle profile, cold/warm trials, first-witness versus final-count latency, cancellation/deadline latency, payload/UI cost and cleanup stability. Specification §9 defines proposed numeric targets; they are not measured performance promises.
- Consequence: actual benchmarks and any revised defaults must be recorded before release. No research-source timings substitute for this implementation's measurements.
- Current contract: engine contracts §§7–9; plan T19–T26. D063 replaces the original all-fixtures-at-default-time target with coverage and measured performance gates suitable for the expanded corpus.

## D052 — Independent solver correctness and acceptance evidence

- Status: Proposed verification method under confirmed solver-correctness requirements.
- Decision: test-only set-based Algorithm X oracle and separate plain grid checker, neither importing production solver/checking internals. Use independently labeled original-clue fixtures, satisfiable candidate-state technique fixtures, per-elimination forcing/per-placement forbidding, trace replay mutation tests and seeded differential transformations.
- Acceptance: real worker tests plus deterministic injected-clock/race tests; duplicate/unsatisfiable/unique/multiple/full/empty cases; no false uniqueness/Perfect on interruption or search; source and session/history/backup isolation; English accessible result/trace under D053 and production-build verification.
- Rationale: detector fixtures or production output alone cannot grade solver correctness independently. Oracle timeouts are inconclusive tests, not proofs. Benchmark evidence must distinguish measured facts from proposed targets.
- Current contract: technique matrix §7 and the revised plan's requirement map. A future `docs/m2-solver-verification.md` will record execution evidence; it is not claimed during design.

## D053 — English interface, fixed note positions and repeat-value erasing

- Status: Confirmed by the user and implemented on 2026-09-12.
- Presentation: English throughout the application, including navigation, dialogs, feedback, errors and accessible labels. Use Sudoku Engine as the name. Keep the sidebar, straight continuous grid and no outer frame. Paint every thick box separator above every thin line. Increase number sizes and use squircle curves for buttons and cell highlights; the user explicitly confirmed that the grid itself should remain straight.
- Notes: place 1–3, 4–6 and 7–9 in fixed rows of a 3 × 3 grid inside the cell. Removing candidates leaves their positions empty. This supersedes the original packed corner-note presentation while keeping the existing sorted notes data and manual-note rules.
- Input: in value-entry mode, entering the selected cell's current editable digit again is an erase action. Retain hidden notes, record an undoable erase and support redo. This applies to pointer buttons and keyboard/numpad input in creator/player. Givens remain locked; the Notes tool continues to operate only on empty cells. Ignore repeated numeric keydown events so holding a key cannot oscillate values.
- Compatibility: new/in-memory settings use `language: "en"`; the shared library/backup validator accepts both legacy `pt-BR` and `en`, normalizing to `en`. Keep the version-1 record graph, names and histories intact. No bulk renaming of existing records. Earlier releases may not accept newly exported English-language backups; backward reading in the current release is covered.
- Precedence: this user instruction supersedes earlier Portuguese UI requirements, including Portuguese labels/examples in pending M2 documents. It does not authorize solver implementation or change the remaining M2 recommendations.
- Evidence: [UI refinement verification](ui-refinement-2026-09-12.md). Squircle CSS is verified in Chromium; unsupported browsers retain rounded corners.
- User follow-up: inset the cell squircle by 5% on every edge so its contour looks intentional. Apply the gap to hover, selection, focus and conflict backgrounds while preserving the full rectangular hit area, centered digits and fixed note positions.

## D054 — Broaden the solver into a researched deduction engine

- Status: Confirmed direction, 2026-09-12; implementation remains unauthorized.
- Source: user objected to limiting the solver to the six baseline techniques, requested research and inclusion of logical deduction techniques, and proposed board/technique scoring inspired by chess engines. The user also requires the architecture to anticipate interacting constraints now.
- Decision: expand the design target beyond the initial kernel to an explicit technique-family/alias/coverage catalogue; investigate adaptive scheduling and choosing useful deductions. Do not silently substitute the original small M2 scope for this request. The future variant UI remains in its existing milestones, but the shared constraint/proof boundary belongs in the engine design now.
- Consequence: D048's fixed-only scope/order and the initial ten-task plan were superseded by the expanded contracts and 27-task plan under D059. Preserve their isolation/count/cancellation safeguards. “All techniques” is a coverage goal, not an unverified universal completeness claim; state supported families and finite proof/search bounds explicitly.
- Research artifact: [expanded engine proposal](superpowers/specs/2026-09-12-m2-engine-expansion-design.md), including primary-source findings, catalogue, scheduler alternatives, mixed-constraint contracts and planning impact.

## D055 — Explain and Analyze modes, defaulting to Explain

- Status: Confirmed by explicit user answer, 2026-09-12.
- Question: when the easiest explanation and fastest solving path differ, what should the solver prioritize?
- Answer: offer Explain and Analyze modes, defaulting to Explain.
- Interpretation proposed for review: Explain favors simpler checked proofs, with useful detector ordering inside complexity tiers. Analyze favors expected verified progress per computational budget and may compare bounded continuations of proven deductions. Both retain explanations, honest count evidence, human-first behavior, limits and Cancel.
- Unconfirmed technical details: exact ranking formula, weights, proof tiers and rollout budgets. Benchmark these against simple deterministic policies before claiming a benefit.

## D056 — Perfect excludes uniqueness-dependent deductions

- Status: Confirmed by explicit user answer, 2026-09-12.
- Question: whether a path using uniqueness-dependent techniques after independent uniqueness verification should qualify as Perfect.
- Answer: require Perfect deductions to follow from clues and rules alone; show uniqueness-dependent paths separately.
- Consequence: Unique Rectangles, BUG-style techniques and any derived proof inheriting a uniqueness assumption cannot supply Perfect's logical-path requirement. They may be shown in separate analysis after independent uniqueness and their other premises are established. No circular uniqueness proof and no hiding the dependency inside a chain.
- Preserved direction: named, fully explained contradiction techniques remain eligible under D029 when their temporary assumptions are discharged using clues/rules. A search-assisted completion remains ineligible; independently proven uniqueness remains separately necessary.
- Variant implication: even proven full-puzzle uniqueness does not automatically validate a classic rectangle-swap argument under extra constraints. Require a valid rule-preserving proof or declare the technique classic-only.

## D057 — Adaptive scheduling with independently checked proofs

- Status: Proposed architecture/implementation approach for D054–D056.
- Decision: event-driven work queues and sound precondition filters, followed by estimated utility/cost ordering; score already proven deductions separately from deciding which detector to run. Compare optional bounded deduction-path rollout against simpler policies. Scores rank computation and cannot validate a candidate, prove count properties or justify skipping active rules.
- Engine boundary: one normalized constraint problem, shared candidate/fact indexes, versioned rule capabilities, reusable reasoning families and a separate proof checker. Distinguish small all-different scopes from full digit-covering houses. Mixed-rule deductions cite every needed constraint. Exact counting continues from the complete original problem in separate state.
- Proof/evidence: graph-shaped proofs with explicit assumption scopes and provenance; mode/profile/scheduler/rule identities; fair scheduling and honest bounded-stall/incomplete statuses. Revise full-trace worker checkpoints to bounded proof batches with atomic acceptance and cancellation during verification. Numerical limits remain proposals.
- Validation: independently checked technique fixtures, proof mutation tests, scheduling ablations, held-out/adversarial corpora, mock multi-constraint contracts, worker backpressure/races and no play-state writes. Reference sources demonstrate related ideas, not a measured speedup or complete technique coverage for this project.
- Next checkpoint: review the now-complete contracts, bounded matrix and revised plan under D059–D064, then obtain implementation authorization. No application code changed in these design passes.

## D058 — Light and dark modes with five pastel themes

- Status: Confirmed by the user and implemented on 2026-09-12.
- Choices: independent Light/Dark mode and Blue/Green/Pink/Purple/Gray theme controls in Settings → Appearance. Switching mode retains the chosen color; all ten combinations are available. Default to light green to preserve the existing appearance preference. No additional system mode or custom colors.
- Presentation: soft tinted surfaces and pastel accents with readable text, shared across the sidebar, board, controls, fields, dialogs, feedback and recovery states. Preserve the inset squircles and grid geometry. Radio groups have text labels, visible selected/focus indicators and native keyboard navigation.
- Persistence: `settings.colorMode` and `settings.theme` use the existing atomic IndexedDB save path. Changes apply immediately to the document root. Version-1 libraries/backups without either field receive its default; explicit invalid values are rejected. Names, puzzle data and histories are preserved. Existing backup settings opt-in also controls appearance restoration.
- Scope: appearance only; preserve the separate M2 design work and legacy Spring files. No solver functionality or appearance-specific storage service was added.
- Evidence: [appearance verification](appearance-verification.md).

## D059 — Complete expanded M2 planning, preserve newer work

- Status: Confirmed planning authorization, 2026-09-12; proposed technical details remain subject to review.
- Source: user's continuation explicitly requested inspection, completed design/interfaces/coverage/plan, consistent Markdown, verification and focused local commits; design and planning only.
- Inspection: clean `docs/m2-solver-design` at `80471d2`, preserving expanded research `24e0d25` and newer D058 appearance implementation; no applicable AGENTS.md. Current application/test/configuration and verification records were read.
- Deliverables: [revised screen specification](superpowers/specs/2026-09-12-m2-classic-solver-design.md), [research rationale](superpowers/specs/2026-09-12-m2-engine-expansion-design.md), [concrete contracts](superpowers/specs/2026-09-12-m2-engine-contracts.md), [coverage matrix](superpowers/specs/2026-09-12-m2-technique-coverage.md), [complete 27-task plan](superpowers/plans/2026-09-12-m2-classic-solver.md). These replace the old six-technique/ten-task contracts.
- Gate: no solver code before explicit design approval; no repeated first-release interview. Current [planning verification](m2-design-verification.md) checks documentation, not solver runtime.

## D060 — Finite broad coverage and proof-family acceptance

- Status: Proposed implementation contract under confirmed D054/D056.
- Decision: 33 primary and five conditional matrix rows with aliases, prerequisites, grammar, supported parameter classes, positive/negative/boundary/original-clue fixtures and independent force/forbid acceptance. Every requested family retains a bounded implementation task; intermediate kernel delivery cannot be called completed M2.
- Bounds include basic fish 2–7, complex fish 2–4, <=4 fins, ordinary chains <=24 links, generalized chains <=12 pairs, ALS <=5 cells, forcing nesting <=2, local specialized pattern certificates, template single/pair/triple overlay, and conditional rectangle/loop/BUG forms. Non-Junior Exocet and unproved/generalized extensions are explicitly outside these finite bounds.
- Correctness: names do not establish proofs. Every claimed form must satisfy its named grammar and independent fixtures. Generalized whips/braids are distinct from AICs. Local finite tables are allowed only within declared pattern grammars, never an arbitrary exact solution relabeled as logic.
- Release consequence: missing named acceptance is a failed row gate, not permission to silently remove the family. No universal “all techniques” completeness claim. Matrix statuses are specified, not implemented or verified.

## D061 — Shared semantic state and checked proof graph

- Status: Proposed architecture under D054/D057.
- Decision: canonical full-rule problem identity, static RuleModule registry, checked all-different versus digit-cover capabilities, one shared monotone domain/fact state per branch, and typed resumable discovery. Filled cells retain singleton domains; assignments are separate, superseding the old zero-mask convention.
- Checking: clue/rule/domain roots, resolution/count/table primitives, exhaustive cases, scoped assumptions/discharge, inherited rule provenance and non-dischargeable uniqueness dependency. Only an opaque checked step can enter the atomic reducer. Candidate initialization and mechanical peer effects have proof roots too.
- Invalidation: central ChangeSet, exhaustive support indexes, transitive dependency watches, initially conservative global graph invalidation and cold-rebuild differential tests. Cache identity includes problem/branch/revision/versions; registration order cannot change semantics.
- Composition: small test-only sum/order/all-different modules prove shared-candidate and cross-rule interactions; production remains classic-only. Missing complete-rule semantics fails assembly, never a partial full-puzzle claim.
- Contract: engine contracts §§1–5; plan T02–T05/T08.

## D062 — Credit-controlled proof streaming and atomic acceptance

- Status: Proposed protocol replacing D050's full-checkpoint payload shape.
- Decision: protocol 2 binds operation/mode/profile/scheduler/checker/exact/options and parent uniqueness evidence as well as snapshot/request identity. One worker and one pending proof step; bounded begin/chunk/end transport, node dependencies and contiguous message sequence.
- Backpressure: ACK after bounded safe chunk staging grants transport credit; a separate accepted-step response follows complete main-thread checking and atomic candidate/trace commit. This avoids deadlock for proofs larger than the two-chunk window. Worker cannot build the next dependent revision before acceptance.
- Phase boundary: a separate stop-human/human-stopped exchange reconciles the accepted revision before abandoning a pending proof for reserved exact work. It does not replace immediate acknowledgement-free Cancel.
- Proposed hard transport caps: 64 KiB chunks, two unacknowledged chunks, 32 KiB control packets, 16 KiB individual nodes; incremental UTF-8 encoding/decoding and main-thread check tasks. Apply cumulative node/byte limits before allocation. No partial proof effects, giant JSON parse or repeated full traces.
- Cancellation: invalidate active identity before cleanup/terminate; discard staged proof, retain accepted evidence, ignore late callbacks. Same behavior for navigation/watchdog/errors. Deadline checked at receipt and immediately before commit; tie favors timeout. Terminal success cannot bypass a pending step.
- Contract: engine contracts §8; plan T21–T25.

## D063 — Scheduling, phase reserve and unmeasured resource defaults

- Status: Proposed, explicitly unmeasured; confirmed requirements remain D042/D055/D057.
- Policy: fixed-work quanta, canonical ties, every fourth quantum serves oldest eligible job; Explain completes lower tiers before claiming their exhaustion, Analyze compares at most four checked steps. Score detector opportunities separately from proved-step usefulness. Frozen integer estimates, no online/persistent learning; safe filters prove absent prerequisites rather than low payoff.
- Lookahead: bounded proof-only Analyze rollout initially off by default. Benchmark <=4 candidates, <=16 cheap continuations and <=10% remaining work (cap 8,192); no guesses, exact calls or speculative fact leakage.
- Phase reserve: proposed human ceiling 70% of total time/work, then independent original-problem exact checking with remaining budget. Early logical completion/stall lends unused time to exact. Reaching the ceiling is incomplete logical coverage and explicitly identified fallback, not stall. Compare 50/70/unreserved policies.
- Proposed controls: 10-second default, integer 1–120; 2,000,000 work units, 500,000 exact nodes, 4,096 proof nodes/step, 65,536/run, 1 MiB/step and 8 MiB/run, adjustable ranges in contracts §9. Accounted engine workspace target 64 MiB is not a heap guarantee. All defaults, phase ratios, scores and latency targets await production benchmarks.
- Gate: independent correctness/coverage first; held-out policy/rollout ablations, baseline/throttled cold/warm latency/work/heap/transport/cancel/cleanup measurements. Advanced stress cases may honestly be incomplete at defaults; generous deterministic fixture checks still gate advertised support. No speedup asserted; defaults/profile changes must update decisions and review evidence, not silently weaken coverage.

## D064 — Volatile primary and conditional analysis, review disposition

- Status: Proposed flow/persistence detail under D047/D056; English/appearance preservation confirmed by D053/D058.
- Decision: one temporary input and primary result plus at most one conditional result; navigation cancels but retains accepted memory state, reload clears it. Modes/limits/technique profiles/results are memory-only. No IndexedDB/library/backup migration or hidden storage. Existing D058 appearance preferences remain durable.
- Conditional action is enabled only after independent unique evidence for the same original problem; fresh request rechecks unconditional prefix, retains primary board/count, never uses exact solution digits as premises, never qualifies for Perfect. Primary rerun/input edit invalidates conditional results; conditional Cancel/rerun preserves primary result.
- User flow: manual/paste/live-draft/original-puzzle clues inside Solve, English read-only results/expandable proof graph/coverage ledger/separate solution verification, configurable advanced limits and explicit Save Clues as Draft. No gameplay hints. Preserve all play/session/history/settings state except that explicit new draft action.
- Review: no unresolved product question blocks the completed specification/plan. Approval concerns the concrete proposed choices; measured calibration remains an implementation gate. Implementation still requires explicit design approval.


## D065 — Approve expanded M2 design and begin implementation

- Status: Confirmed by the user, 2026-09-12.
- Source: explicit approval of the completed expanded design and implementation plan at `0e98c2b`, followed by permission to start implementing.
- Decision: execute the approved 27-task plan and its bounded 38-row coverage contract, preserving existing application work and all evidence/isolation safeguards. Earlier design-only gates are satisfied by this approval; historical planning records remain historical evidence.
- Workspace: isolated `.worktrees/m2-engine` on `feat/m2-engine`, based on `f3eb4ac` (approved planning plus workspace ignore rules); the original checkout retains `docs/m2-solver-design`.
- Progress and runtime evidence: [M2 implementation record](m2-implementation-progress.md). Task completion requires actual tests and review; approval does not make any technique implemented or verified.

## D066 — Document engine reasoning and use purposeful object-oriented design

- Status: Confirmed coding preference from the user, 2026-09-12.
- Decision: document public contracts, invariants, proof reasoning, identity/lifecycle ownership, resource limits and non-obvious algorithm choices in the code. Explain why a deduction is sound and why a boundary exists; avoid comments that merely repeat syntax.
- Implementation approach: prefer cohesive classes owning state/lifecycles, Strategy interfaces for rules/detectors/policies, registries/factories for compatible assembly, and observer/subscription boundaries for application state where these improve clarity. Favor composition over inheritance. Immutable value records and small mathematical/validation functions remain pure functions where classes add no value.
- Compatibility: retain the approved public operations through methods or thin function entry points; use documented adapters rather than breaking downstream signatures gratuitously. Do not add a DI framework, pattern boilerplate, broad inheritance hierarchy or unrelated M1 refactoring.

## D067 — Enforce proof identity and finite initialization at implementation boundaries

- Status: Technical implementation refinement under approved D059–D065, 2026-09-12; no product scope change.
- Decision: bind retained proof nodes to the exact premises originally checked, in addition to problem/branch/revision and numeric IDs. Independently checked proposals can reuse IDs, so numeric membership alone cannot authenticate their combined graph. Recheck deserialized nodes; keep checked-step construction private and runtime authenticated.
- Root preflight enforces at most 81 cells, nine symbols, 256 declared rules, 256 all-different capabilities, 2,304 covers, 81 cells per scope and 2,978 original/capability roots before synchronous allocation. Smaller domains exist for tests, not custom-grid UI support. Finite relation roots enter through T05's checked mock composition. Profile assembly must additionally reject more than 256 combined rule/technique jobs.
- Shared resource-limit values live in `solver/limits.ts`; proof types own assumption policy. T04 brings forward only the elementary proof primitives needed for authentic candidate-state tests; T05 retains the remaining proof algebra. Tests cannot manufacture accepted steps through a cast or unchecked factory.
- Bounded staging yields between checked nodes. T03's internal header allowance is 32 KiB because it includes both proposal and proof StateKeys; protocol 2 still limits an individual serialized wire node/header to 16 KiB and an enclosing control packet to 32 KiB. These are distinct representations with separately accounted bytes. T26 must measure responsiveness; functional tests do not validate the proposed 4 ms slice target.
- Evidence and actual implementation state: [implementation record](m2-implementation-progress.md) and [architecture guide](solver/architecture.md).

## D068 — Represent finite table proofs as bounded checked definitions

- Status: Technical representation refinement during approved T05 implementation, 2026-09-12; no technique-family scope reduction.
- Problem: a 6,561-row local table or a large join cannot be inlined into one 16 KiB proof node. Bounded transport alone does not solve an oversized logical representation.
- Decision: add the table proposition `{kind:"table", cells, count, definition:NodeId}` and `table-union@1` to the primitive language. Actual immutable defining-node identity authenticates table data; same cells/count cannot substitute a different table. Small explicit relation tuples remain valid.
- Primitive-version structural bounds are 16 table cells, definition depth 64 and at most 256 rows in an explicit projected relation, additionally limited by node bytes. Test relation roots are capped at 256 relations, 16 cells/256 tuples/2,048 scalar tuple entries each, consuming the existing global root pool. Registered mock rule scalar parameters are limited to 16 integer/boolean fields; production registration remains classic-only. These bounds do not establish measured performance or extend product scope.
- Filter leaves cover at most 256 Cartesian tuples in a declared input box. Union nodes verify identical source-domain/constraint identities and a disjoint exhaustive partition on one axis. Partial leaves cannot authorize a join/projection. Complete definitions preserve exact assumptions and rule provenance; table checking yields and charges bounded tuple/pair work instead of storing or traversing unbounded row arrays.
- Small relation projection checks exact deduplicated columns/rows within the existing node-byte cap. General table-to-table projection remains unsupported in this primitive version; complete definitions can instead project bounded relations or effects. Authentic effect-free proof retention preserves candidate revision while expanding the checked prefix, and therefore requires its own atomic bundle acceptance and cumulative accounting.
- This is a local proof representation, not permission for whole-grid completion enumeration inside logical techniques. Named grammar bounds and independent counterfactual fixtures still apply. All definition data counts toward proof/work/workspace limits; cancellation or truncation cannot become completeness.
- Acceptance must reject equal-size different tables, omitted partitions and partial-leaf projections, and include a complete table whose input has more rows than a single bounded leaf. Actual status remains in [implementation progress](m2-implementation-progress.md).

## D069 — Bind quality to the operation and authentic accepted path

- Status: Technical implementation refinement under approved T06, 2026-09-13; no product behavior change.
- Problem: the original five-argument quality sketch cannot identify a conditional operation that happens to contain only unconditional steps, and a checked proposal is not necessarily an accepted step.
- Decision: require `QualityContext` containing RunKey, Assembly and authentic initial/accepted ReadViews. Candidate ownership validates the exact original-root anchor and accepted step sequence, including proof-only bundles; quality checks primary operation explicitly and validates final complete rules. Prefer lightweight private lineage metadata over synchronously rebuilding every historical candidate map or retaining every prior full view.
- Evidence merging receives explicit active primary exact run/phase context before accepting process exhaustion, validates full identity/method/statistics and preserves independently valid witnesses when inconsistent claims are rejected. One witness still proves existence only.
- Exact startup uses bounded preflight before canonical traversal and an explicit conservative work/workspace reservation before iterator construction. Charge its first setup event once; this finite synchronous boundary requires deadline checks and T26 measurement. Functional tests do not validate browser slice targets.
- Actual implementation and verification remain recorded in [M2 implementation progress](m2-implementation-progress.md).

## D070 — Clarify coverage ordering and short-pattern link counts

- Status: Technical catalogue clarification during T07, 2026-09-13; no named family removed.
- The conditional matrix omitted numeric tiers. Assign U01–U05 tier 6 in the conditional profile as a provisional explanation preference, not measured difficulty. Primary operation still excludes uniqueness-dependent techniques.
- Correct C10's ambiguous “four-link” wording: the scalar pattern has four candidate vertices connected strong/weak/strong, plus target conflicts. Empty Rectangle can replace endpoints with disjoint exhaustive groups. This matches the [author's original single-digit pattern description](https://hodoku.sourceforge.net/en/tech_sdp.php); the clarification preserves named coverage and prevents counting vertices as edges.

## D071 — Separate general certificate verification from named deduction acceptance

- Status: Technical implementation refinement during T07, 2026-09-13; preserves the approved proof and named-grammar requirements.
- Problem: the temporary foundation proof-test grammar accepted arbitrary primitive bundles under a maintenance label. Tightening production named grammars must preserve mathematical tests without creating a test-mode acceptance bypass.
- Decision: expose non-applying certificate verification with a distinct opaque CheckedCertificate and isolated CertificateSession prefix authority. It can verify explicit effects as mathematical conclusions but cannot issue CheckedStep, accepted candidate facts or quality authority. Only the closed named-grammar path plus primitive checking can issue CheckedStep. Admission mode is internal; no caller-set bypass or injectable checker registry.
- Migrate low-level algebra tests to non-applying verification and keep state/replay/quality tests on real named singles and direct rule maintenance. Independently authored fixture states follow original-given peer exclusions; no fabricated local candidate axioms are introduced.
- Production checking also authenticates the exact published ReadView identity before capturing context; matching state/fact references alone is insufficient against accessors or proxies. Trusted cold index rebuilds retain explicit owned publication and accepted lineage. Structurally forged values must not relabel a sound deduction as a different named technique. A readonly ownership query may create a function-only checker/candidate-module cycle; neither module may call across that cycle during top-level initialization. Non-applying certificate contexts retain their separate algebra role.
- Discovery indexes may carry provenance and proof recipes, but those recipes enter named checking before acceptance. Standalone certificates and index caches cannot overwrite owned candidate state.


## D072 — Shared index leases and explicit local all-different proofs

- Status: Technical implementation refinement completed and independently reviewed during T08, 2026-09-13 (`6d44e97`).
- Gap: the original build-index signatures omitted the shared workspace budget, despite requiring bounded allocation and honest interruption. Each concurrent cache cannot independently claim the whole operation budget.
- Decision: each implication/group/ALS builder requires the same `IndexWorkspace` object. It reserves aggregate entry/byte capacity before retained and scratch allocations. An incomplete iterator releases its lease on interruption, return or throw; a complete index owns the lease until explicit disposal. No implicit per-builder budget. These are conservative accounted sizes, not a heap guarantee.
- Add an explicit interrupted event for cancellation, workspace entry cap or workspace byte cap; only a complete enumeration emits ready. Query work, including complete RCC cross-pair checks, is charged separately from retained memory. RCC source/tuple scans use a resumable query cursor; a synchronous convenience wrapper must explicitly charge its drain. A bound of 25 cross-pairs does not bound the cost of scanning their sources. Disposal invalidates query authority; borrowed entries cannot outlive their lease, and retained downstream copies require their own accounting.
- Index keys retain state/version/dependency metadata. A StateKey-only match is not proof authority: use authenticated published views and exact premise Fact identities for expansion. Cold rebuilds and same-revision cache extensions may reuse an index only while all its referenced inputs remain identical. Equal-key independent initialization must fail that authority check. Entries carry explicit proof recipes; they cannot create candidate facts or bypass named checking.
- RCC checks every cross-occurrence of the tested symbol. A shared occurrence of that symbol is not a conflict with itself and invalidates RCC; shared cells without that symbol are permitted when every actual cross-occurrence conflicts. Subsequent overlapping ALS effects still require their complete local proof. Generic group syntax cannot broaden the named classic profile beyond its house-intersection geometry.
- Add `all-different-subset@1`: exactly one proved all-different premise, empty parameters, exact all-different conclusion with a sorted nonempty distinct subset of parent cells (equal scope allowed). Inherit checked assumptions and rule provenance. It never derives a cover or symbol-existence claim. This explicitly justifies selected local conflicts before bounded table filtering, without weakening complete table-premise scope checks.


## D073 — Explicit discovery resource context

- Status: Technical integration ruling for T09/T19, 2026-09-13; T09 implementation and independent review complete, operation scheduling pending.
- Gap: `discover(view)` cannot supply the shared workspace required by D072. Creating a private default budget inside each advanced detector would violate operation accounting.
- Decision: extend technique discovery to accept an explicit per-invocation `DiscoveryContext` with the operation's shared workspace and selected `Limits`. Tests create explicit contexts; the scheduler supplies the operation context. Foundation strategies may ignore unused fields. No global service locator, hidden per-detector budget or persisted resource settings.
- Add a discovery interrupted event with an explicit reason so an index/resource interruption reaches the ledger without being relabeled exhaustion. Forced iterator closure remains incomplete even without a terminal event.
- Discovery still yields charged work, proposals and honest terminal status; its context does not grant proof or candidate authority. Speculative branches have isolated state with allocations charged to the owning operation. Rule maintenance can retain its existing interface until it needs context, with caller-level accounting unchanged.
- T09 owns the descriptor/test-helper integration; T19/T20 own full operation scheduling, deadline and work/proof accounting. This closes an interface gap, not a claim that resource defaults are calibrated.


## D074 — Remote Pair parity and explicit inference-link counting

- Status: Technical clarification for T09, 2026-09-13; preserves the approved 24-inference-link cap and both Remote Pair aliases.
- The previous wording mixed cell parity and link count. For a simple path of m identical-bivalue cells, count m internal strong edges and m-1 intercell weak edges: 2m-1 inference links. Opposite endpoint colors require even m; the supported forms are m=4,6,8,10,12 (7,11,15,19,23 links). Target-conflict premises are additional. Thirteen cells fail endpoint parity; fourteen exceed the cap.
- This follows the [author's explicit Remote Pair/AIC notation](https://hodoku.sourceforge.net/en/tech_chains.php), inspected 2026-09-13. Chute still requires every path cell in one band or stack. Counting only intercell arrows would hide the internal bivalue inferences; an even number of intercell edges would give the wrong endpoint parity.
- T09 updated manifest/descriptor bounds and tested lower/upper accepted lengths, wrong parity and over-limit rejection. Independent original-clue fixtures cover all five accepted cell counts plus band/stack aliases. This is a finite profile, not an assertion that longer remote pairs are mathematically invalid.


## D075 — Direct checked clauses from complete finite relations

- Status: Technical primitive refinement for T09, 2026-09-13; implementation and independent review complete.
- Gap: a relation-derived weak conflict had only a documented assume/filter/project recipe, while primary unconditional pattern policies reject hypothetical assumptions. Restricting indexes to original all-different conflicts would leave accepted relation facts unusable; silently relaxing the policy would blur the declared grammar.
- Decision: extend the unreleased `table-project@1` grammar to a canonical clause of 2–64 distinct sorted valid literals over its source cells. Require one complete authenticated table/relation and empty parameters, then independently verify that every surviving tuple satisfies the clause. Charge row traversal and each literal evaluation cooperatively. Existing false/single-literal forms retain their own grammar; no general table-to-table projection is added.
- This directly proves a two-negative-literal weak conflict after complete proved domain filtering, without `assume@1`. Preserve all source assumptions, conditionality, rule provenance, exact defining-node identity, scope/arity/byte limits and complete-partition checks. A complete empty relation entails a clause vacuously; this is mathematical proof evidence, not independent solution-count evidence.
- Tests must cover a conflict created only by proved domain filtering, direct unconditional projection, the earlier discharged recipe, surviving counterexample, missing filter, partial table, foreign cells and canonical/boundary/taint failures. Named family checking still independently constrains geometry and the complete proof computation.


## D076 — Bound count certificates by necessary negative incidences

- Status: Technical prerequisite for T10, 2026-09-13; implemented and independently reviewed at `43fc459`.
- Gap: `cover-count@1` currently requires domain facts for every cell in its base/cover union. Ordinary fish sizes 5/6/7 therefore need 75/84/91 premises, exceeding the fixed 64-premise node cap. Raising the cap or omitting these requested sizes is unnecessary.
- Decision: retain the exact weighted incidence inequality. Let w(cell)=capacity coefficient minus cover coefficient and B=total capacity weight minus total cover weight, so sum(w*x)<=B. Only negative-coefficient occurrences require explicit domain evidence proving x=0; zero/positive terms are already nonnegative. Require such evidence for every negative coefficient, with no missing occurrence. Every supplied domain remains valid, unique and in the counted scope; a compatible superset is allowed for existing certificates.
- Infer false only if B<0; infer not-target only if its positive coefficient exceeds B. Keep positive integer coefficient bounds, exact scope identities, complete cover meanings, checked domain provenance, assumption/conditional inheritance and all existing byte/arity caps. No estimated support or cached absence can replace a premise.
- For ordinary sizes 5/6/7, necessary arities become 30/30/28. Mixed fish with at most four bases have at most 36 negative-incidence cells plus eight scope premises, also within 64 before any independent proof expansion. This is a symbolic size calculation, not a performance measurement.
- T10 updates the primitive and independent overlap/missing-negative-evidence/counterfactual tests, then validates every size and mixed form. This removes redundant premises while preserving the same checkable linear argument.


## D077 — Distinguish chain vertices, inference links and loop closure

- Status: Technical fixture clarification for T11, 2026-09-13; implementation and independent review pending. No named family or the 24-link cap is removed.
- The C16 examples described as lengths 4/24 conflated vertices and links. An open endpoint-disjunction AIC starts and ends strong, so its alternating internal edge count is odd. Four and 24 candidate vertices have three and 23 internal inference links. Target-conflict premises are additional, as in D070/D074.
- Record both vertex count and inference-link count explicitly. Require productive four/24-vertex examples, an even 24-link prefix that cannot be presented as a strong-ended endpoint deduction, and a 25-link out-of-profile case. C17 continuous loops can have 24 alternating links including closure; discontinuous loops additionally check their repeated endpoint and inferred polarity. A failed productivity condition is different from a resource interruption or a size bound.
- This interpretation follows the [author's X/XY-chain and AIC definitions](https://hodoku.sourceforge.net/en/tech_chains.php), inspected 2026-09-13. Internal cell links count too; graphical arrows and candidate vertices are not interchangeable units.


## D078 — Count ALS visits separately from ordinary group vertices

- Status: Technical graph representation clarification for T11, 2026-09-13; implementation/review pending.
- C17 counts each ordinary group vertex and each ALS visit toward its four-special-node cap. An ALS visit includes its entry/exit symbol events and one proved internal strong inference; that inference and every external link count toward 24 links.
- Ordinary groups retain the three-member house-intersection bound. ALS events retain every occurrence in the selected ALS of at most five cells. Never truncate an ALS event to three members. Primitive table expansion consumes separate proof/work limits.
- Canonical visit identity uses the actual selected cells; group identity uses symbol/members. Presentation or source-recipe differences cannot create another semantic node. Preserve the simple-path/explicit-loop endpoint rule. Require four-visit and over-limit regressions plus actual five-cell ALS evidence. This is the engine's finite representation choice, consistent with treating [ALS as chain nodes](https://hodoku.sourceforge.net/en/tech_als.php), not a source-defined numerical limit.

## D079 — Preserve arbitrary fish geometry while preferring specific labels

- Status: Technical naming clarification for T10, 2026-09-13; implemented and independently reviewed at `43fc459`. The C08 arbitrary-house scope remains unchanged.
- Mutant admission covers arbitrary distinct classic base/cover house sets within the recorded sizes and fin bounds. Do not require both row and column houses on the same side: that would exclude approved combinations. Basic and Franken are more specific shapes within this general geometry; discovery may prefer their labels when applicable without using naming preference to filter general coverage.
- Franken requires at least one box and an orientation assignment with only rows/boxes on one side and columns/boxes on the other, allowing the swapped assignment and a side consisting solely of boxes. Equal line orientations on both sides are not automatically Franken. Basic retains its parallel row/column definition.
- The [author's fish classification](https://hodoku.sourceforge.net/en/tech_fishg.php), inspected 2026-09-13, describes Mutant using arbitrary house combinations. Alias overlap does not establish another deduction or independent component. Every accepted label still requires its exact incidence certificate and all effect roots; specific-label preference is presentation, not proof authority or an exclusion rule.

## D080 — Report necessary capability exclusions from discovery explicitly

- Status: Technical discovery-contract refinement for T10, 2026-09-13; implemented and independently reviewed at `43fc459`; runtime consumption remains T19 onward.
- Add `DiscoveryEvent` form `{ kind: "excluded"; reason: string; dependencies: readonly Watch[] }`, matching eligibility's evidence. Direct discovery on an authentic view without required capabilities terminates with this event, rather than throwing during a missing-house dereference or claiming that a search exhausted. An unowned/forged view is still an admission error.
- Fish checks actual canonical house geometry and exact proved full digit-cover facts. Available covers provide bases per symbol; available all-different scopes provide capacities. Familiar IDs, cell count and the presence of an unrelated cover are insufficient. Do not demand a complete classic rule collection where a valid partial source collection proves the deduction.
- T19/T20 consume the terminal status and preserve watched exclusion reasons; T21/T23 carry the existing ledger projection without conflating exclusion and interruption. Same-revision proof-source growth can invalidate exclusions. These events grant no proof, candidate, solution-count or quality authority.
