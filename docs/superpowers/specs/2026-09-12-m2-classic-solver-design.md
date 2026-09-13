# M2 classic Sudoku solver: screen and evidence design

**Approval update:** The user approved this design at `0e98c2b` and authorized implementation under D065/D066. Earlier review-only wording below records the drafting state; benchmarks and runtime acceptance remain required.

Date: 2026-09-12. Status: **revised detailed proposal ready for review; implementation is not authorized**.

This replaces the initial six-technique specification. The complete design comprises this screen/evidence contract, the [expanded research and rationale](2026-09-12-m2-engine-expansion-design.md), the [concrete engine contracts](2026-09-12-m2-engine-contracts.md), the [bounded technique matrix](2026-09-12-m2-technique-coverage.md) and the [revised implementation plan](../plans/2026-09-12-m2-classic-solver.md). Contract annexes supersede earlier sketches; the research inventory supplies sources, not conflicting executable interfaces. Decisions [D046–D064](../../decisions.md#d046--m2-design-authorization-and-preserved-requirements) distinguish confirmed requirements from recommendations.

## 1. Authority and inspected application

Confirmed: browser-first TypeScript/Vite/plain views, existing IndexedDB library, worker execution, broad classic logical coverage, Explain/Analyze with Explain default, checkable applied deductions, Perfect derived only from clues/rules plus separate independent uniqueness evidence, identified search fallback, count/path separation, configurable limits, Cancel and honest incomplete outcomes, isolated solver snapshots, English D053 and preserved appearance D058. Gameplay hints wait until completion of M5 (delivered in M6); variants, construction assistance, community and AI are outside M2. Shared multi-constraint contracts and synthetic architecture tests are part of M2 design now.

All interface details, finite profile bounds, scoring weights, volatile persistence, screen interactions and numerical defaults are recommendations. They are concrete enough to implement after approval, but neither this planning authorization nor local documentation commits approve solver implementation.

Inspected clean branch `docs/m2-solver-design` at `80471d2`, newer than research `24e0d25`. No applicable AGENTS.md. Read current domain/model, classic/editor/library, aggregate persistence controller, router/application, board/home/library/player views, Vite/TypeScript/test configuration and M1/recent appearance verification. Preserve newer sidebar, English copy, repeat-value input, fixed notes, inset squircles and all ten theme combinations. Historical [M1 evidence](../../release-verification.md) and [appearance evidence](../../appearance-verification.md) do not certify a solver.

| Current module | M2 integration |
| --- | --- |
| `web/src/domain/model.ts`, `classic.ts`, `editor.ts` | Reuse ClassicDefinition, Digit/Value, parser and creation reducer for temporary input. Never pass player notes/values as premises. Leave persisted models and classic validation intact. |
| `web/src/app/controller.ts`, `application.ts`, `router.ts` | Keep library saves intact; add separate memory-only solver service once at application mount, add `#/solve`, cancel on screen disposal and terminate on app disposal. |
| `web/src/ui/board.ts` | Reuse editable board for clue input with detached controls. Dedicated read-only result board uses existing CSS/grid conventions without keypad callbacks. |
| `web/src/ui/home.ts`, `library.ts`, `player.ts` | Enable Home Solve; source picker inside Solve. Update absence-of-saved-analysis copy; no player/creator hints or reveal actions. |
| `web/src/storage/repository.ts`, `domain/backup.ts` | No new records, fields or migration. Solver service cannot call repository. Explicit Save Clues uses existing library action. |
| `web/vite.config.ts`, `tsconfig.json` | Vitest includes `tests/unit/**/*.test.ts`; solver tests belong there. Add dedicated worker typecheck config when worker entry is introduced; existing config has DOM libs. |

Architecture selection: independent original-problem MRV exact DFS plus proof-checked shared logical state; Algorithm X is test-only. Counting from human-pruned domains is rejected because a bad elimination could conceal a second solution. Event-driven fair scheduling is recommended over repeated full scans; fixed scans remain a correctness/performance baseline. Bounded Analyze rollout is experimental and initially off by default.

## 2. Entry and temporary workspace

Home **Solve** opens `#/solve`, resuming the in-memory workspace or an empty board. Input sources:

- Manual creation-style input: arrows, digits, erase, repeat-value erase, reset, undo/redo; no notes. Selection remains accessible during a run, but edits are disabled.
- **Paste puzzle**: existing parser removes whitespace and accepts exactly 81 characters (`1`–`9`, `0`, `.`). Success replaces clues and resets input history/selection. Failure preserves input and accepted results.
- **Choose from library**: unfinished drafts or finished puzzles. Draft copies current in-memory cell values, including unsaved edits, with an unsaved-source label. Puzzle copies only immutable `definition.givens`. Never inspect session entries/notes/history. Validate own-property IDs and source existence at click time. A deleted/missing/finished-draft selection errors without replacement.

Explain before paste/source replacement: “Replaces the temporary input.” Display “Temporary input and analysis. Reloading clears them. Your saved play progress is preserved.” Source name/revision is attribution only; later rename/delete/restore/unrelated save cannot retarget copied evidence. Identity uses complete canonical rule semantics plus snapshot/request/version IDs.

**Save Clues as Draft** copies original input into a new ordinary independent M1 draft through the existing library functions, preserving conflict-tolerant creation. It writes no solved values, results, evidence, source history or technique preferences. Stay in Solve and show existing save status. Disable during active work; each explicit click creates a new draft. Backups include that draft normally. The sidebar “Saved” refers to the library; the temporary notice remains visible.

Allow empty, duplicate, locally conflict-free unsatisfiable and complete inputs. Duplicate clues are highlighted and can produce a checked zero witness. A valid filled board is “Already complete”; no zero-step Perfect claim. Unknown fields/versions/rules are rejected, never stripped.

## 3. Modes, limits and actions

**Explain** selected initially; **Analyze** selects the same broad proof profile with a different computation/step preference. Explain favors simpler verified steps; Analyze investigates expected progress within the budget. Neither promises the easiest possible path, skips proof checking or assumes uniqueness.

Time control: proposed integer 1–120 seconds, default 10; presets 1/5/10/30/60/120. Advanced limits expose deterministic work, exact nodes, per-step/run proof nodes and bytes as specified in [contracts §9](2026-09-12-m2-engine-contracts.md#9-limits-persistence-and-benchmark-decision-gate). Show configured family/profile bounds. Mode, limits and input lock while running. Invalid fields block Start locally and reject again at worker decode. Preferences remain in application memory. Increasing time alone does not change proof caps.

**Start** creates a fresh snapshot/request and clears previous results; **Cancel** terminalizes immediately and preserves only previously accepted evidence. **Run again** restarts from original clues with current options, without a saved frontier. **Edit input** displays original clues; the first value-changing action clears results, whereas selection does not. Mode changes affect the next run, not interpretation of an accepted trace.

Navigation cancels active work, preserves input/last accepted result and removes view listeners. Return shows cancelled status. Reload/close clears the workspace. One worker at a time; no unbounded run history. Conditional reruns replace only conditional results; primary reruns/input edits invalidate them.

After primary unique evidence, offer **Uniqueness-dependent analysis**, labeled optional and separate. Start a new bounded conditional operation on original clues plus rechecked unconditional prefix; retain primary board/path/count. Do not import exact solution digits as premises. Show “Uses verified uniqueness as an additional assumption. Does not qualify for Perfect.” Cancel affects only this operation. Disable if uniqueness is unknown/zero/multiple, inconsistent or tied to different input. Conditional results never replace or prove primary uniqueness.

## 4. Results and explanations

Show independent fields:

| Field | Display contract |
| --- | --- |
| Run outcome | Running / Complete / Cancelled / Time limit reached / Resource limit reached / Error. A terminal run may retain partial evidence. |
| Logical path | Solved logically / No further supported step within this profile / Incomplete technique investigation / Contradiction detected / Invalidated. Distinguish finite-profile exhaustion from interruption. |
| Solution evidence | No solution—verified; Unique solution—verified; Multiple solutions—at least two; At least one solution—uniqueness unverified; Existence and solution count unknown. |
| Perfect | Verified under profile/version only for complete unconditional path plus independent unique evidence, initially incomplete input, supported rules and no fallback. Otherwise Not established / Not applicable / Engine inconsistency. |

Primary board shows an accepted valid witness if available; otherwise the last accepted logical board labeled **Partial—not a solution**. **Input / Result** toggles read-only inspection. **Solution 1 / Solution 2** shows distinct witnesses/differences without claiming which was intended. Distinguish clues, derived placements and search completion with text/symbols as well as color.

**Step-by-step explanation** presents accepted ordered steps with family/alias/version, exact effects and expandable proof graph. Shared subproofs use accessible references. Show all rule dependencies and discharged assumptions; conditional roots are permanently labeled. Selecting a past step highlights premise/effect cell roles and shows historical candidates in its text, never as misleading current candidate marks. Interactive reverse-board replay is a verification tool, not a required screen feature.

**Solution verification** is separate: original-problem method/version, witnesses, root exhaustion status, nodes/backtracks and elapsed time. Finding one alone is explicitly not uniqueness. Counting after a complete logical path does not add a search boundary. Otherwise show **Search-assisted completion** at the actual fallback boundary with reason, successful branch guesses and failed-branch totals. No full failed-search tree or exact propagation relabeled as human deduction.

**Technique coverage** displays bounded support and run statuses: pending, found, exhausted-within-profile, soundly excluded or interrupted with reason. Conditional families are inapplicable to the primary run. Do not claim all techniques or that guessing is necessary. Scores are optional computation diagnostics, never confidence in digits.

Use native details/summary, lazy children and pagination of large proof lists while retaining the complete bounded graph. English text via safe DOM helpers; grid/row/gridcell semantics, focus, keyboard selection and polite phase/evidence announcements. No keypad on result board. At 1280×800 Start/Cancel/status remain reachable without scrolling through proofs. Use existing semantic CSS variables and test Light/Dark × all five themes; preserve M1 layout.

## 5. Truth, budgets and failure semantics

Detailed types/algorithms are authoritative in [engine contracts](2026-09-12-m2-engine-contracts.md). Mandatory invariants:

1. One shared monotone candidate/fact state per branch. Every applied effect has a complete checked proof from clue/rule roots and prior checked facts; discharge closes temporary assumptions. Scores never establish truth.
2. Exact enumeration starts from original clues/rules independently. Zero/unique needs root exhaustion (or direct duplicate zero); two valid distinct witnesses means at least two. Deadline/generator close cannot fake exhaustion.
3. Proposed 70% human ceiling reserves the rest of the same total budget for classification; reaching that ceiling is incomplete logic, with identified fallback. Benchmark this policy before validating defaults.
4. Chunk ACK grants transport credit, not effect acceptance. All proof nodes/dependencies must be checked before an atomic candidate/trace commit. Cancel discards partial staging and late messages.
5. Main checking/rendering/startup count toward the deadline. Cancel needs no worker acknowledgement. Suspended browsers check deadlines before accepting on resume.
6. Contradictory human/exact evidence produces an engine-inconsistency diagnostic. Quarantine invalid logical/Perfect claims, discard exhaustion conflicting with validated witnesses, retain independently valid witnesses. Never silently choose a preferred conclusion.
7. No persisted solver metadata/preferences. IndexedDB/library/backup versions remain 1. Explicit Save Clues is the sole solver-screen library mutation.

## 6. Acceptance and review gate

The [revised plan](../plans/2026-09-12-m2-classic-solver.md) maps all requirements to exact files, tests and dependencies. Release gates include independent named-family fixtures/force-forbid checks, mutated proof rejection, mock composition, deterministic/invalidation comparisons, zero/one/two evidence races, production worker backpressure/cancellation, workspace/backup isolation, English/accessibility/themes and measured time/work/proof/heap budgets. Do not claim solver tests or benchmarks during this documentation session.

No new product answer is required to finish this plan. Review finite technique bounds, memory-only workspace, phase reserve, optional conditional action and resource recommendations. Performance calibration and rollout value remain measured implementation gates. The completed interview remains closed. **Wait for explicit design approval before executing any solver implementation task.**
