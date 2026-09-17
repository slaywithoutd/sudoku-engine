# Sudoku platform architecture

Date: 2026-09-12. Status: APPROVED architecture under Q31/D037, refined by D038–D044. First-release behavior is implemented and verified in `web/`; later subsystem details have explicit roadmap checkpoints. Confirmed decisions are in `../../decisions.md`; actual first-release evidence is in [release verification](../../release-verification.md).

## Product and delivery order

Build a personal desktop-browser platform, initially launched on localhost, with this agreed sequence:

1. Classic puzzle creation.
2. Classic play. Together with stage 1, ship the menu, personal library, and basic Settings as the first usable release.
3. Classic solver with explained human techniques, identified search fallback, and an expandable trace.
4. Classic construction assistance.
5. Creation and play for diagonal, killer, and thermometer constraints on a classic 9×9 base.
6. Solving for those variants and their supported combinations.
7. Gameplay hints, after variant solving is complete (D043).

Broader geometry/symbol customization, variant construction assistance, advanced gameplay settings, richer imports, community, and AI remain later capabilities. Their dependencies and deferred decisions are recorded in `../../roadmap.md`. Gameplay hints reuse the engine but wait until variant solving is complete.

## Stack comparison and recommendation

| Option | Advantage | Cost |
| --- | --- | --- |
| TypeScript + Vite, browser-owned engine/state | Fits local personal use, gives one language for UI actions and initial solving, and avoids a server dependency for each edit. | Migrate the small existing Java/JavaScript implementation. Future solver workloads still need benchmarks. |
| Keep Spring/Java and improve the frontend | Retains existing project structure and classic validators. | Still requires a new frontend state/history layer; local validation is preferable for immediate input. |
| TypeScript frontend plus Java solver service | Offers a service execution path for demanding future workloads. | Adds two runtimes and a network boundary before there is a demonstrated solver need. |

Selected by Q31/D037: the first option. Use plain TypeScript view modules initially, with no UI framework requirement. Keep view code separate so a framework can be introduced if later editor complexity justifies it. Use a stable localhost host/port and an explicit startup command.

Technical evidence and source links: [architecture research](../../references/architecture-research.md). Vite/IndexedDB/workers are accepted architectural choices under D037.

## Module boundaries

| Module | Responsibility | Depends on |
| --- | --- | --- |
| Puzzle definitions | Board geometry, symbol domain, givens, rule instances, metadata, schema/rule versions. | Shared value types. |
| Draft editing | Mutable authoring state, clue/constraint editing, Finish validation. | Definitions and command history. |
| Play sessions | Player values, notes, selection, completion state, user preferences. | Immutable puzzle definition and command history. |
| Commands/history | Reversible value, note, erase, and reset operations. | Domain state only; no DOM or network. |
| Persistence | Atomic local saving, loading, schema migration, backup restore. | Versioned domain/history records. |
| Views/input | Menu, library, creator, board, settings, mouse/keyboard routing. | Application actions and read-only view state. |
| Rule registry | Versioned rule semantics and explicit engine capabilities. | Puzzle definitions and solver contracts. |
| Exact solver | Find solutions, detect contradictions, bounded counting/uniqueness checks. | Supported rule semantics. |
| Human deductions | Find and explain sound eliminations/placements using allowed techniques. | Shared solver state, rules, and registered techniques. |
| Orchestration | Human-first solve loop, fallback search, progress, cancellation, trace. | Exact solver and human deductions. |
| Construction assistance | Preserve locks, add clues, evaluate targets, test removability. | Solvers and quality evaluation. |

Implement only the modules needed at each stage. The first release needs classic validation, not a generalized solver or AI plugin runtime.

## State and persistence

Keep puzzle definition, draft state, play state, and solver working state separate. A filled player cell may retain hidden notes. Finished clues are immutable during play; editing a finished puzzle makes a new draft copy.

Use IndexedDB transactions to save state and its undo history together. Store draft and play histories separately and restore them on reopen. Preferences are stored separately from a puzzle's rules. JSON backups carry a format version; restoration validates the full payload before committing changes. Backup contents and conflict handling are approved in the first-release specification.

If saving fails, keep current in-memory work and clearly show that it is unsaved, with export/retry available. Avoid falsely reporting a successful save. A stable origin prevents accidental switching to an apparently empty browser library.

## Rule composition and algorithm repository

Prefer a registry and shared solving state over generating a new monolithic `solve()` source file for every variant combination. The user's factory idea becomes an assembly step: select rule implementations and eligible techniques, then run the shared orchestrator.

Each rule instance references an identifier, version, and parameters. Separate display metadata from semantics. Capability records distinguish rendering, checking, exact search/counting, and explained deduction support. Missing semantic support must not be treated as an absent constraint when making full-puzzle claims.

Human techniques declare prerequisites and emit structured steps: technique/version, affected cells/candidates, premises, placements/eliminations, and explanation data. Techniques share candidate state so one rule's deductions feed others. Mixed-rule techniques can explicitly require multiple kinds of constraints; concatenating separate solvers is insufficient.

Keep authored rules/algorithm descriptions alongside executable implementations and regression cases. Rule version changes must not silently reinterpret old saved puzzles or invalidate prior certificates without notice.

## Solving and hints

Run longer solving tasks in a worker. Inputs are snapshots tagged with puzzle revision and request ID. Results include that identity, status, explanation trace, elapsed effort, and search use. UI applies results only to the intended revision. Support cancellation and time budgets; results after cancellation are not applied.

The original architectural baseline (singles, intersections and pairs) is the kernel, not final M2 coverage. D054–D057 require broad classic families, Explain/Analyze with Explain default and separately labeled uniqueness-dependent paths. The completed [M2 contracts](2026-09-12-m2-engine-contracts.md), [bounded coverage matrix](2026-09-12-m2-technique-coverage.md) and [revised plan](../plans/2026-09-12-m2-classic-solver.md) specify shared constraint/fact/proof interfaces now, with real variant implementation still in M4/M5. They are proposals awaiting design approval. Every applied deduction is checked; independent original-rule counting and identified fallback remain separate from the logical path.

Separate the exact solver's completeness from human technique coverage. For uniqueness classification, searching until a second solution is found can establish multiple solutions; proving exactly one requires completing the relevant search without a second solution. A timeout means unknown, not unique or impossible.

Human traces and future hints use the same step representation. Solver-screen solving works on an isolated snapshot and does not overwrite personal play progress by default. Gameplay hints wait until variant solving is complete; their checkpoint defines treatment of contradictory entries. Never assume user notes form the full true candidate set.

## Quality and construction assistance

Confirmed targets: Perfect (unique plus a complete allowed logical path), uniqueness alone, and Open. Perfect is the default. Open requires at least one solution, with uniqueness optional; both single- and multiple-solution puzzles qualify. Keep requested target separate from verified status. Exact count/range targets are later scope.

Track solution-count evidence separately from human-path evidence. A search-assisted completion may establish a solution, and a completed exact check may establish uniqueness, without certifying perfection. Record rule versions, allowed techniques, and evidence behind checks.

The first classic assistant proposes changes on a copy, preserves every entered clue, and only adds digits to empty cells. It verifies the target and tests each added clue's removal. It does not promise globally fewest additions. Applying its proposal is one undoable authoring action.

For uniqueness, a second solution after clue removal can witness why that clue is necessary. For the perfect target, a human solver stalling is not proof that no qualifying logical path exists. Define and label any operational test explicitly; otherwise report minimality as unverified. Unknown/time-limited checks must not support an irreducibility claim.

Open may need no additions when the input already admits a solution. Do not silently reuse uniqueness-oriented removal for every target. Solving and assistance have configurable limits and Cancel (D042); unfinished checks leave unverified properties explicitly unknown. Defaults and progress detail are chosen after solver-stage benchmarks.

## AI-assisted rules

Agreed workflow: draft → explicit examples → implementation and automated validation → user review → trusted registration. A rule may remain playable as written text before this succeeds.

Proposed implementation path: prefer a structured/declarative rule description when existing primitives express it; otherwise generate an extension proposal with tests and capability declarations. Test contradictory examples, small exhaustive cases where feasible, and regression combinations with existing rules. Independent checking is preferable to having generated code grade itself.

Ordinary browser workers are useful for responsiveness but are not a sufficient restriction boundary for arbitrary generated code. Choose a restricted execution design before executable extensions run. AI provider, costs, execution environment, review UI, and publication policy are later design work; no universal arbitrary-rule guarantee is promised.

## Verification and review boundaries

- First release: meaningful state/history/import tests plus real-browser keyboard, persistence, and navigation checks.
- Classic solver: known solution counts, unsatisfiable cases, trace replay, sound eliminations, cancellation, and no false perfection claims.
- Variants: individual and mixed-rule fixtures; unsupported-rule behavior; definition round trips.
- Assistant: preserved locks, target verification, removability evidence, and atomic proposal application.

Architecture and first-release behavior are approved, and M1 implementation is complete. The detailed first-release plan and milestone roadmap record delivery under D044. M2 is the next design checkpoint. Later subsystems receive their own detailed designs before code; checkpoints preserve the full ambition without silently deciding unspecified behavior.
