# Design tree and interview

Updated: 2026-09-12. All five rounds and all 38 questions are answered. Architecture and first-release behavior are approved; later detail is explicitly deferred under D044. This file preserves interview history; the specifications and roadmap carry current requirements.

## Round 1: independent decisions available now

### Q1 — Initial workflow

Should the first milestone preserve entering starting clues, pressing Play to lock them, and solving with clicks, arrows, Shift notes, and Ctrl+Z?

Recommendation: keep the existing create → play flow with the requested controls. Alternatives: blank editable board only; preloaded puzzle to play.

Answer: start menu with three main actions plus configuration. Access Library/Explore and select a puzzle to play immediately, create a puzzle, or solve a puzzle. See D007. Q7/D013 settles initial destination scope; Q32/D038 approves detailed first-release behavior.

### Q2 — Delivery platform

Does PC mean a desktop browser or an installed desktop application?

Recommendation: desktop browser first, consistent with the existing application.

Answer: desktop web browser first. See D008.

### Q3 — Priority after the board

Which capability must become good first: explainable solving/hints, creation/assistance, or playing/library?

Recommendation: explainable solver and hints as a foundation for later creation assistance. This is a proposed product priority; technical prerequisites will be planned separately.

Answer: classic creation → classic play → classic solver → variant creation/play → variant solver. See D009. Q29 inserts classic assistance after classic solving; Q37 places hints after variant solving; the roadmap carries exit criteria and later checkpoints.

### Q4 — Meaning of custom rule support

May users create and play written-rule puzzles before the engine understands those rules, without reliable automated hints or uniqueness checks for those puzzles?

Recommendation: yes, distinguish playable rules from engine-supported rules. Alternative: require engine support for every publishable rule.

Answer: yes; clearly distinguish playable rules from engine-supported rules. See D010. The capability indicators and handling of partially supported puzzles remain design questions.

### Q5 — Meaning of a perfect puzzle

Is exactly one solution enough for default assisted creation, or must the puzzle also be solvable without guessing using an agreed set of human techniques?

Recommendation: unique and solvable using supported human techniques. Exact difficulty/technique policies would follow later.

Answer: perfect means exactly one solution and logical steps throughout without guessing; uniqueness-only and open games are alternatives, with status visible. See D011. Q23 permits explained contradiction techniques; Q33 makes Perfect the default; Q34 defines Open as any positive solution count. Detailed evidence contracts belong to later solver/assistant checkpoints.

### Q6 — Initial audience

Should initial versions serve a personal local collection, or require accounts and sharing from the start?

Recommendation: personal use first; community later.

Answer: personal use first; community sharing later. See D012. Q12 settles browser storage/backups; Q22 settles localhost launch.

## Round 2: first-release behavior and constraints

Questions asked together through the question interface. Recommendations below are proposals, not decisions. The first-release scope choice can defer the other capabilities to their applicable stage without invalidating the preference answers.

### Q7 — First usable release

Should it include the start menu, classic 9×9 creation and play, a personal saved-puzzle list, and basic Settings, with Solve and community Explore clearly marked as future features?

Recommendation: yes, deliver that creation/play release first. Alternatives: menu and creation only, with play delivered separately; wait until classic solving works before release.

Answer: yes, deliver that creation/play release first. See D013.

### Q8 — Initial puzzle entry

How should a classic puzzle enter the creator?

Recommendation: manual clue entry plus pasting an 81-cell puzzle string. Alternatives: manual only; SudokuPad/f-puzzles imports from the beginning.

Answer: manual clue entry or pasting an 81-cell puzzle string. See D014.

### Q9 — Initial annotations

Which styles should the first playable version support? A held modifier temporarily enters that note style, returning to the selected tool when released.

Recommendation for the requested initial scope: Shift corner notes first. Alternatives: both Shift corner and Ctrl centre notes immediately; existing fixed-position 3×3 notes with Shift.

Answer: Shift corner notes first. See D015. Centre notes are deferred; Q32/D038 settles initial layout/input behavior.

### Q10 — Initial selection

Is selecting several cells and entering/erasing notes across them needed initially?

Recommendation: single-cell selection first, multi-selection later. Alternative: SudokuPad-style drag and modifier multi-selection immediately.

Answer: single-cell selection first; multi-selection later. See D016.

### Q11 — Mistake handling

Should conflicting digits be allowed in both creation and play? This question concerns visible classic row/column/box conflicts, not solution-based checking.

Recommendation: allow entries and highlight conflicts, with highlighting configurable off. Alternatives: allow entries and check only on request; block conflicting creation clues but allow player mistakes.

Answer: highlight conflicts in creation and prevent finishing creation while conflicts exist. During play, allow mistakes with configurable highlighting. See D017. Q15/D021 subsequently settles Finish and draft autosave; Q20/D026 settles play highlighting off by default.

### Q12 — Personal storage

Is automatic saving of puzzles/progress in this browser, with JSON export/import backup and no cross-browser/device sync, sufficient initially?

Recommendation: browser storage plus backup. Alternatives: backend files/database; temporary state until the library stage.

Answer: browser storage plus file backup. See D018. Automatically save locally with JSON backup and no initial cross-browser/device sync. Q32/D038 settles backup contents and restoration.

### Q13 — Technology constraint

Should the existing Java/Spring backend and plain HTML/CSS/JavaScript frontend be retained for the first stages?

Recommendation: retain the current stack initially. Alternatives: Java is important but frontend changes are welcome; no stack preference and choose during design.

Answer: no stack preference; propose the best fit during design. See D019. No stack change has been chosen or implemented.

### Q14 — Undo boundaries

Should Ctrl+Z undo value/note edits and erase/reset actions, restoring affected notes too, while navigation stays outside history and creation/play keep separate histories?

Recommendation: use those boundaries. Alternatives: include navigation/selection in history; use one history across creation/play.

Answer: yes, use those boundaries. See D020. Q21/D027 confirms persistent history; Q32/D038 settles the remaining first-release defaults.

## Round 3: first-release lifecycle and interaction details

Questions asked together through the question interface. All recommendations remain proposals until answered. Later rounds still need to explore the broader solver, variant, assisted-construction, and AI architecture.

### Q15 — Finishing creation

Should drafts autosave even with conflicts, while Finish checks for conflicts and adds the puzzle to the playable library, with an option to play immediately? Until a solver exists, finished puzzles would show solvability and uniqueness as unverified.

Recommendation: autosave drafts and explicitly finish into the library. Alternatives: Play finishes and saves in one action; keep drafts temporary and save only finished puzzles.

Answer: autosave drafts and explicitly finish into the library, as recommended. See D021. Conflicting drafts can be saved; Finish requires no classic conflicts and offers immediate play. Solver properties remain marked unverified until checked by a future solver.

### Q16 — Editing finished puzzles

Should changing a finished puzzle's starting clues create a new draft copy, preserving the original puzzle and play progress?

Recommendation: create a draft copy. Alternative: edit the original and reset its play progress.

Answer: create a new draft copy. See D022. Preserve the original puzzle and its play progress.

### Q17 — Notes under a value

When a full-size digit is entered, should notes remain hidden and reappear on erasure, or be deleted and recoverable only through Undo?

Recommendation: preserve hidden notes and reveal on erasure. Alternative: delete notes, with Undo restoring them.

Answer: keep notes hidden; erasing the digit reveals them. See D023. Explicit note clearing and note entry into a filled cell still need specification.

### Q18 — Automatic note cleanup

Should entering a digit remove that candidate from notes in its row, column, and box?

Recommendation: manual notes first, optional cleanup later. Alternatives: configurable cleanup now, either off or on by default.

Answer: manual notes initially; optional cleanup later. See D024. Entering a digit does not automatically alter notes in peer cells.

### Q19 — Arrow navigation

Should arrows stop at edges and permit selection of given clues for inspection while keeping clues uneditable in play?

Recommendation: stop at edges; givens selectable but locked. Alternatives: wrap to opposite edge with selectable locked givens; stop at edges and skip givens.

Answer: wrap to the opposite edge; givens selectable but locked. See D025. Horizontal wrapping stays in the same row; vertical wrapping stays in the same column. Givens are not skipped.

### Q20 — Default play feedback

Should play conflict highlighting start off, with a Settings switch to enable it? Creation always highlights conflicts.

Recommendation: off by default to avoid unsolicited hints. Alternative: on by default.

Answer: off by default, configurable through Settings. See D026. Creation highlighting remains always on.

### Q21 — Undo persistence

Should Undo work after refreshing or reopening a saved puzzle, with separate histories for its draft and play session?

Recommendation: save history with each draft/play session. Alternative: retain values and notes but start fresh undo history when reopened.

Answer: save history with each draft/play session. See D027. Undo survives refresh/reopen; Q32/D038 includes history in backups and disallows silent initial trimming.

### Q22 — Initial launch

How should the first personal version be accessed?

Recommendation: run locally on the user's PC and open localhost. Alternative: hosted URL with no local server startup. This decision informs stack/hosting design; browser storage alone does not settle it.

Answer: run locally on the user's PC and open localhost. See D028. No hosted deployment is required initially.

## Round 4: solver, variants, construction, and AI

Questions asked through the question interface. Technical stack research is saved in `references/architecture-research.md`. Q31/D037 subsequently adopts the browser-first architecture.

### Q23 — Meaning of human logic

May a perfect puzzle use named contradiction techniques that explain why a candidate is impossible, within a chosen technique set and without open-ended guess/backtrack search?

Recommendation: allow explained contradiction techniques within the chosen set. Alternative: exclude any technique that temporarily assumes a candidate.

Answer: allow explainable contradiction techniques within a chosen technique set. See D029. Exact techniques and complexity bounds remain to be designed; open-ended search does not certify perfection.

### Q24 — First classic solver depth

Should it start with a small reliable set of explained techniques, use clearly identified search when those stall, and expand its human-technique library over time? Search-assisted solving would not certify perfection.

Recommendation: grow the library incrementally. Alternative: implement a broad advanced human-technique set before releasing the solver.

Answer: grow the human-technique library incrementally. See D030. Start with a small reliable explained set, identify any search fallback, and do not certify perfection from a search-assisted solve. Initial techniques remain to be specified.

### Q25 — Solver output

Should the solved board include an expandable ordered explanation of each step, identifying where search was needed?

Recommendation: board plus expandable trace. Alternative: solved board only initially, visible trace later.

Answer: solved board plus an expandable step-by-step trace, including search use. See D031.

### Q26 — First built-in variants

Which initial group should follow classic solving?

Recommendation: diagonal, killer cages, and thermometers. Alternatives: anti-knight, anti-king, and non-consecutive; prioritize a custom-rule editor before built-in variant tools. Free-text variant groups are welcome.

Answer: diagonal, killer cages, and thermometers. See D032. Detailed rule semantics, combinations, and order within this group remain to be specified.

### Q27 — First variant board scope

Should initial variants use a classic 9×9/digits 1–9 base with combinable variant constraints, expanding custom sizes, symbols, regions, and layouts later?

Recommendation: start on the classic base. Alternatives: custom sizes/regions immediately; arbitrary layouts/symbols immediately.

Answer: start variants on the classic 9×9 base, with combinable constraints. See D033. Custom sizes, symbols, regions, and layouts follow later.

### Q28 — Meaning of minimal construction

Is a first assistant that respects locked clues and finds a result where no added clue can be removed while preserving the chosen quality target sufficient, without proof of globally fewest additions?

Recommendation: no removable added clue. Alternatives: best result within a time budget; require proven globally fewest additions.

Answer: start with a result where no added clue can be removed. See D034. Preserve locked clues; do not claim globally fewest additions. Define the target-specific verification criterion, especially for human solvability and multiple-solution targets, before implementation.

### Q29 — Construction-assistance timing

Where does automatic completion assistance enter the delivery sequence?

Recommendation: after the classic solver, initially classic-only. Alternatives: after variant solving, classic and variants together; defer assistance planning until the full stated sequence is complete.

Answer: after the classic solver, initially for classic puzzles. See D035. This inserts classic assistance before variant creation/play in the existing delivery sequence.

### Q30 — Trusting AI-created rules

Before generated rule code becomes trusted engine support, should it require explicit rule examples, automated validation, and user review? AI may draft rules/code beforehand.

Recommendation: reviewed proposal before registration. Alternatives: automatic registration after validation without user review; defer AI decisions until the rule/plugin system works.

Answer: generate a reviewed proposal before registering trusted support. See D036. Require explicit examples, automated validation, and user review.

## Round 5: written design review and final scope choices

Review documents: `superpowers/specs/2026-09-12-platform-design.md` (approved under D037, refined by D039–D044) and `superpowers/specs/2026-09-12-first-release-design.md` (approved under D038). Confirmed decisions remain in the decision log.

### Q31 — Architecture proposal

Does the architecture draft's TypeScript + Vite approach, plain TypeScript views, IndexedDB state/history, and later solver worker fit the project?

Recommendation: adopt this browser-first proposal. Alternatives: retain Java/Spring; choose the hybrid frontend/service approach. See the written module boundaries and research comparison before deciding.

Answer: adopt the browser-first architecture proposal. See D037. TypeScript/Vite, plain TypeScript views, IndexedDB, later solver worker, and documented subsystem boundaries are approved. Q32–Q38 subsequently settle remaining first-release/product/planning choices.

### Q32 — First-release behavior proposal

Does the first-release draft's proposed behavior fit, including redo, layered erasure, import validation, backup merge/copies, one active play session per puzzle, and retaining Portuguese UI text?

Recommendation: accept the proposed defaults. Alternatives: accept with listed changes; review the document section by section. This question concerns the explicitly marked proposed sections, not reapproval of already settled requirements.

Answer: accept the proposed first-release defaults. See D038.

### Q33 — Default quality target

Which assisted-creation target should be selected initially?

Recommendation: Perfect. Alternatives: uniqueness only; require choosing each time. Other targets remain available.

Answer: Perfect is the default assisted-creation target. See D039.

### Q34 — Open target meaning

Does Open mean at least one solution with no uniqueness requirement, or should it require multiple solutions or a requested count/range?

Recommendation: at least one solution, uniqueness not required, with verified status shown. Alternatives: require at least two; allow an explicit requested count/range in the first assistant.

Answer: at least one solution; uniqueness is optional. See D040. Exact count/range targeting is later scope.

### Q35 — First assistant's permitted edits

Should the first classic assistant treat all entered clues as locked and only add digits to empty cells, or allow the creator to unlock existing clues for change/removal?

Recommendation: preserve all entered clues, additions only initially. Alternative: per-clue locks immediately, permitting changes/removal of unlocked clues.

Answer: preserve entered clues and only add digits initially. See D041.

### Q36 — Long-running work

Should solving and assistance use configurable time limits plus Cancel, returning explicit incomplete/unknown results if they cannot verify the requested outcome within budget?

Recommendation: yes, bounded work with honest partial status. Alternative: no automatic time limit, continue until finished or manually cancelled. A stalled human solver or timeout never proves absence of a logical path.

Answer: configurable limits and honest incomplete results. See D042.

### Q37 — Initial hint delivery

Should the classic solver stage also add Check and next explained logical-step hints, with candidate filling, reveals, correction, and other hint types expanded later?

Recommendation: basic Check and next-step hints with classic solving. Alternatives: implement the broader hint suite at that stage; defer gameplay hints until variant solving is complete.

Answer: defer gameplay hints until variant solving is complete. See D043. This does not remove first-release conflict feedback or the solver screen's explanation trace.

### Q38 — Planning depth and explicit deferrals

After these decisions, should planning produce a detailed first-release implementation plan plus the full milestone roadmap, while exact later variant mechanics, advanced hints, geometry customization, community, and AI execution/provider details receive their own designs before those stages?

Recommendation: detailed first-release plan plus roadmap, with explicit later design checkpoints. Alternative: continue designing those later subsystems in detail now before planning the first release.

Answer: detailed first-release plan plus roadmap and later design checkpoints. See D044. The interview is complete for the current scope; later details are intentionally deferred.

## Dependent branches to explore

This historical branch map tracks topics raised during discovery. First-release details are settled in the approved first-release specification; remaining later-stage decisions move to the roadmap checkpoints under D044. There is no active unanswered interview frontier for the current deliverable.

| Branch | Prerequisites | Decisions to settle |
| --- | --- | --- |
| Start menu and milestone scope | Q1, Q3, Q6 | First-milestone functionality behind Library/Explore, Create, Solve, and Settings; puzzle sources; navigation; creation-to-play transition. |
| Board input | Q1, reference research | Cell selection; keyboard and number buttons; corner versus center notes; Shift behavior; deletion; clue selection/editing; edge navigation; multi-selection timing. |
| State and undo | Q1 | Which actions undo; restoring notes on undo; reset and mode transitions; redo; no-op actions; history lifetime. |
| Feedback | Q1 | Allow versus block invalid entries; conflict highlighting; completion behavior; no accidental solution spoilers. |
| Delivery and storage | Q2, Q6 | Browser/offline expectations; server dependency; saving after refresh; deployment; implementation language constraints; local versus remote data. |
| Puzzle model | Q3, Q4 | Supported first variants; board geometry; symbols and numeric meaning; overlapping boards; standard rule opt-outs; definition versus play state; rule versions. |
| Rule composition | Q4, first variant set | Validation and propagation; interactions across rules; algorithm registration; unsupported combinations; correctness contract. |
| Human solving and hints | Q3, Q5 | Technique tiers; explanation trace; next-step ordering; guess policy; solve from clues versus player entries; inconsistent player state; hint disclosure levels. |
| Exact solving | Q4, Q5 | Solution enumeration/count cutoffs; uniqueness proof; time/cancellation limits; unsatisfiable and unknown outcomes. |
| Quality targets and status | Q4, Q5 | Default target; requested versus verified properties; visible uniqueness and logical-path status; unknown/unsupported results; exact versus bounded counts; open puzzles permitting versus requiring multiple solutions; zero-solution drafts. |
| Assisted construction | Q3, Q5 | Mandatory elements; allowed additions/edits; irreducible versus global minimum; time budget; target solution counts; difficulty and aesthetics. |
| Personal library | Q3, Q6 | Puzzle identity; versions; play sessions; statuses; import/export and reference formats; backups. |
| Community | Q6 | Publishing workflow; ownership; attribution; discovery; moderation; accounts; hosting costs. |
| AI rule development | Q4, rule model | Natural-language clarification; structured semantics; code versus declarative output; tests and approval; execution boundaries; versioned registry; provider/cost. |
| Final presentation | Board scope, reference research | Layout; appearance; accessibility; settings defaults; language; configurable shortcuts. |
| Delivery plan | Priorities and relevant design branches | Phased sequence; acceptance criteria; verification; explicit deferrals; review of shared understanding. |

## Important distinctions to resolve

- A locally conflict-free board can still have no completion.
- Finding one solution is different from proving uniqueness.
- A unique puzzle need not be solvable by the engine's supported human techniques.
- Minimal additions can mean no single addition is removable, a best result found under a budget, or a proven smallest result. These are different promises.
- Displaying a custom rule is different from validating it, counting solutions under it, or explaining deductions that use it.
- Applying variant-specific techniques independently may miss deductions requiring interactions between constraints.

## Completion condition

Met for the planning scope: the user approved the architecture (Q31), first-release behavior (Q32), final product choices (Q33–Q37), and detailed first-release planning with explicit later design deferrals (Q38). Produce the plan and roadmap; implementation is the next task.
