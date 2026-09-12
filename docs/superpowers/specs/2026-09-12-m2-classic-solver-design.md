# M2 classic Sudoku solver: design for review

Date: 2026-09-12. Status: **PROPOSED — ready for review; implementation is not authorized.**

Companion: [implementation plan](../plans/2026-09-12-m2-classic-solver.md). Decisions: [D046–D052](../../decisions.md#d046--m2-design-authorization-and-preserved-requirements).

## 1. Authority, baseline and scope

**Confirmed requirements:** browser-first TypeScript + Vite, plain TypeScript views, IndexedDB for the existing library, longer solver work in a Web Worker; human deductions before identified fallback search; naked/hidden singles, locked candidates, naked/hidden pairs; solved board and expandable ordered trace; solution-count evidence separate from that path; evidence-backed zero/one/multiple classification; configurable limits and Cancel with honest incomplete outcomes; isolated snapshots with no writes to personal play progress. Search-assisted completion cannot certify Perfect. Gameplay hints wait until M5. Construction assistance, variants, community and AI are outside M2.

**Recommendations:** all new contracts, flow details, ordering, algorithms, volatile storage choices and numerical defaults below are proposed together for approval. They resolve routine technical choices without reopening D001–D045. No performance claim or new user approval is implied by this document.

Inspected baseline: clean `release/first-release` at documentation commit `2507adc`, after implemented/verified M1 commit `66b8381`. No applicable `AGENTS.md` in the repository or ancestor directories. Design work starts on `docs/m2-solver-design` from that head. The six requested documents and relevant application modules were inspected. Existing M1 test evidence remains historical evidence in [release verification](../../release-verification.md), not a new M2 test run.

During drafting, concurrent uncommitted UI/layout changes appeared in `web/`. Read-only reinspection found a sidebar application shell, SVG board strokes and optional `BoardOptions.controlsContainer`; the domain, persistence and services contracts remained as inspected. Preserve these changes. M2 screen integration should use the current shell and detached input controls where available, not recreate the former header/board layout. These edits are outside this task's commits and are not certified by the historical M1 evidence.

M2 delivers one classic solver screen. It does not add puzzle generation, a difficulty rating, technique customization, exact counts above two, advanced contradiction techniques, play-state checking, candidate fill, reveal buttons, or a persistent certificate system. A full valid input is supported and explicitly reported as already complete; it does not receive a meaningful puzzle-quality badge from a zero-step path.

## 2. Existing boundaries and proposed approach

| Existing module | Observed contract | M2 use |
| --- | --- | --- |
| `web/src/domain/model.ts` | `ClassicDefinition` version 1; numeric `Value`/`Digit`; `EditorState` contains manual notes/history. No solver metadata. | Reuse value types and copy definitions; solver candidates get their own type. |
| `domain/classic.ts` | `parsePuzzleString`, `conflictingCells`, `isComplete`, `effectiveValues`; private, interleaved unit list. | Reuse input parsing and completed-grid check; leave M1 conflict iteration untouched. Solver owns canonical topology. |
| `domain/editor.ts` | Pure `reduceEditor(context, state, action)` with creation/play modes. | Reuse creation mode for temporary manual input; never pass a solver result to a play reducer. |
| `app/controller.ts` | Library `snapshot/update/subscribe`, serialized aggregate saves; `ScreenServices` has controller/navigation/ID/time services. | Keep persistence controller intact; add a separate solver controller to services. |
| `app/router.ts`, `app/application.ts` | Hash routes and mount/dispose lifecycle; current route union has no Solve. | Add `#/solve`; application owns one volatile solver controller. |
| `ui/board.ts` | Always mounts editing controls; captures `EditorContext` at mount. Concurrent work adds optional `controlsContainer` and SVG grid strokes. | Reuse for input only, preserving current layout support; separate read-only solver board to avoid fake edit permissions. |
| `ui/home.ts`, `ui/library.ts` | Disabled Solve; library rows display lifecycle plus unverified status. | Enable Home Solve; pick a source inside Solve. Clarify that library has no saved analysis. |
| `storage/repository.ts`, `domain/backup.ts` | IndexedDB version 1, `LibraryData.formatVersion: 1`, backup envelope version 1; validators reconstruct known fields. | No new persisted fields or migration in M2. Adding fields without updating validators would lose them. |

Approaches considered:

1. **Recommended: bitmask human engine plus separate exact DFS**, sharing classic topology but not mutable state. Exact search always starts from original givens. Small runtime, deterministic ordering, and count evidence does not depend on the human eliminations being bug-free. A different exact-cover algorithm is used only as a test oracle.
2. Exact-cover runtime plus human engine. Strong exact-solving option, but adds a second production state representation and less direct search diagnostics. Keep it as the independent test algorithm; revisit only if measured runtime needs justify it.
3. One propagation/search pipeline carrying every human elimination into counting. Avoids repeated work, but a bad deduction could falsely remove a second solution and produce a uniqueness claim. Reject for M2 evidence separation.

Pure production files live in `web/src/solver/`; they import domain value types, not DOM, storage or application actions. `web/src/workers/solver.worker.ts` schedules work; `web/src/app/solver-controller.ts` owns request lifetimes; `web/src/ui/solver*.ts` renders input/results/explanations. A static classic capability record (`classic@1`, exact/count/explained support) and ordered technique registry are sufficient. Unsupported kinds, versions, geometry or additional rule fields are rejected at the solver boundary, never stripped to obtain a classic-only claim. A generalized variant/plugin framework waits for M4/M5.

## 3. Entry, input and screen behavior

Home **Resolver** opens `#/solve`. It resumes the current temporary solver workspace for this application lifetime, or starts an empty input. The screen offers manual entry, **Colar puzzle**, and **Escolher da biblioteca** (unfinished drafts and finished puzzles). No Solve/Check/reveal control is added to the player or creator.

- Manual board: same arrows, digits, erase, reset, undo/redo and form-focus behavior as creation. No notes. History lives only in this workspace.
- Paste uses the existing parser: exactly 81 cell characters after whitespace removal; `1–9` clues, `0`/`.` empty. A successful paste replaces the temporary input and resets its history/selection; malformed input leaves it and existing results intact.
- Library draft: copy live in-memory `draft.editor.cells[].value`, including unsaved edits; explicitly label an unsaved source. Puzzle: copy only `definition.givens`. Never read session values, notes, selection or history. Missing/deleted/finished-draft selections get a local error before replacement; picker uses own-property lookup.
- Source replacement is explicit through the picker/paste action. Label beforehand: “Substitui a entrada temporária.” Manual input starts without a library record. Show “Entrada e análise temporárias; perdidas ao recarregar. O progresso dos jogos é preservado.”
- **Salvar pistas como rascunho** is an optional explicit action using existing `createDraft`; copy input clues only, allow conflicts as M1 does, remain in Solve, and show the normal save status. It creates a new record per click and never saves a solved board or analysis. Disable during an active run.
- Syntactically valid duplicate clues may be analyzed. Highlight conflicts; the worker returns zero with an explicit duplicate-unit witness. Conflict-free input can still be unsatisfiable. Empty input is permitted and normally yields multiple witnesses.
- **Resolver** starts a fresh request with a copied immutable snapshot. Disable source/input changes and duplicate Start while running; selection and explanation expansion remain available. **Cancelar** remains enabled. After terminal outcome, **Editar entrada** returns to the original clues. The first value change/replacement clears the old result; selection alone does not. **Executar novamente** starts from the same original input, clears prior run evidence, and uses the current limit.
- Navigating away cancels active work, preserves the last accepted partial result/input in application memory, and destroys screen listeners. Returning shows it as cancelled. Reload/close loses this workspace and limit preference. Saving clues first uses the established durable draft flow.

Result layout: prominent read-only solved board if a validated solution exists; otherwise the last committed human board, labeled **Parcial — não é uma solução**, or the conflicting input. Keep original clues visually distinct. A switch **Entrada / Resultado** permits inspection without modifying either. If multiple solutions are evidenced, show **Solução 1 / Solução 2**, identifying differing cells. No solution is presented as the intended answer of an ambiguous puzzle.

Alongside the board show four separate facts: run outcome, human path, count evidence, and conditional quality. Expand **Explicação passo a passo** to show the ordered human deductions and any search boundary/completion. Expand **Verificação de soluções** separately for exact-check method/version, exhaustion status, elapsed time, nodes and witnesses. Trace entries expand to textual premises, placements and eliminations with one-based row/column labels. M2 requires text plus affected-cell highlighting when an entry is selected; interactive backward board replay is a test tool, not a required UI feature. Do not paint past candidate marks onto the final grid as if they were current; highlight cell roles and show past candidates in the entry text.

Use native `details/summary`, keyboard focus, accessible row/gridcell semantics, visible focus, and text/symbol distinctions for givens/results and premise/effect highlights. No editing keypad on the result board. Status announcements use a polite live region for phase/evidence changes, not every node update. User-facing text stays Portuguese. At 1280×800, Start/Cancel and status remain reachable without scrolling through the trace; expanding long trace sections may scroll the page.

## 4. Identity and candidates

Proposed type contracts (documentation, not implemented declarations):

```ts
type CellIndex = number; // integer 0..80, row-major
type Mask = number;      // integer 0..511; bit (digit - 1)
type UnitId = number;    // 0..8 rows, 9..17 columns, 18..26 boxes
type SourceRef =
  | { kind: "manual" | "paste" }
  | { kind: "draft" | "puzzle"; id: string; name: string; libraryRevision: number };
interface SolverSnapshot {
  snapshotId: string;             // new UUID whenever clue content/source is replaced
  inputRevision: number;          // local counter, increases on value edits including undo
  contentKey: string;             // "classic@1:" + exactly 81 digits, zero for empty
  definition: Readonly<ClassicDefinition>;
  source: SourceRef;              // attribution only, never an update destination
}
interface RunKey {
  requestId: string;              // new UUID per Start, even for an identical snapshot
  snapshotId: string;
  inputRevision: number;
  contentKey: string;
}
interface CandidateState {
  revision: number;               // 0 initially, increments once per committed deduction
  values: readonly Value[];       // 81; includes givens + explained placements
  masks: readonly Mask[];         // 81; zero on filled cells
}
```

Runtime validation precedes casting. Deep copy nested givens; TypeScript `Readonly` alone does not enforce isolation. Snapshot source revisions are provenance, not correctness keys: the existing library revision changes on unrelated saves, and puzzle definitions have no per-record revision. Content key, snapshot ID and local input revision bind results to exact clues. Rename, deletion, restore or later editing of the original record cannot mutate the copied input or attach evidence to a new record. Unrelated autosaves do not invalidate it. Each tab has an independent controller/worker.

Topology has 27 units, three unit memberships and 20 distinct sorted peers per cell. All masks use `1 << (digit - 1)` and `ALL = 0x1ff`. Initialize each empty mask to `ALL` minus digits already present in its peers; filled cells have mask 0. Candidates are a sound superset of possible completions, not a promise that every candidate extends to a solution. Player notes are never an input.

Human state is monotone: values are placed only in empty cells; candidate bits only disappear. Do not recompute masks from givens after eliminations. Placement clears that cell's mask and removes its digit from all empty peers, as explicit mechanical effects attached to that step. Do not silently place newly created singles; they must become subsequent explained steps. A deduction must make a nonempty change. Starting with at most 729 candidate bits, at most 729 successful human steps are possible because every step removes at least one bit (a placement clears its last bit too).

Before scanning and after every atomic step, detect duplicate assigned digits, empty cell with mask 0, or an unplaced unit digit with no supporting candidate. Initial duplicate clues directly prove zero. Other human contradictions are recorded diagnostically and sent to the independent exact check; they do not themselves upgrade count evidence. If exact search finds a witness incompatible with committed human values or masks, report an engine inconsistency, withdraw the human trace's verified status and any Perfect claim, and retain only independently checked count/witness evidence.

## 5. Technique contracts, exact coverage and ordering

```ts
type TechniqueId = "naked-single" | "hidden-single" | "locked-pointing"
  | "locked-claiming" | "naked-pair" | "hidden-pair";
interface Technique {
  id: TechniqueId;
  version: 1;
  requires: readonly ["classic@1", "candidate-state@1"];
  find(state: CandidateState): DeductionProposal | null;
}
```

Each detector is pure, reads the same candidate state, returns the first productive pattern in canonical order, and never searches for a solution or assumes uniqueness. `null` means no instance of this supported technique in this state. Registry set ID is `classic-baseline@1`, fixed in the M2 UI. Each technique has its own Markdown description, positive/negative fixtures and executable detector; see the plan's exact file map.

| Priority / technique | Premise and effect | Canonical enumeration |
| --- | --- | --- |
| 1 Naked single | One candidate in an empty cell; place it. Full-house cases are covered here, not a separate technique. | Cell 0..80. |
| 2 Hidden single | For an unplaced digit in a unit, exactly one empty candidate position; place it. | Unit 0..26, digit 1..9. |
| 3 Locked pointing | In a box, all supports of an unplaced digit (2 or 3 cells) lie on one row/column; eliminate that digit from that line outside the box. | Box 18..26, digit 1..9, row then column. |
| 4 Locked claiming | In a row/column, all supports of an unplaced digit (2 or 3 cells) lie in one box; eliminate from the box outside the source line. | Row 0..8 then column 9..17, digit 1..9. |
| 5 Naked pair | Two distinct cells in a unit each have the identical two-bit mask; remove both digits from every other empty cell in that unit. | Unit 0..26, lexicographic cell pair `(a,b)`, `a < b`. |
| 6 Hidden pair | Two unplaced digits each have exactly the same two supporting cells in a unit; remove all other candidates in those two cells. | Unit 0..26, lexicographic digit pair `(a,b)`, `a < b`. |

Single-support intersections and degenerate hidden pairs are handled by singles first. An already clean pair/intersection with no eliminations returns no proposal and does not consume a step. Three cells with the same two-bit mask are a contradiction, not a productive naked-pair pattern: require exactly two such cells for the detector; exact verification handles remaining contradictory states. Pairs operate in rows, columns and boxes. A pair lying in two units may yield separate steps for each, in canonical order; no combined locked-pair technique is added.

Commit all eliminations of one pattern as one step, ordered by cell then digit; deduplicate targets. After every committed step restart at priority 1. Stop as solved, contradicted, interrupted, or after a complete six-technique pass without a productive step. Only the latter is **stalled**. Stalled means “Nenhuma das técnicas disponíveis encontrou outro passo”, never “É necessário adivinhar” or “Não existe solução lógica”. No X-Wing, triples/quads, chains, uniqueness assumptions or advanced contradiction technique is included.

The individual technique meanings follow the author's [HoDoKu singles](https://hodoku.sourceforge.net/en/tech_singles.php), [intersections](https://hodoku.sourceforge.net/en/tech_intersections.php), [naked subsets](https://hodoku.sourceforge.net/en/tech_naked.php) and [hidden subsets](https://hodoku.sourceforge.net/en/tech_hidden.php) documentation. Ordering, grouping, degenerate-case policy and version IDs are this project's recommendations.

## 6. Deduction and explanation schema

```ts
interface CandidateRef { cell: CellIndex; digit: Digit }
type Premise =
  | { kind: "cell-candidates"; cell: CellIndex; mask: Mask }
  | { kind: "unit-support"; unit: UnitId; digit: Digit; cells: CellIndex[] };
interface DeductionProposal {
  technique: TechniqueId;
  techniqueVersion: 1;
  beforeRevision: number;
  units: UnitId[];
  premises: Premise[];
  placements: CandidateRef[];     // singles: exactly 1; other techniques: empty
  eliminations: CandidateRef[];   // direct technique effects only
}
interface DeductionStep extends DeductionProposal {
  kind: "deduction";
  index: number;                 // 1-based position in trace
  afterRevision: number;         // beforeRevision + 1
  peerEliminations: CandidateRef[];
  // cleared mask of a placed cell is reconstructed from its prior state;
  // it is not described as an elimination of the placed digit.
}
type TraceEntry = DeductionStep
  | { kind: "search-start"; index: number; stateRevision: number;
      reason: "baseline-stalled"; method: "classic-dfs@1" }
  | { kind: "search-completion"; index: number; stateRevision: number;
      witness: Digit[]; assignments: CandidateRef[];
      decisions: CandidateRef[]; nodesToWitness: number; backtracksToWitness: number };
```

`applyDeduction(state, proposal)` checks revision, actual premises (including exhaustive unit support), technique-specific conditions and exact effect set before producing a new state/step. It rejects mutation of givens, filled targets, absent candidate removals, duplicate/no-op effects and unsupported versions. `peerEliminations` is computed centrally and compared during replay; it is not discretionary detector output. A contradiction after a valid commit is recorded separately with its state revision. Invalid proposals are engine errors, not evidence of unsatisfiability.

Explanation is derived from technique/version and typed premises/effects; no arbitrary HTML or opaque prose from the worker. Naked-single explanation cites the sole remaining candidate; hidden-single cites the unit and its exhaustive support; intersections cite source supports and target unit; pairs cite both cells, both digits and eliminated candidates. Earlier steps plus initial peer exclusions establish the candidate premises. Initial exclusion explanation is available as a preamble (“candidatos calculados pelas pistas”), not 81 fabricated human steps. Render using `textContent`/existing safe DOM helpers.

Example: in revision 0 on a one-hole solved board with cell 0 blank, mask 16 represents digit 5. The first naked-single proposal has premise `{ kind: "cell-candidates", cell: 0, mask: 16 }`, placement `{ cell: 0, digit: 5 }`, empty direct eliminations, and no peer eliminations if every peer is filled. It produces revision 1. For a pair, retain the two cell masks and the common unit; unit-support premises are mandatory for hidden pairs and intersections.

The trace is the actual human prefix, then at most one search-start and one search-completion record. At stall, add search-start immediately before exact work. First exact witness, if compatible with the prefix, fills remaining cells in one clearly search-assisted completion record. `decisions` lists only guesses on the successful DFS branch in branch order; deterministic exact propagation and all residual assignments remain labeled search-assisted. Unsuccessful branches are summarized by node/backtrack totals, not disguised as deductions. M2 does not retain the entire search tree. On timeout/cancel before a witness, search-start can remain without completion. Count verification after a completed human path adds no search entry and does not mark that path search-assisted.

Replay rebuilds revision 0 from givens, validates and applies each deduction, then checks any search witness against original clues and prefix. It never reruns technique selection to accept the same author's mistake: premise checking and effect reconstruction are separate from detector enumeration. Search assignments must be exactly the residual differences, and decisions must be distinct cell assignments matching that witness. A search summary is not a portable proof of count exhaustion.

## 7. Exact solving, count evidence and quality

Production exact method: `classic-dfs@1`, complete depth-first enumeration with MRV (fewest legal candidates), lowest-cell tie break, digits ascending. Recompute legal masks from assigned values in its own branch state, propagate naked/hidden singles until fixed point, and prune only a duplicate, empty domain or missing unit support. Copy branch values or use a reversible local stack; use an explicit DFS stack so scheduling can pause without losing unexplored alternatives. Human masks are never passed in. No uniqueness-based or human-pair pruning, randomized order or transposition table in M2.

This propagation/search strategy is supported by [Norvig's original solver essay](https://www.norvig.com/sudoku.html); counting, deterministic tie breaks, resumable scheduling and the evidence contract here are project design choices. His timings are not estimates for this TypeScript implementation or for uniqueness checking.

Orchestration is sequential within one worker:

1. Validate schema/capability. Bad syntax/unsupported semantics terminate with a typed error and no count claim. Duplicate givens produce checked zero evidence immediately.
2. Initialize and run the human loop. On solved, emit a validated witness immediately; on stall, emit search-start; on contradiction, retain diagnostic partial path. If interrupted, preserve that exact path status and do not start further phases.
3. With remaining total budget, initialize exact enumeration from **original givens**. After a human solution, still enumerate from original clues without seeding the solution counter with it; it is independent existence evidence, not an extra discovered solution.
4. Independently validate every completed assignment (`isComplete` plus givens preservation and strict shape/digit checks) before counting or showing it. Deduplicate by 81-digit serialization. Emit immediately on a new witness.
5. Stop enumeration at two distinct witnesses or after exhausting the root frontier. First witness at a human stall provides the search-assisted board/trace completion; keep counting even after the board is solved. Do not resume human techniques inside a guessed branch or relabel exact propagation as the original human path.

```ts
type CountEvidence =
  | { kind: "unknown"; lowerBound: 0 | 1; witnesses: Digit[][]; exhaustive: false }
  | { kind: "zero"; witnesses: []; proof:
      { kind: "duplicate-givens"; unit: UnitId; digit: Digit; cells: CellIndex[] }
      | { kind: "exhausted"; method: "classic-dfs@1"; nodes: number } }
  | { kind: "unique"; witnesses: [Digit[]]; exhaustive: true;
      method: "classic-dfs@1"; nodes: number }
  | { kind: "multiple"; witnesses: [Digit[], Digit[]]; lowerBound: 2;
      exhaustive: false };
type HumanStatus = "not-started" | "solved" | "stalled" | "contradiction"
  | "incomplete" | "invalidated";
type RunOutcome = "running" | "complete" | "timeout" | "cancelled" | "error";
```

Unknown witnesses have length equal to `lowerBound`. They may come from a validated human completion even when exact search has found none. Exact exhaustion evidence refers to the original-root enumeration, never just the successful branch. Multiple means **at least two**, not exactly two; `exhaustive: false` means M2 did not establish the total count. Evidence is process evidence from a tested algorithm plus explicit solution/duplicate witnesses, not an externally verifiable cryptographic certificate.

| Observed evidence | Count presentation | Human/path implication |
| --- | --- | --- |
| Duplicate clues or exhaustive search with no solution | “Sem solução — verificado” | A contradiction need not supply a completed path. |
| One valid witness; second-solution search unfinished | “Pelo menos uma solução; unicidade não verificada” | Board can be solved while the check is incomplete. |
| Exhaustive root enumeration found exactly one | “Solução única — verificada” | Says nothing by itself about human technique coverage. |
| Two distinct valid witnesses | “Múltiplas soluções — pelo menos duas” | Display both; no exact-count claim. |
| No witness and unfinished check | “Existência e quantidade de soluções desconhecidas” | Stalling/time spent is not zero evidence. |

Pure `deriveQuality(snapshot, humanStatus, trace, count)` returns `verified-baseline`, `not-established`, `not-applicable` or `inconsistent`. Only unique evidence **and** a complete replay-valid human path under `classic-baseline@1`, with no search entry, on an initially incomplete input, permits “Critério Perfect verificado com as técnicas básicas v1”. M2 provides this evidence summary, not an assistant target selector or clue-minimality claim. Zero or multiple is not applicable; already-complete input is not applicable; unique with search or unfinished human path is not established. Cancel/timeout does not erase properties already established before stopping.

A sound human completion necessarily fixes the solution, but M2 deliberately requires its separate exact-check evidence before displaying uniqueness/Perfect. If that check contradicts the human path (zero after a valid completion, a different witness, or multiple after a complete deduction path), report inconsistency rather than quietly choosing a solver's conclusion. Keep validated witnesses; quarantine incompatible human evidence. If exact exhaustion itself conflicts with an already validated full witness, discard that exhaustion claim and return unknown with the witness.

## 8. Worker protocol, scheduling and cancellation

Use `new Worker(new URL('../workers/solver.worker.ts', import.meta.url), { type: 'module' })` in the application adapter, as supported by [Vite's worker documentation](https://vite.dev/guide/features.html#web-workers). One dedicated worker per run; terminate/release on every terminal state. Do not move solving onto the UI thread when worker startup fails.

```ts
interface RunOptions { timeLimitMs: number }
interface SolverStats {
  elapsedMs: number; humanSteps: number; exactNodes: number;
  backtracks: number; maxDepth: number;
}
interface SolverCheckpoint {
  humanStatus: HumanStatus;
  humanState: CandidateState | null; // null before valid initialization
  trace: TraceEntry[];
  count: CountEvidence;
  stats: SolverStats;
  diagnostic?: { code: "human-contradiction" | "inconsistent"; stateRevision: number };
}
type SolverErrorCode = "invalid-input" | "unsupported-definition" | "invalid-options"
  | "engine-invariant" | "worker-startup" | "worker-runtime" | "protocol";
type ToWorker = { type: "start"; protocolVersion: 1; key: RunKey;
  snapshot: SolverSnapshot; options: RunOptions; remainingMs: number };
type FromWorker = { protocolVersion: 1; key: RunKey; seq: number } & (
  | { type: "progress"; phase: "validating" | "human" | "exact";
      checkpoint: SolverCheckpoint }
  | { type: "result"; outcome: "complete" | "timeout";
      checkpoint: SolverCheckpoint }
  | { type: "error"; code: SolverErrorCode; checkpoint: SolverCheckpoint }
);
```

`remainingMs` is computed by the main controller immediately before sending Start, subtracting time since the Start click from the selected total budget; it must be positive and no greater than `timeLimitMs`. The worker starts a local monotonic deadline when handling Start. A main-thread watchdog enforces the original total deadline, including worker startup, message delivery and counting; whichever deadline is observed first stops work. Never compare raw `performance.now()` values across realms. Stats measure worker elapsed time; UI also shows total elapsed time from its own clock.

Each run begins with an empty checkpoint (unknown/0, not-started, null human state, empty trace/stats). Every progress message is a self-contained immutable checkpoint, increasing `seq` from 1, so accepting one does not depend on an earlier delivery. Validate envelope/version/key, dimensions/digits, revisions/trace structure, witnessed solutions, evidence consistency and monotone sequence/evidence before atomically replacing the last accepted checkpoint. Ignore wrong-key, duplicate/older sequence, disposed-controller and post-terminal messages; a malformed active message ends the run with protocol error and keeps prior valid evidence. Do not trust a worker-supplied arbitrary explanation string. Snapshot identity stays attached to the accepted result.

Progress at phase changes, each validated witness and count conclusion; otherwise at most once per 100 ms. Display phase, elapsed time, placed cells/steps, exact nodes and 0/1/2 witnesses. No percentage, ETA or explored-node count presented as a proof. Entire trace checkpoints are bounded by the monotone human-step limit plus two search entries; no unbounded failed-branch log. Benchmark clone/validation/render cost before accepting this message frequency.

All heavy loops must checkpoint the deadline at least once per technique-pattern scan chunk, propagation pass and DFS node. Schedule resumable work in slices targeting at most 8 ms, then yield via a task (for example `setTimeout(..., 0)`), not only `await Promise.resolve()`. Commit a deduction, branch transition or witness atomically before emitting; never publish half-applied eliminations. At a deadline, do not begin another unit of work; return the last fully committed state and explicit timeout. These slice/granularity numbers are provisional engineering targets.

**Cancel is a controller operation, not a worker message requiring acknowledgement.** On click: synchronously mark the active request terminal, freeze its last accepted checkpoint as cancelled, clear timers/listeners, then call `worker.terminate()`. No subsequent message can improve or replace this result. Navigation/disposal uses the same ordering. Main watchdog uses the same operation with timeout; error handlers preserve the last accepted checkpoint with error. A worker's own timeout result is accepted only if the run is still active before the main deadline. At any active message receipt, check the main deadline before accepting newer evidence; exact-tie deadline wins. A valid result accepted before a later Cancel click remains complete and Cancel is disabled.

This intentionally preserves only evidence **already accepted by the controller**, not undispatched internal discoveries. No shared memory, cancellation acknowledgement or grace period is necessary. Worker termination can abort running script and discard queued work under the [HTML worker standard](https://html.spec.whatwg.org/multipage/workers.html#dom-worker-terminate); therefore a final worker flush on Cancel cannot be relied on. Evidence milestones are emitted promptly to minimize lost work. An unresponsive worker is bounded by the main watchdog, while a suspended browser may delay timers; on resume the next event checks the elapsed deadline before accepting results.

## 9. Limits and benchmarks required before release

Proposed control: integer seconds **1–120**, default **10 seconds**, presets 1/5/10/30/60/120. One total limit covers validation, human deductions, finding a completion and count verification; no hidden second budget or unlimited mode. A rerun restarts from the original clues with a fresh request; no resume-frontier feature in M2. The limit is retained only for the application's current lifetime. Invalid/NaN/fractional/out-of-range values block Start and are rejected again by the worker.

Default 10 s, 8 ms slices and 100 ms progress are **unmeasured proposals**, not service guarantees. Deterministic correctness tests inject a monotonic clock and work scheduler, including interruption before initialization, mid-human scan, after a deduction, after witness one and before exhaustion. Never use fragile wall-clock timing to prove count behavior.

Before M2 release, record in `docs/m2-solver-verification.md` the exact app/engine commits, OS, CPU, RAM, Node/browser versions, power mode, fixture IDs/hashes/provenance and commands. Measure production build in foreground desktop Chromium on the user's PC; separately use a documented 4× CPU-throttle profile as a slower-device approximation, not a claim about every machine. Include 5 cold worker starts and at least 30 warm runs per benchmark case; report p50/p95/max, not just averages.

Corpus: one-hole/full grids; existing easy puzzle; positive end-to-end examples for every baseline technique; hard sparse unique grids; locally conflict-free unsatisfiable grids; immediate duplicates; a controlled exactly-two grid; empty grid; deterministic clue-removal/permutation samples; and an input that consumes the limit before classification. Record time to first board separately from time to conclusive count, human/worker startup time, nodes/depth/backtracks, payload bytes, peak retained trace size, UI long tasks and Cancel/deadline latency. Count corpus setup and independent labels are defined in §11.

Provisional release targets: all fixed correctness fixtures produce their independently established classifications within 10 s on the baseline PC; p95 total classification ≤2 s for easy/technique fixtures, ≤10 s for hard unique/unsatisfiable fixtures; visible Cancel feedback ≤100 ms p95 and ≤250 ms max while foreground; main deadline overshoot ≤250 ms max; no solver-origin main-thread task >50 ms for checkpoint acceptance/result rendering at those fixture sizes. Repeat Start/Cancel 100 times and check worker/listener cleanup and retained-memory stability. Deliberate over-budget cases must time out honestly. If targets fail, record the result and tune implementation/defaults; never relax evidence semantics or claim the proposed defaults were validated. Material range/default changes must be reflected in the decision log and review record before release.

## 10. Persistence and backup implications

Recommended M2 solver input, local history, limit preference, trace, results and evidence are memory-only, surviving in-app navigation but not refresh. Explicit **Salvar pistas como rascunho** writes only an ordinary M1 draft. Solver never mutates `Puzzle`, `PlaySession`, their history, settings or saved analysis metadata. The global “Salvo” indicator describes library data only; the temporary-workspace notice remains visible.

Thus IndexedDB schema version 1, library format version 1 and backup envelope version 1 remain unchanged. No hidden localStorage/sessionStorage cache and no solver-report import/export format. Existing backups exclude temporary input/results; normal backup export still includes explicitly saved clue drafts. Change library/player copy to “Nenhuma análise salva para este jogo. Use Resolver para uma análise temporária.” This avoids implying that a temporary analysis updates durable metadata; lifecycle statuses are unchanged.

Future persisted results would require explicit semantics/versioned records binding content key, engine/rule/technique versions and completeness, stale-evidence rules, validation and restore handling, plus a migration/backup design. That is a later extension, not an implicit M2 obligation. This proposal does not change autosaving of personal drafts and play progress under D018/D027.

## 11. Fixtures, independent verification and acceptance

Every fixture records original givens, origin/license where applicable, expected capped count and witnesses, whether enumeration exhausted, expected first technique or trace prefix when relevant, and the oracle version/command that established its label. Never use the production solver's output alone as a golden answer. Existing `web/tests/fixtures.ts` supplies `PUZZLE`/`SOLUTION`; do not assume its count until independently checked.

Repository-owned seed fixtures, derivable without downloading data:

| ID | Construction | Expected evidence to verify independently |
| --- | --- | --- |
| `complete` | Existing `SOLUTION`. | One assignment, zero human steps, already-complete quality label. |
| `one-hole` | Existing `SOLUTION` with index 0 cleared. | Unique, first step naked single at index 0 = 5. |
| `duplicate` | Existing `SOLUTION` with index 1 set to 5. | Zero with row/box duplicate witness. |
| `no-place` | Row 1 = `123456780`, row 2 = `000000009`, remaining rows zero. | No duplicate givens, zero; r1c9 has no legal digit. |
| `two-rectangle` | Existing `SOLUTION` with indices 3, 4, 30, 31 cleared. | Exactly two completions (swap 6/7 at those four cells); M2 displays at least two. |
| `empty` | 81 zeros. | At least two distinct valid witnesses; do not exhaust all solutions. |

Independent test oracle: a test-only set-based Algorithm X exact-cover enumerator, implemented from the model of 729 `(row,column,digit)` options and 324 constraints: one per cell, row-digit, column-digit and box-digit. It imports neither production topology, candidate masks, detector functions, `isComplete`, nor exact-search code. Use simple set filtering/recursion, not production bitmasks; explicit root exhaustion and limit 2. The algorithm basis is [Knuth's Dancing Links paper](https://arxiv.org/abs/cs/0011047); linked-node optimization is unnecessary for a small test corpus. A second simple test-only grid checker validates digits, givens and unit permutations with independent loops. These are automated cross-checks, not a formal proof of implementation correctness.

Technique tests include authored candidate-state fixtures for every direction/unit, no-op lookalikes, singleton/three-cell degeneracies, invalid supports, earlier-technique priority and input immutability. Candidate-only synthetic fixtures must be satisfiable under the independent oracle with explicit candidate restrictions; they test local technique soundness, not reachability from original givens. Also require at least one real original-givens trace exercising each technique. Acquire/author and independently label those in plan Task 2, preserving source/license or using project-owned generation. No detector is accepted solely because a synthetic mask test passes.

For each productive fixture deduction: assert exact premises/effects; confirm the pre-state has at least one completion (avoid vacuous unsatisfiable tests); for every eliminated candidate force that assignment in the pre-state and show no completion; for each placement forbid that value and show no completion. Small residual fixtures may enumerate all solutions to compare before/after sets. Oracle timeout is a failed/inconclusive check, never proof of soundness.

Replay tests reconstruct candidates from clues and reject changed technique/version, wrong revision, omitted support cell, spurious elimination, altered witness or hidden auto-placement. Seeded transformations (digit permutation, row/column swap within bands/stacks, band/stack swap and transpose) preserve capped solution count and witness validity; trace order may change because ordering uses canonical cell/unit IDs. Differential exact tests include unique, 2+, unsatisfiable without immediate contradiction and interrupted enumeration; compare solution sets for exhaustible small cases and capped labels otherwise.

M2 acceptance gates:

1. All supported entry sources and exact string syntax work; unsupported definitions and malformed values produce no solver claim. Empty/conflicting/full inputs have documented behavior.
2. Every technique has positive, negative, ordering, soundness and original-givens replay coverage. Fixed input + engine version has the same logical trace and DFS order when run to completion; timings/progress boundaries need not match.
3. Exact count agrees with independent labels; one witness before interruption stays unknown/≥1; root exhaustion is required for unique/zero except a direct duplicate proof; two witnesses always validate and differ.
4. Solved boards and expandable Portuguese traces identify the actual search boundary. Counting-only search never contaminates a complete human path; search-assisted completion never yields Perfect. Contradictory engine evidence is quarantined.
5. Cancel, timeout, worker startup/runtime/protocol failure, stale messages, duplicate/out-of-order sequences, navigation, rerun and disposal retain only prior valid evidence. Test every phase, including the race immediately after witness one and result-versus-Cancel ordering.
6. Solver operations leave library/session state byte-equivalent after prior saves settle, including notes/hidden notes, histories, selection, settings and revision. Only explicit Save Clues may create a draft. Other tabs and source edit/delete/restore cannot retarget evidence.
7. Temporary state survives navigation with active work cancelled; reload clears it. Backup round-trips all M1 data and includes saved input drafts but no results. Library copy does not claim persistent verification.
8. Real worker runs in development and production builds; keyboard/focus/read-only board/trace and the existing M1 suite pass. Complete the measured limits/cleanup matrix in §9 and record failures or unsupported platforms explicitly.

## 12. Review disposition and next gate

The design is concrete without another first-release interview. There are no blocking factual questions for this drafting task. Review may approve or revise the proposed temporary-workspace/no-result-persistence policy, original-clues-only library inputs, exact search summary detail, fixed baseline ordering, and provisional 10 s total limit. Performance defaults remain unvalidated until implementation benchmarks; they are not silently settled by this document.

Approval of this specification is required before executing the plan or writing solver code, as explicitly requested by the user. This design session writes and commits Markdown only. The plan is supplied now under the user's design authorization; its checkboxes represent future work, not completed implementation.
