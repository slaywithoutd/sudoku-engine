# M2 Classic Sudoku Solver Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task after design approval. Steps use checkbox (`- [ ]`) syntax for tracking. This plan does not itself authorize execution or delegation.

**Goal:** Deliver an isolated classic solver with ordered human deductions, an identified search fallback, independently checked count evidence and interruptible worker execution.

**Architecture:** Pure TypeScript solver modules use a shared classic topology but separate human and exact state. A dedicated worker sends immutable evidence checkpoints to a volatile application controller; plain TypeScript views render them without updating play progress or the persisted library graph.

**Tech Stack:** Existing TypeScript 7.0.2, Vite 8.3.0, Vitest 5.0.0, Playwright 1.63.0 and native browser Worker/IndexedDB. Reuse current lockfile; no new runtime dependencies planned.

**Spec:** [M2 classic solver design](../specs/2026-09-12-m2-classic-solver-design.md). Read the entire spec and [decision log](../../decisions.md) before execution.

**Status:** INITIAL PLAN, not started; **requires revision before execution**. The [expanded engine proposal](../specs/2026-09-12-m2-engine-expansion-design.md) revises technique scope, Explain/Analyze scheduling, the multi-constraint interface, proof structure and transport. Its §10 maps the required planning expansion. D053 also supersedes Portuguese examples below with English. Preserve this initial plan as the original detailed baseline; do not execute it as the final broader scope. Implementation still requires design approval.

## Global constraints

- User-facing text stays Portuguese.
- Player notes are never an input.
- Human masks are never passed in.
- No X-Wing, triples/quads, chains, uniqueness assumptions or advanced contradiction technique is included.
- Cancel is a controller operation, not a worker message requiring acknowledgement.
- One total limit covers validation, human deductions, finding a completion and count verification; no hidden second budget or unlimited mode.
- Thus IndexedDB schema version 1, library format version 1 and backup envelope version 1 remain unchanged.
- Gameplay hints wait until M5. Construction assistance, variants, community and AI are outside M2.
- Preserve the M1 behavior and existing dependency pins. Do not touch legacy Spring/Maven paths.
- Do not mark M2 verified until actual correctness, browser and benchmark evidence has been recorded. Numerical performance limits in spec §9 are provisional targets.

## Execution setup and file map

After approval, inspect `git status --short --branch`, latest commits and all applicable instructions again. Preserve newer work. Use `superpowers:using-git-worktrees` if isolation is needed for implementation; this documentation branch is not permission to replace the current checkout. Record the actual approved spec revision. Run baseline gates once in `web/` (`npm ci` if dependencies are absent, then `npm run typecheck`, `npm test`, `npm run build`, `npm run test:e2e`). Diagnose an unexpected baseline failure before attributing it to M2.

Concurrent uncommitted `web/` work appeared during design: sidebar shell, layout/style changes, SVG grid strokes, optional `BoardOptions.controlsContainer`, and browser/visual fixture updates. These were read-only inspected and left intact. Task 9 must integrate into that current shell and preserve detached controls rather than restore the old header/layout. Recheck their final state at execution time; this plan does not grade or commit that work.

The following proposed paths do not exist at the inspected baseline. Existing files named as modifications do exist.

| New production file | Responsibility |
| --- | --- |
| `web/src/solver/types.ts` | All spec value, step, evidence and checkpoint contracts; no DOM or worker globals. |
| `web/src/solver/snapshot.ts` | Strict classic input validation, deep snapshot copy/content identity. |
| `web/src/solver/topology.ts` | Canonical units, sorted peers and unit memberships. |
| `web/src/solver/candidates.ts` | Initialization, mask helpers, contradiction detection, atomic checked step application. |
| `web/src/solver/techniques/singles.ts` | Pure naked/hidden single detectors. |
| `web/src/solver/techniques/locked.ts` | Pure pointing/claiming detectors. |
| `web/src/solver/techniques/pairs.ts` | Pure naked/hidden pair detectors. |
| `web/src/solver/techniques/registry.ts` | Fixed `classic-baseline@1` ordered registry/capability prerequisites. |
| `web/src/solver/human.ts` | Resumable scan/apply loop; no exact search. |
| `web/src/solver/exact.ts` | Resumable original-givens DFS enumeration, cap two. |
| `web/src/solver/evidence.ts` | Witness checks, evidence merging, consistency and derived quality. |
| `web/src/solver/replay.ts` | Separate premise/effect validation and trace replay. |
| `web/src/solver/run.ts` | Sequential human then exact orchestration, checkpoint assembly. |
| `web/src/solver/protocol.ts` | Wire types and active-message validation. |
| `web/src/workers/solver.worker.ts` | Worker entrypoint, timing/scheduling and message emission. |
| `web/src/app/solver-controller.ts` | Volatile input, request identity, last accepted evidence, cancellation/watchdog. |
| `web/src/ui/solver.ts` | Input/source/limit controls and result screen lifecycle. |
| `web/src/ui/solver-board.ts` | Read-only grid and selected-step cell roles; no editing controls. |
| `web/src/ui/solver-trace.ts` | Portuguese typed explanations and ordered details. |

Existing modifications: `web/src/app/router.ts`, `web/src/app/controller.ts` (services type only), `web/src/app/application.ts`, `web/src/ui/home.ts`, `web/src/ui/library.ts`, `web/src/ui/player.ts`, `web/src/styles.css`; optionally `web/tsconfig.json`/`web/package.json` only if a separate worker typecheck configuration is required. Domain editor/library/storage/backup models stay unchanged. Keep `domain/classic.ts` independent for witness checking rather than refactoring its private topology into the solver.

Test/support additions: `web/tests/solver/` for fixtures, oracle and shared helper modules; actual Vitest test files under `web/tests/unit/solver/` so the existing `tests/unit/**/*.test.ts` include finds them; browser suites under `web/tests/e2e/`. No new test include is needed. Technique explanations and fixture provenance live in `docs/solver/techniques/` and `web/tests/solver/README.md`. The final release evidence belongs in `docs/m2-solver-verification.md`.

## Shared implementation contracts

All types in spec §§4–8 are exported from `solver/types.ts`, except wire unions exported from `solver/protocol.ts`. Import `Digit`, `Value` and `ClassicDefinition` from the existing domain model. Add these explicit function/result types; the names below are used across tasks:

```ts
// solver/snapshot.ts
makeSnapshot(definition: unknown, source: SourceRef,
  snapshotId: string, inputRevision: number): SolverSnapshot;

// solver/candidates.ts
type Contradiction =
  | { kind: "duplicate"; unit: UnitId; digit: Digit; cells: CellIndex[] }
  | { kind: "empty-domain"; cell: CellIndex }
  | { kind: "missing-support"; unit: UnitId; digit: Digit };
initializeCandidates(givens: readonly Value[]): CandidateState;
findContradiction(state: CandidateState): Contradiction | null;
applyDeduction(state: CandidateState, proposal: DeductionProposal):
  { state: CandidateState; step: DeductionStep; contradiction: Contradiction | null };

// solver/human.ts and solver/exact.ts
type WorkEvent =
  | { kind: "work" }
  | { kind: "deduction"; state: CandidateState; step: DeductionStep }
  | { kind: "human-stop"; status: "solved" | "stalled" | "contradiction";
      state: CandidateState };
humanSteps(givens: readonly Value[]): Generator<WorkEvent, void, void>;
type ExactEvent =
  | { kind: "work"; nodes: number; backtracks: number; maxDepth: number }
  | { kind: "witness"; values: Digit[]; decisions: CandidateRef[];
      nodes: number; backtracks: number; maxDepth: number }
  | { kind: "exhausted"; nodes: number; backtracks: number; maxDepth: number }
  | { kind: "cap-reached"; nodes: number; backtracks: number; maxDepth: number };
exactSteps(givens: readonly Value[]): Generator<ExactEvent, void, void>;

// solver/replay.ts and evidence.ts
replayTrace(snapshot: SolverSnapshot, trace: readonly TraceEntry[]): CandidateState;
isWitness(givens: readonly Value[], values: unknown): values is Digit[];
type Quality = "verified-baseline" | "not-established" | "not-applicable" | "inconsistent";
deriveQuality(snapshot: SolverSnapshot, humanStatus: HumanStatus,
  trace: readonly TraceEntry[], count: CountEvidence): Quality;

// solver/run.ts
interface RunClock { now(): number }
interface RunScheduler { yieldTask(): Promise<void> }
runSolver(start: ToWorker, clock: RunClock, scheduler: RunScheduler,
  emit: (message: FromWorker) => void): Promise<void>;
```

Generators expose bounded work units, not entire synchronous solve calls. A technique's public `find(state)` remains pure and returns the first match; its internal resumable pattern enumerator is consumed by `humanSteps` to honor slice/deadline checks between bounded scans. Exhaustion/cap are explicit events, so closing a generator on interruption cannot accidentally count as exhaustion. `applyDeduction` constructs a local deduction index `beforeRevision + 1`; human deductions precede search entries, and the orchestrator assigns subsequent search indices.

## Task 1: Snapshot, topology and checked candidate state

**Files:** Create `src/solver/types.ts`, `snapshot.ts`, `topology.ts`, `candidates.ts`; create `tests/unit/solver/snapshot.test.ts`, `candidates.test.ts`. Paths in tasks are relative to `web/` unless prefixed `docs/`.

**Consumes:** existing `Value`, `Digit`, `ClassicDefinition`, `parsePuzzleString`, `isComplete`; spec §§4–6. **Produces:** `makeSnapshot`, `initializeCandidates`, `findContradiction`, `applyDeduction`, `UNITS`, `PEERS`, `CELL_UNITS`. Define the complete spec type unions now, even though later tasks implement their producers.

- [ ] Write failing snapshot/candidate tests with explicit arrays and immutability checks:

```ts
import { expect, test } from "vitest";
import { parsePuzzleString } from "../../../src/domain/classic";
import { SOLUTION } from "../../fixtures";
import { initializeCandidates } from "../../../src/solver/candidates";
import { makeSnapshot } from "../../../src/solver/snapshot";
test("one-hole initialization retains a candidate, not an unexplained placement", () => {
  const givens = parsePuzzleString("0" + SOLUTION.slice(1));
  const state = initializeCandidates(givens);
  expect(state.values[0]).toBe(0);
  expect(state.masks[0]).toBe(16);
  expect(state.masks.slice(1)).toEqual(Array(80).fill(0));
  expect(givens[0]).toBe(0);
});
test("snapshot deep-copies clues and rejects extra semantics", () => {
  const definition = { kind: "classic", version: 1, width: 9, height: 9,
    givens: parsePuzzleString(SOLUTION) };
  const snapshot = makeSnapshot(definition, { kind: "manual" }, "snapshot-1", 0);
  definition.givens[0] = 0;
  expect(snapshot.definition.givens[0]).toBe(5);
  expect(() => makeSnapshot({ ...definition, rules: ["diagonal"] },
    { kind: "manual" }, "snapshot-2", 1)).toThrow();
});
```

- [ ] Run `npm test -- tests/unit/solver/snapshot.test.ts tests/unit/solver/candidates.test.ts`; confirm missing exports/modules fail before implementation.
- [ ] Implement strict 81-value validation (reject holes, fractions, strings, NaN, out-of-range, extra definition keys/unsupported kind/version/dimensions), canonical content identity and deep copies. IDs/revisions must be valid nonempty/safe integers; reject nonfinite counters. Reject invalid source shape, never accept a session source.
- [ ] Implement canonical topology using row/column/box formulas; assert in tests 27×9, 3 memberships, 20 sorted peers and no self-peer. Keep filled masks zero, empty masks peer-derived. Use this transition outline:

```ts
// Checked step application, after strict technique-specific premise validation:
const values = [...state.values], masks = [...state.masks];
// Apply all direct eliminations to masks.
// For the single placement: set value, clear its mask, remove digit from empty peers.
// Record every actual peer removal in sorted peerEliminations.
// Require at least one removed bit, then increment revision exactly once.
// Compute contradiction on the resulting state; never auto-place a new singleton.
```

- [ ] Cover stale revision, absent-bit/no-op eliminations, filled/given edits, repeated effects, malformed supports, zero domain and missing-unit-digit support. Freeze test inputs recursively to catch detector/application mutation. Run the targeted files and `npm run typecheck`; expected all pass.
- [ ] Commit only the listed kernel/test files: `feat: define isolated solver snapshots and candidate state`.

## Task 2: Independent oracle and reproducible fixture corpus

**Files:** Create `tests/solver/oracle.ts`, `grid-check.ts`, `fixtures.ts`, `candidate-fixtures.ts`, `test-helpers.ts`, `README.md`, `corpus.json`; create `tests/unit/solver/oracle.test.ts`. Add project-owned fixture authoring script `tests/solver/mine-fixtures.ts` when needed; keep it outside production imports.

**Consumes:** spec §11 fixture recipes; existing `tests/fixtures.ts`. **Produces:** independent `oracleCount`, `checkGrid`; named `ONE_HOLE`, `DUPLICATE`, `NO_PLACE`, `TWO_RECTANGLE`, `EMPTY`, independently verified `HARD_UNIQUE` and `DEEP_UNSAT`; candidate fixtures and a provenance manifest. Shared helpers export `snapshotOf(givens)`, `startOf(givens, limitMs = 10000)` and `candidateState(masks)` using Task 1 types. `startOf` constructs a `start` envelope with protocolVersion 1, matching RunKey, remainingMs equal to limitMs and manual provenance; tests may use stable IDs.

- [ ] Write the independent oracle's contract and failing tests before its implementation:

```ts
// Test-only types: no imports from src/solver or src/domain/classic.
interface OracleOptions {
  limit: 1 | 2;
  allowed?: readonly (readonly number[])[]; // explicit allowed digits per cell
  forbid?: { cell: number; digit: number };
  force?: { cell: number; digit: number };
  maxNodes: number;
}
interface OracleResult {
  witnesses: number[][]; exhaustive: boolean; interrupted: boolean; nodes: number;
}
// oracleCount(givens: readonly number[], options: OracleOptions): OracleResult
// checkGrid(givens: readonly number[], values: readonly number[]): boolean
```

```ts
import { expect, test } from "vitest";
import { SOLUTION } from "../../fixtures";
import { oracleCount } from "../../solver/oracle";
test("independent exact cover enumerates the two rectangle completions", () => {
  const givens = [...SOLUTION].map(Number);
  for (const i of [3, 4, 30, 31]) givens[i] = 0;
  const result = oracleCount(givens, { limit: 2, maxNodes: 1000000 });
  expect(result.interrupted).toBe(false);
  expect(result.witnesses).toHaveLength(2);
  expect(result.witnesses[0]).not.toEqual(result.witnesses[1]);
});
```

- [ ] Run `npm test -- tests/unit/solver/oracle.test.ts`; verify failure. Implement independent unit/grid loops and set-based exact cover: candidate `(r,c,d)` covers columns `9*r+c`, `81+9*r+d-1`, `162+9*c+d-1`, `243+9*(3*floor(r/3)+floor(c/3))+d-1`. Filter candidates by givens/allowed/force/forbid; choose uncovered column with fewest rows, recurse through its rows, remove intersecting rows/covered columns, restore on return. Only empty uncovered columns after all options are explored support exhaustion; maxNodes returns interrupted.
- [ ] Check oracle itself with full, one-hole, duplicate, no-place, two-rectangle and empty seeds. Implement test helpers with exact default IDs/keys and deep copies; add fixture variants for every technique direction/unit with explicit expected premises and effects.
- [ ] Author candidate fixtures: naked pair at cells 0/1 with masks 3/3 and all others 511; hidden pair restrict digits 1/2 in row 0 to cells 0/1; pointing restrict digit 5 in box 0 to cells 0/1; claiming restrict digit 5 in row 0 to cells 0/1. Add column/box transforms and negative patterns; independently assert each positive pre-state is satisfiable. These local fixtures can test a detector directly even if the complete ordered engine would use an earlier technique.
- [ ] Prepare real-puzzle corpus using project-owned deterministic clue removal from `SOLUTION` with fixed seed `0x4d320001`, plus published hard cases only after checking reuse terms and retaining attribution. Independently label every seed. Create a deeper unsatisfiable case by adding a locally legal wrong digit to a verified unique puzzle whose forced alternative the oracle rejects; require that basic initialization detects no duplicate/zero-domain/missing-support. Record a hard unique input and its oracle witness. Do not call a case “deep” or “hard” without recording the property observed.
- [ ] Reserve corpus requirements for real original-givens traces covering all six techniques, to be finalized as detectors land in Tasks 3–5. Generate/review actual fixture data rather than placeholder puzzle strings. If project-owned generation does not produce coverage promptly, inspect the corresponding HoDoKu author examples and reuse only permitted data with provenance. Completeness of this corpus is a dependency of Task 5 acceptance, not a reason to ship missing coverage.
- [ ] Run oracle tests; check its source imports independently (no production solver/checker imports), inspect manifest identities/expected counts and commit: `test: add independent Sudoku oracle and solver fixtures`.

## Task 3: Singles and the human scan loop

**Files:** Create `src/solver/techniques/singles.ts`, `registry.ts`, `human.ts`; extend `candidates.ts`; create `tests/unit/solver/singles.test.ts`, `human.test.ts`; create `docs/solver/techniques/naked-single.md`, `hidden-single.md` from repository root.

**Consumes:** Task 1 state/application contract and Task 2 fixtures/oracle. **Produces:** `findNakedSingle(state)`, `findHiddenSingle(state)`, `humanSteps(givens)`, ordered registry exported as `BASELINE_TECHNIQUES`. This task registers singles only; final baseline ID is exposed to the UI only after Task 5 adds all six.

- [ ] Write a one-hole ordered trace test and hidden-single fixture test; the hidden fixture must have more than one candidate in its target, so a naked-single implementation cannot pass accidentally:

```ts
import { expect, test } from "vitest";
import { ONE_HOLE } from "../../solver/fixtures";
import { humanSteps } from "../../../src/solver/human";
test("one hole produces one explained placement and a solved stop", () => {
  const events = [...humanSteps(ONE_HOLE)];
  const steps = events.filter(e => e.kind === "deduction");
  expect(steps).toHaveLength(1);
  expect(steps[0]).toMatchObject({ step: {
    technique: "naked-single", beforeRevision: 0, afterRevision: 1,
    placements: [{ cell: 0, digit: 5 }], eliminations: [] } });
  expect(events.at(-1)).toMatchObject({ kind: "human-stop", status: "solved" });
});
```

- [ ] Run `npm test -- tests/unit/solver/singles.test.ts tests/unit/solver/human.test.ts`; confirm red. Implement cell-major naked singles and unit/digit-major hidden singles, pure proposals with exhaustive premises. Expose bounded scan yields between candidate pattern checks.
- [ ] Implement orchestration using this explicit priority loop (with resumable yields during each scan):

```ts
// Initialize; reject/record contradiction before scanning.
// Scan techniques in registry order; commit first productive proposal.
// Yield its deduction event; restart registry index at zero.
// If full board, validate then emit solved; full pass without step emits stalled.
// Closing/interruption does not emit stalled or solved.
```

- [ ] Test no implicit cascading placements, restart after elimination-created singleton, already complete input, empty-grid stall, duplicate/zero-domain contradiction, cell/unit/digit tie breaks, and input freezing. Add oracle force/forbid soundness assertions for singles, with a satisfiable pre-state first. Run both files and Task 1 tests; expected pass.
- [ ] Document each technique's prerequisites, statement, ordering and linked fixture IDs. Independently label the existing easy puzzle and record a full singles replay. Commit: `feat: add explained singles and deterministic human solving`.

## Task 4: Locked candidates in both directions

**Files:** Create `src/solver/techniques/locked.ts`, `tests/unit/solver/locked.test.ts`; modify `registry.ts`, `candidates.ts`, `tests/solver/corpus.json`; create `docs/solver/techniques/locked-pointing.md`, `locked-claiming.md`.

**Consumes:** previous state, registry and oracle. **Produces:** `findLockedPointing(state)`, `findLockedClaiming(state)`, priorities 3/4 and their typed premises.

- [ ] Write row/column pointing and row/column claiming tests with exact target lists. Example asserting real removal rather than only technique naming:

```ts
import { expect, test } from "vitest";
import { candidateState } from "../../solver/test-helpers";
import { findLockedPointing } from "../../../src/solver/techniques/locked";
test("pointing removes 5 only from the source row outside its box", () => {
  const masks = Array(81).fill(511);
  for (const i of [2, 9, 10, 11, 18, 19, 20]) masks[i] &= ~16;
  const step = findLockedPointing(candidateState(masks));
  expect(step?.eliminations).toEqual([3, 4, 5, 6, 7, 8]
    .map(cell => ({ cell, digit: 5 })));
});
```

- [ ] Run `npm test -- tests/unit/solver/locked.test.ts`; confirm red. Implement exact support enumeration: ignore placed digits; require 2/3 supports; confinement is checked against *all* source supports; target cells are the target unit minus the source intersection. Include source support premise and both units. Return only productive patterns in canonical order.
- [ ] Add negatives: digit already placed, singleton support, supports span two lines/boxes, missing support, no target bit, and an extra hidden support invalidating the move. Apply all eliminations as one atomic step; check created single becomes a separate next step with priority reset.
- [ ] Verify local fixture satisfiability and force each eliminated candidate with the independent oracle, expecting exhaustive zero. Finalize one original-givens trace for pointing and one for claiming with reviewed snapshots/prefixes; add row/column transformations. Run locked/human tests and update technique Markdown. Commit: `feat: explain pointing and claiming eliminations`.

## Task 5: Pairs, complete baseline and independent replay

**Files:** Create `src/solver/techniques/pairs.ts`, `src/solver/replay.ts`, `tests/unit/solver/pairs.test.ts`, `replay.test.ts`, `technique-soundness.test.ts`; modify `registry.ts`, `candidates.ts`, `tests/solver/corpus.json`; create `docs/solver/techniques/naked-pair.md`, `hidden-pair.md`.

**Consumes:** candidate application, exact stated premises, full fixture corpus. **Produces:** `findNakedPair(state)`, `findHiddenPair(state)`, all six `classic-baseline@1` techniques and `replayTrace(snapshot, trace)`.

- [ ] Add tests of both pair types in rows, columns and boxes; test no-op and three-identical-mask degeneracy, hidden pair with an extra support elsewhere, digits already placed, and overlap in two units. Naked pair example:

```ts
import { expect, test } from "vitest";
import { candidateState } from "../../solver/test-helpers";
import { findNakedPair } from "../../../src/solver/techniques/pairs";
test("naked pair emits every removal in the first matching unit", () => {
  const masks = Array(81).fill(511); masks[0] = masks[1] = 3;
  const step = findNakedPair(candidateState(masks));
  expect(step?.eliminations).toEqual([2, 3, 4, 5, 6, 7, 8]
    .flatMap(cell => [{ cell, digit: 1 }, { cell, digit: 2 }]));
});
```

- [ ] Run `npm test -- tests/unit/solver/pairs.test.ts tests/unit/solver/replay.test.ts`; confirm red. Implement pair scans in the exact spec order; only two-cell/two-digit patterns and productive eliminations. Finalize fixed registry IDs, versions and prerequisites.
- [ ] Implement replay as a separate interpreter: initialize original givens, check revision and every premise against pre-state, recompute the technique's allowed effects independently of detector iteration, compare exact direct/peer effects, commit, then validate any search witness/difference list. Do not call `findNakedPair`/other detector functions from the verifier. Share basic mask/topology operations, not pattern-selection code.
- [ ] Add mutation regressions: altered mask, omitted support, extra target, changed version, missing peer elimination, two revisions skipped, hidden auto-placement, out-of-order trace index, and invalid search witness. Assert each is rejected, and full authentic traces reproduce all values/candidates.
- [ ] For each positive candidate fixture, independently require satisfiable pre-state; force every removed candidate and forbid every placed value, requiring exhaustive zero under candidate restrictions. All six techniques must also appear in at least one final original-givens trace in the manifest. Use independent candidate restrictions only for local soundness; real trace replay begins from givens alone.
- [ ] Run `npm test -- tests/unit/solver` and `npm run typecheck`, inspect corpus coverage and the six technique documents, then commit: `feat: add pairs and replay-verified baseline explanations`.

## Task 6: Exact original-clue enumeration and bounded counting

**Files:** Create `src/solver/exact.ts`, `tests/unit/solver/exact.test.ts`, `differential.test.ts`; extend `tests/solver/fixtures.ts` with oracle-labeled hard/deep-unsatisfiable inputs finalized in Task 2.

**Consumes:** givens/topology only; independent oracle for tests. **Produces:** `exactSteps(givens)` with explicit witness, exhausted and cap events; never accepts human candidate masks.

- [ ] Write tests requiring explicit exhaustion or two distinct witnesses, including the interrupted generator case:

```ts
import { expect, test } from "vitest";
import { exactSteps } from "../../../src/solver/exact";
import { ONE_HOLE, TWO_RECTANGLE } from "../../solver/fixtures";
test("unique input exhausts; ambiguous input stops at two witnesses", () => {
  const one = [...exactSteps(ONE_HOLE)];
  expect(one.filter(e => e.kind === "witness")).toHaveLength(1);
  expect(one.at(-1)?.kind).toBe("exhausted");
  const two = [...exactSteps(TWO_RECTANGLE)];
  expect(two.filter(e => e.kind === "witness")).toHaveLength(2);
  expect(two.at(-1)?.kind).toBe("cap-reached");
});
test("interrupting after the first solution does not signal exhaustion", () => {
  const engine = exactSteps(TWO_RECTANGLE);
  let next = engine.next();
  while (!next.done && next.value.kind !== "witness") next = engine.next();
  expect(next.done).toBe(false);
  expect(engine.return().done).toBe(true);
  // Only the explicit exhausted event can establish a unique count.
});
```

- [ ] Run `npm test -- tests/unit/solver/exact.test.ts`; confirm red. Implement explicit stack frames containing branch values, propagation/scanning cursor, MRV cell, remaining digits and successful-path decisions. Each attempted guessed child increments nodes; initial root counts as one node; backtracks count popped failed/exhausted child frames; maxDepth counts guesses. A witness does not empty the frontier.
- [ ] Recompute legal masks inside each exact branch, propagate singles to fixed point, detect local contradictions, select MRV with cell tie break, branch digits ascending. Yield work at bounded propagation/scan/node intervals. Validate completed boards against original givens before emitting. Keep only two distinct serialized witnesses; full-grid input is handled as one witness then explicit root exhaustion.
- [ ] Compare oracle labels/witness validity for all fixed inputs. Run at least 100 seeded clue-removal/transformation cases, including locally legal wrong clues; compare capped counts, and all witnesses for small exhaustible cases. Never use oracle interruption as a label. A zero result must have root exhaustion; stopping before any leaf must yield no zero claim.
- [ ] Verify deterministic witness/decision ordering independent of scheduling; tests compare events excluding timing. Run exact/differential tests plus `npm run typecheck`; commit: `feat: enumerate classic solutions with explicit count evidence`.

## Task 7: Evidence, quality and human-first orchestration

**Files:** Create `src/solver/evidence.ts`, `run.ts`, `tests/unit/solver/evidence.test.ts`, `run.test.ts`; extend `types.ts` as needed to exactly match approved spec, not to broaden scope.

**Consumes:** human/exact generators, replay and snapshot. **Produces:** `isWitness`, `deriveQuality`, `runSolver`; full checkpoints whose count and path statuses remain separate. Add injected fake clock/scheduler helpers to `tests/solver/test-helpers.ts`.

- [ ] Write a table test for every evidence row and interrupted phase from spec §7. Include this essential no-false-Perfect regression:

```ts
import { expect, test } from "vitest";
import { deriveQuality, isWitness } from "../../../src/solver/evidence";
import type { CountEvidence } from "../../../src/solver/types";
import { snapshotOf } from "../../solver/test-helpers";
import { ONE_HOLE } from "../../solver/fixtures";
test("uniqueness without a complete human path does not establish Perfect", () => {
  const snapshot = snapshotOf(ONE_HOLE);
  const witness = [...ONE_HOLE]; witness[0] = 5;
  if (!isWitness(ONE_HOLE, witness)) throw new Error("Invalid test witness");
  const count: CountEvidence = { kind: "unique", witnesses: [witness], exhaustive: true,
    method: "classic-dfs@1", nodes: 1 };
  expect(deriveQuality(snapshot, "stalled", [], count))
    .toBe("not-established");
});
```

- [ ] Run `npm test -- tests/unit/solver/evidence.test.ts tests/unit/solver/run.test.ts`; confirm red. Implement strict witness checks, capped monotone evidence, human witness de-duplication and quality derivation. Do not mask shape errors with unchecked casts.
- [ ] Implement orchestration exactly: validate → human until terminal path state → exact from original givens with remaining budget. On stall, emit search-start; on first compatible exact witness add residual search completion, retain decision path and prefix. On human completion, emit existence witness, then enumerate independently without counting it twice. Never let exact propagation append human technique steps.
- [ ] Use injected time/work scheduling to stop before initialization, mid-scan, after a committed step, at stall, after first witness, and just before root exhaustion. Emit timeout with the last atomic checkpoint. Every loop uses the selected total remaining deadline; yields are macrotasks. Phase/evidence milestones emit immediately; routine progress is throttled to 100 ms.
- [ ] Inject inconsistent engine outputs: different exact witness after logical placement, multiple after human completion, zero exhaustion despite valid witness, tampered completed grid, invalid proposal. Assert human invalidation/quality inconsistency or exhaustion withdrawal as specified, never false zero/unique/Perfect. Verify duplicate input takes the direct zero proof path and malformed input yields typed error without a count claim.
- [ ] Test counting-only search leaves the human trace pure, search-assisted completion is visibly marked, full input is already complete/not applicable, and no-op pattern scans cannot run forever. Run all solver tests, typecheck and commit: `feat: orchestrate human solving and independent evidence checks`.

## Task 8: Worker protocol and volatile application controller

**Files:** Create `src/solver/protocol.ts`, `src/workers/solver.worker.ts`, `src/app/solver-controller.ts`, `tests/unit/solver/protocol.test.ts`, `solver-controller.test.ts`; create `tests/solver/fake-worker.ts`. If TypeScript worker globals conflict with DOM, add `web/tsconfig.worker.json` and amend `web/package.json` typecheck command; keep this change scoped to worker type checking.

**Consumes:** `runSolver`, wire protocol, existing `BoardAction/reduceEditor`, and snapshot helper. **Produces:** controller/view contracts below, with injected worker/time dependencies for deterministic tests:

```ts
interface SolverViewState {
  editor: EditorState;
  source: SourceRef;
  snapshot: SolverSnapshot;
  timeLimitSeconds: number;
  outcome: "idle" | RunOutcome;
  phase: "validating" | "human" | "exact" | null;
  checkpoint: SolverCheckpoint | null;
  errorCode: SolverErrorCode | null;
}
interface SolverController {
  snapshot(): SolverViewState;
  subscribe(listener: () => void): () => void;
  edit(action: BoardAction): void;
  replaceInput(definition: unknown, source: SourceRef): void;
  setTimeLimit(seconds: number): void;
  start(): void;
  cancel(): void;
  leaveScreen(): void;
  dispose(): void;
}
interface SolverDependencies {
  newId(): string;
  now(): number;
  createWorker(): WorkerPort;
  setTimer(callback: () => void, ms: number): unknown;
  clearTimer(handle: unknown): void;
}
interface WorkerPort {
  postMessage(message: ToWorker): void;
  terminate(): void;
  onmessage: ((event: { data: unknown }) => void) | null;
  onerror: (() => void) | null;
  onmessageerror: (() => void) | null;
}
// createSolverController(deps: SolverDependencies): SolverController
```

- [ ] Write deterministic controller race tests using a fake port storing sent messages and exposing `deliver(data)`; fake clock/timers can advance to exact deadlines. Assert frozen evidence before termination, including synchronous fake late delivery inside `terminate()`:

```ts
// Arrange controller via fake dependencies, start a TWO_RECTANGLE snapshot.
// Deliver matching progress seq 1 with one independently valid witness.
// Cancel; fake terminate attempts to deliver seq 2 claiming multiple.
// Assert outcome cancelled, count unknown/lowerBound 1, terminate called once.
// Start again; deliver old request result; assert current request unchanged.
```

- [ ] Run `npm test -- tests/unit/solver/protocol.test.ts tests/unit/solver/solver-controller.test.ts`; confirm red. Implement schema/key/sequence/evidence validation and atomic acceptance. Validate active wrong-shaped data as protocol failure; ignore well-formed stale keys and older sequences. Before accepting data, compare main elapsed time with deadline; at or after deadline, freeze last accepted state as timeout.
- [ ] Implement controller cancellation in this order: terminalize/invalidate active request → snapshot previous checkpoint → clear timers/listeners → terminate. Dispose is idempotent. Startup/error/messageerror preserves prior evidence and terminates. Main watchdog begins at Start; compute remainingMs before posting and maintain a separate worker-local deadline. Values/source are locked during run; navigation cancels but retains workspace. Replacements/meaningful edits advance snapshot identity and clear result; selection/undo no-op does not.
- [ ] Implement worker entry with literal Vite-supported constructor in the real controller factory. Use a narrow worker-global interface or separately typechecked WebWorker environment; do not add unchecked `any` or mix DOM/WebWorker globals just to silence errors. Worker takes one Start, uses `performance.now()` and a task-yield scheduler, emits versioned messages, catches runtime errors without inventing proof, and is always terminated by the owner on terminal acceptance.
- [ ] Cover malformed options, active duplicate Start, 1/120 s endpoints, source deletion/rename attribution independence, unrelated library revisions, old snapshot/same content/new request IDs, errors in every phase, timeout race and 100 start/cancel loops with no surviving listeners/timers/worker references. Controller must not import Repository or call library update.
- [ ] Run solver controller/protocol tests, typecheck and build. Browser workers are validated in Tasks 9/10; unit mocks alone do not complete this task's integration evidence. Commit: `feat: isolate solver worker lifecycle and cancellation`.

## Task 9: Solver screen, source flow and read-only explanations

**Files:** Create `src/ui/solver.ts`, `solver-board.ts`, `solver-trace.ts`, `tests/unit/solver/explanations.test.ts`, `tests/e2e/solver.spec.ts`, `solver-isolation.spec.ts`; modify `src/app/router.ts`, `controller.ts`, `application.ts`, `src/ui/home.ts`, `library.ts`, `player.ts`, `src/styles.css`, `tests/unit/router.test.ts`. Extend `tests/e2e/helpers.ts` only with shared solver entry/wait helpers actually reused.

**Consumes:** `SolverController`, existing services/createDraft/parser/board/input. **Produces:** `mountSolver(container: HTMLElement, services: ScreenServices): () => void`, `renderTraceEntry(entry: TraceEntry): HTMLElement`, and the following read-only board contract. Highlight role precedence is placement → elimination → premise if roles overlap.

```ts
type CellHighlights = ReadonlyMap<CellIndex, "premise" | "placement" | "elimination">;
interface SolverBoardView {
  update(snapshot: SolverSnapshot, values: readonly Value[], highlights: CellHighlights): void;
  destroy(): void;
}
// mountSolverBoard(container: HTMLElement, snapshot: SolverSnapshot,
//   values: readonly Value[], highlights: CellHighlights): SolverBoardView
```

- [ ] Add failing route round-trip for `{ screen: "solve" }` ↔ `#/solve` and Home enabled action. Define `ScreenServices.solver: SolverController`. Instantiate once in `mountApplication` with injectable factory for browser test harnesses; dispose on application teardown. On solver screen unmount, call `leaveScreen` then remove listeners.
- [ ] Write real-browser entry expectations before rendering the screen:

```ts
// tests/e2e/solver.spec.ts
import { test, expect } from "@playwright/test";
import { SOLUTION } from "../fixtures";
test("one-hole solve shows separate count evidence and an expandable trace", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Resolver", exact: true }).click();
  await page.getByRole("button", { name: "Colar puzzle", exact: true }).click();
  await page.getByLabel("81 células").fill("0" + SOLUTION.slice(1));
  await page.getByRole("button", { name: "Usar entrada", exact: true }).click();
  await page.getByRole("button", { name: "Resolver", exact: true }).click();
  await expect(page.getByText("Solução única — verificada", { exact: true })).toBeVisible();
  await page.getByText("Explicação passo a passo", { exact: true }).click();
  await expect(page.getByText(/Único candidato/).first()).toBeVisible();
  await expect(page.locator('[data-testid="solver-result-board"] [data-cell-index="0"]'))
    .toHaveAttribute("aria-label", /5/);
});
```

- [ ] Run `npm test -- tests/unit/router.test.ts tests/unit/solver/explanations.test.ts` and `npm run test:e2e -- tests/e2e/solver.spec.ts`; confirm new expectations fail for the missing UI. Implement temporary manual input with `mountBoard` in create mode; add paste picker and source picker using live controller snapshot and own-property checks. Source replacement resets history; malformed paste preserves it. Copy original puzzle clues only. Save Clues invokes ordinary `createDraft` once per click; do not save results or read play notes.
- [ ] Build solved/partial/original grid views with native accessible row/cell layout and no editable controls; use a distinct test ID. Add multiple witness toggle and textual difference labels. Use native details for trace/evidence, exact Portuguese status mapping from spec §7, source/temporary-storage notice, initially 10 s integer limit with 1–120 validation, run/Cancel/retry/edit controls. Render initial candidate preamble and typed step premises/effects using safe text nodes. Include no full search-tree UI or gameplay action.
- [ ] Add deterministic explanation tests for all six techniques, search-start/completion, incomplete path, unknown/0/1, zero/unique/multiple, duplicate witness and engine inconsistency. Use one-based Portuguese coordinates. An expanded historical step highlights roles on the result board and lists historical candidates in text; never replaces current result values.
- [ ] Extend browser tests: manual/whitespace/dot imports, bad length/character isolation, conflicting and empty inputs, full-input label, all four source paths, drafts with unsaved edits, deleting a source after capture, copied puzzle with existing mistaken player values/hidden notes, limit form keyboard focus, read-only result keys, navigation cancellation/return and reload clearing. Test source picker replacement notice and missing records.
- [ ] Capture library data after pending M1 saves settle; solve/cancel/rerun/navigate/export and assert unchanged serialized data/revision. Then Save Clues and verify exactly one new draft with input clues, unchanged sessions, and ordinary backup inclusion without analysis fields. Update library/player copy exactly as spec §10. Run browser isolation test through refresh, plus existing backup/lifecycle/board suites touched by integration.
- [ ] Run typecheck, unit suite, build and targeted browser suites; inspect 1280×800/1920×1080 solver screenshots and keyboard focus. Commit: `feat: add temporary solver screen and expandable explanations`.

## Task 10: Production worker acceptance, benchmarks and review record

**Files:** Create `tests/e2e/solver-worker.spec.ts`, `solver-production.spec.ts`, `solver-visual.spec.ts`, `tests/browser/solver-failure.html`, `solver-failure.ts`, `tests/e2e/solver-benchmark.spec.ts`, `playwright.solver-production.config.ts`, `docs/m2-solver-verification.md`; modify `docs/README.md`, `docs/roadmap.md`, `docs/decisions.md`, root `README.md` startup/feature guide. Keep intentional failure injection only in a test harness, not production routes.

**Consumes:** complete implementation and all approved acceptance criteria. **Produces:** reproducible release evidence, actual measured defaults, regression fixtures for issues found, final focused commits. This is not permission to publish, merge or deploy.

- [ ] Add production-worker Playwright checks in `solver-production.spec.ts`: actual solved/count UI from the bundled worker, missing worker asset/startup failure by request interception, and UI responsiveness during real hard runs. Development `solver-worker.spec.ts` uses a test-only harness for unsupported definitions and controllable late-result/cancel/runtime races; label this separately from production evidence. For deterministic timeout outcomes use fake clock at unit level; browser tests assert honest terminal behavior without assuming a particular machine finds exactly one solution in 1 s.
- [ ] Add a separate production Playwright config so the existing development-server suite is preserved. The config owns its isolated preview process and cleanup; no background process against the user's browser profile is needed:

```ts
// web/playwright.solver-production.config.ts
import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: ["solver-production.spec.ts", "solver-benchmark.spec.ts"],
  workers: 1,
  use: { baseURL: "http://127.0.0.1:5175", browserName: "chromium" },
  webServer: {
    command: "npm exec vite preview -- --host 127.0.0.1 --port 5175 --strictPort",
    url: "http://127.0.0.1:5175", reuseExistingServer: false, timeout: 30000,
  },
});
```

Run `npm run build` then `npm run test:e2e -- --config playwright.solver-production.config.ts`. Gate production-only files in the default configuration with `testIgnore` or an explicit project selection so the same tests are not mislabeled as production on port 5174; add that focused modification to `web/playwright.config.ts`. Do not change the user's stable localhost:5173 origin. Benchmark fixtures use a per-case timeout calculated from trial count × selected limit plus startup allowance; avoid the default 30 s timeout for long opt-in measurements.
- [ ] Add benchmark corpus loop recording CSV/JSON results under ignored `web/test-results/`: fixture ID, build/engine version, trial, cold/warm, throttle profile, time to first witness, time to final count, outcome/count/human/search status, nodes/depth/backtracks, progress bytes, trace bytes, long tasks and cancellation/deadline latency. Use Playwright's Chromium CDP session for a documented 4× CPU throttle and restore rate 1 after each profile. Five cold starts + 30 warm trials per case; 100 Start/Cancel cleanup trials. Verify no retained workers after cancellation using tracked worker events and process/profile observations.
- [ ] Execute benchmark as an opt-in suite (tag `@benchmark`; skip unless `M2_BENCHMARK=1` so normal e2e is bounded). Example PowerShell execution:

```powershell
$env:M2_BENCHMARK = '1'
npm run test:e2e -- --config playwright.solver-production.config.ts tests/e2e/solver-benchmark.spec.ts
Remove-Item Env:M2_BENCHMARK
```

- [ ] Record actual machine/browser/commit information and compare every spec §9 target. If defaults need tuning, change the decision/spec/UI together, rerun affected benchmark cases and tests, and obtain review of material behavior changes. Do not invent a browser/machine matrix or claim that CPU throttling certifies another device. Keep intentionally unfinished cases explicitly timeout/unknown.
- [ ] Run final gates once after corrections: `npm run typecheck`, `npm test`, `npm run build`, `npm run test:e2e`; perform production worker check and visual inspection at 1280×800/1920×1080. Test focused form fields, read-only board, native trace expansion, visible Cancel, difference labels and long-trace scrolling. Report tested browser scope; do not claim assistive-technology certification from DOM assertions.
- [ ] Apply `superpowers:requesting-code-review` for the completed implementation under its instructions and active delegation permissions. Review soundness/evidence, cancellation identity/races, trace integrity, persistence isolation and scope. Reproduce material findings, fix with meaningful regressions, then rerun affected gates. Mark implementation-plan tasks complete only from executed evidence.
- [ ] Write the M2 verification record with command outcomes, actual test counts, benchmark table/default decision, artifacts, unresolved limits and review findings. Update handoff/roadmap so M2 implementation status reflects reality and M3 is the next design checkpoint only if acceptance passes. Make focused local commits, including `test: verify classic solver evidence and worker acceptance` and `docs: record measured M2 solver release evidence` as appropriate. Verify clean scoped Git status; do not push/merge/deploy unless separately authorized.

## Plan-to-spec coverage and design-session verification

| Spec requirement | Owning tasks |
| --- | --- |
| Existing boundaries, strict snapshot and capability validation | 1, 8, 9 |
| All inputs, result boards and explicit save-input flow | 9 |
| Candidates, exact technique coverage, ordering/contracts | 1, 3, 4, 5 |
| Structured explanation, search boundary and replay | 3–5, 7, 9 |
| Original-clue exact solving/counting, honest quality | 2, 6, 7 |
| Worker identity, progress, races, cancellation/failures | 7, 8, 10 |
| Configurable total deadline and measured defaults | 7–10 |
| Memory-only results, unchanged backup/schema/play progress | 8, 9, 10 |
| Independent fixtures, soundness and differential correctness | 2–7 |
| Browser accessibility, full acceptance and release evidence | 9, 10 |

Before approving execution, review the companion spec's proposed behavior choices. No blocking product question was found during drafting; accepting this plan is not evidence that the 10-second default meets its benchmark targets. Design-session checks should verify Markdown links, no unresolved placeholders, exact file/interface consistency, requirement coverage and documentation-only diffs. Do not run or report future solver tests as completed during the design task.
