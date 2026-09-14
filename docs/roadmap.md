# Sudoku platform roadmap

Updated: 2026-09-14. Status: **M1a + M1b implemented and verified**, with subsequent UI/appearance under D053/D058. **M2 design is approved and implementation is underway under D065/D066.** See [implementation progress](m2-implementation-progress.md). M2 direction is D046–D057; completed planning and proposed choices are D059–D064.

## Delivery sequence

| Stage | Deliverable | Exit evidence | Design checkpoint |
| --- | --- | --- | --- |
| M1a | Classic creator, autosaved drafts, manual/string entry, conflict checks, Finish into personal library. | Conflicting drafts survive reopen; Finish rejects conflicts; finished definitions are immutable. | Approved first-release specification and detailed plan. |
| M1b | Classic play, notes, arrows, undo/redo, personal library, settings, JSON backups. First usable release includes M1a + M1b. | First-release acceptance checks and a local startup guide pass. | Approved first-release specification and detailed plan. |
| M2 | Broad classic deduction engine, Explain/Analyze modes, independent count evidence and expandable proofs; shared constraint interfaces designed now. | All 33 primary/five conditional coverage rows accepted at declared bounds; independent proofs/counts, fair scheduling, identified fallback, bounded transport/Cancel, measured budgets and no false Perfect. | [Concrete contracts](superpowers/specs/2026-09-12-m2-engine-contracts.md), [coverage matrix](superpowers/specs/2026-09-12-m2-technique-coverage.md) and [complete 27-task plan](superpowers/plans/2026-09-12-m2-classic-solver.md) are approved; execution/acceptance tracked in the implementation record. No gameplay hints yet. |
| M3 | Classic construction assistant. | Existing clues preserved; additions-only proposal; target evidence; honest removability status; applying proposal undoable. | Define target evaluator and irreducibility evidence, resource budgets, deterministic/randomized construction, and impossible input handling. |
| M4 | Diagonal, killer, and thermometer creation/play on classic 9×9; combinable constraints. | Rule definitions round-trip; graphics match declared semantics; support limitations visible. | Set exact variant semantics, editing gestures, overlaps/coverage, capability display, and file version migration. |
| M5 | Solver support for the initial variants and their supported combinations. | Exact and logical fixtures for individual/mixed constraints; trace replay; unsupported rules never ignored in full-puzzle claims. | Define shared propagation, mixed-rule techniques, soundness checks, and performance budgets. |
| M6 | Gameplay hints, after M5. | Hint operations honor configured disclosure, supported rules, and current player state; applying a hint integrates with history. | Design Check, next-step explanations, candidate fill, reveals, corrections, and response to player contradictions. |

Within M1, implement creation before completing play UI, as requested; foundational shared state/history work can serve both. Personal library and basic Settings are part of M1, not a later community project.

After M5, the following branches have design dependencies but no user-approved total order. Do not silently turn their listing order into a delivery promise.

| Later branch | Prerequisite | Intended capability | Decisions deferred to its checkpoint |
| --- | --- | --- | --- |
| Variant construction assistance | M3 + M5 | Complete variant puzzles while preserving mandatory elements. | Locks for lines/cages/clues; allowed additions/edits; aesthetics; quality verification for mixed constraints. |
| Expanded gameplay | M1; rule-aware assistance may require M5 | Centre notes, colours, multi-selection, optional automatic note cleanup, richer configurable controls. | Default shortcuts, note layers, drag semantics, palettes, accessibility, themes, timers and other desired options. |
| Richer personal library/interoperability | M1; variants for variant round-trips | Rich metadata, multiple attempts, import/export with external editors, more library organization. | Format compatibility, lossless/partial import status, attribution, identity/versioning, search/tags, history retention. |
| Custom geometry and symbol domains | M4/M5 architecture | Custom sizes, regions, symbols, classic-rule opt-outs, unusual/overlapping layouts. | Cell topology, numerical versus symbolic meaning, disconnected/overlapping cells, solver capability boundaries, serialization versions. |
| Custom-rule authoring/plugin system | Rule registry from M4/M5 | Written rules playable before engine support; structured semantics and reusable extensions. | Supported rule primitives, parameters, validation, capabilities, plugin compatibility and extension execution. |
| AI-assisted rule development | Tested rule/plugin contracts | Rule text → examples → generated proposal → tests → user review → trusted registry. | Provider/cost, ambiguity handling, test independence, restricted execution, review UI, approval audit and version changes. |
| Community sharing/explore | Stable puzzle identity/export and capability labels | Accounts, publication, discovery, collections, shared puzzles. | Hosting, authentication, ownership/attribution, moderation, privacy, ranking/search, sync, backups and cost. |

## Quality contract across stages

| Property | Evidence required | What is insufficient |
| --- | --- | --- |
| Classic conflict-free | No duplicate nonzero values in the relevant rows, columns, or boxes. | This does not prove a completion exists. |
| At least one solution / Open target | A completed assignment validated against every supported rule. | An unfinished search or unsupported constraint. |
| Unique target | One solution and an exhaustive relevant check excluding a second. | Finding only one solution before timeout. |
| Multiple solutions | Two distinct valid solutions; exact counts need further exhaustive work. | A solver stalled on one branch. |
| Perfect target (default) | Independent uniqueness evidence plus complete checked logical path derived from clues/rules alone, with all temporary assumptions discharged. | Fallback completion, uniqueness-dependent path or an incomplete proof. |
| No removable added clue | Target-specific evidence that each single added-clue removal breaks the selected target. | Failing to rediscover a logical path or running out of time. |

Keep target, existence/count status, human-path status, and minimality status separate. Retain valid partial evidence when a task is cancelled or reaches its budget, while identifying what remains unknown. The UI must never claim unsupported properties.

Open allows any positive solution count. The first assistant preserves all entered clues; if they already admit a solution, an Open result may require no additions. Exact counts/ranges and per-clue unlock/change/remove controls are later scope.

For Perfect minimality, define the verification contract at M3 before promising irreducibility. One practical conservative result is a logically solved, verified-unique puzzle whose added clues are demonstrably necessary for uniqueness. If only technique search stalls on removal, report minimality unverified. Do not relabel a heuristic as a proof.

## Architecture that carries forward

- Immutable finished definitions; independent editable drafts, play sessions, solver snapshots, and histories.
- Browser-first TypeScript and Vite; native IndexedDB behind a repository adapter; stable localhost origin.
- Plain TypeScript views depend on application actions, not embedded solver logic.
- Versioned rules and techniques, shared candidate state, explicit prerequisites, structured deduction steps.
- Exact solver distinct from human-technique coverage; worker execution with request/revision identity, configurable time limits, cancellation, and progress.
- Algorithm repository stores step descriptions, executable implementations, and regression examples. A factory assembles compatible capabilities; it does not concatenate unrelated solvers or generate every combination's source code.
- Generated executable rules require a deliberate restricted environment; a normal worker is a responsiveness tool, not the complete trust boundary.

## First release and continuation

M1 is complete under the [approved behavior specification](superpowers/specs/2026-09-12-first-release-design.md) and [implementation plan](superpowers/plans/2026-09-12-first-release.md), with D053/D058 refinements. **Execute and independently verify the approved expanded M2 plan.** Expanded technique coverage and runtime integration remain in progress; M2–M6 and later branches remain product direction, not work included in M1.

M2 implementation batches preserve the full bounded target: oracle/contracts/shared proofs → foundation → graph/short patterns/fish → coloring/chains/ALS → combinations/forcing/generalized/specialized/templates → conditional techniques → scheduling/orchestration → bounded worker/controller/UI → independent integration and benchmark gates. Intermediate batches are reviewable; completing the first six techniques does not complete M2. No universal technique completeness is promised.

T01-T18 are implemented and independently reviewed, covering all bounded C01-C33 and U01-U05 families. T18 passes through `5a19be1`, including authentic conditional OR/template source reuse, original-clue replay, permanent taint and cancellation authority. The final covering/fix checks passed; the earlier complete broad run had 1,656 passes and 33 test timeouts. [Implementation progress](m2-implementation-progress.md) preserves exact verification history and limits.

C25-C28 per-alias catalogue evidence must be completed before T19 runtime readiness. Six earlier minor fixture, descriptor and regression follow-ups remain assigned to T25. Scheduling, worker/controller/UI integration, final whole-suite acceptance and browser calibration remain required before M2 becomes available. Conditional paths remain separate and cannot qualify for Perfect.

Remaining empirical gates are cost tables, proposed 70% human-phase share, configurable time/work/proof limits and Analyze rollout benefit. Proposed default is 10 seconds with 1–120 control; all caps and measurement criteria are in the contracts. Temporary input/results/options remain memory-only; optional Save Clues creates a normal draft. No unresolved product question blocks this design, and no solver default is yet validated.

At each later checkpoint: read the decision log, inspect the implemented state, research any changing tool/format behavior, settle that stage's deferred choices, write its specification and implementation plan, and record results in this folder. Preserve earlier user decisions unless the user changes them.
