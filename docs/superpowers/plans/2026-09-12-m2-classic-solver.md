# M2 Expanded Sudoku Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task **after explicit design approval**. Steps use checkbox (`- [ ]`) syntax for tracking. This plan authorizes neither execution nor delegation.

**Goal:** Deliver a broad, bounded classic logical engine with Explain/Analyze, independently checked explanations and count evidence, responsive workers and isolated temporary analysis.

**Architecture:** Normalize all declared rules into shared domains/facts and assemble explicit capabilities. Resumable detectors propose proof DAGs; separate checkers and atomic reducers establish the logical path. Original-problem exact DFS, conditional uniqueness analysis, worker transport and the memory-only screen preserve separate evidence and state lifetimes.

**Tech Stack:** Existing TypeScript 7.0.2, Vite 8.3.0, Vitest 5.0.0, Playwright 1.63.0, native Worker/IndexedDB; retain lockfile and no new runtime dependency. These are inspected repository pins, not recommendations to upgrade.

**Spec:** Read [screen/evidence design](../specs/2026-09-12-m2-classic-solver-design.md), [engine contracts](../specs/2026-09-12-m2-engine-contracts.md), [technique matrix](../specs/2026-09-12-m2-technique-coverage.md), [research rationale](../specs/2026-09-12-m2-engine-expansion-design.md) and [decisions](../../decisions.md). The contracts and matrix define signatures/grammars; this plan defines implementation sequence and evidence. Checked steps record completed implementation; unchecked steps remain pending.

**Status:** APPROVED at `0e98c2b`; implementation started 2026-09-12 under D065/D066. Replaces the obsolete ten-task/six-technique plan. See [implementation progress](../../m2-implementation-progress.md) for actual execution evidence. Review baseline `80471d2` on `docs/m2-solver-design`; preserve research `24e0d25` and D058 themes.

## Global constraints

- Browser-first TypeScript + Vite, plain TypeScript views, IndexedDB and worker execution.
- Explain and Analyze modes, defaulting to Explain.
- Scores guide computation; they never establish correctness.
- Every applied deduction must have a checkable explanation.
- Perfect requires independent uniqueness evidence plus a complete logical path derived from clues and declared rules alone. Uniqueness-dependent paths are separate and cannot qualify.
- Finding one solution alone does not prove uniqueness.
- Configurable limits, Cancel and honest incomplete outcomes.
- Isolated solver snapshots must not overwrite personal play progress.
- English UI under D053 and preserved Light/Dark × five themes under D058.
- Gameplay hints wait until M5 is complete. Variant implementation, construction assistance, community and AI remain outside M2.
- All C01–C33 and U01–U05 matrix rows have implementation and independent acceptance gates; a kernel is not the completed expanded release.
- No application code before explicit design approval. Do not change legacy Spring/Maven files or persist solver metadata/preferences.

## Execution setup, paths and review gates

After approval, inspect Git status/log and applicable instructions again; record the approved spec commit. Preserve unrelated edits, use an isolated checkout if implementation needs it. The current root has no AGENTS.md. Run baseline gates once from `web/`: `npm ci` only if needed, `npm run typecheck`, `npm test`, `npm run build`, `npm run test:e2e`. Diagnose existing failures before attributing them to M2. Latest recorded application evidence is 64 unit/storage/route tests and 23 Chromium browser tests, not fresh solver evidence.

All task paths beginning `src/` or `tests/` are relative to `web/`. `docs/` paths are repository-root relative. Implementation is authorized under D065. Changes to pre-existing application files are restricted to `web/src/app/{controller,application,router}.ts`, `web/src/ui/{home,library,player}.ts`, `web/src/styles.css`, `web/tsconfig.json`, `web/package.json`, and test/benchmark configs named below. Preserve `ui/board.ts` behavior; reuse its input API. Repository/domain/backup production files need no solver change.

New production file ownership:

| Path under `web/src/` | Responsibility / exported contract |
| --- | --- |
| `solver/problem.ts`, `solver/snapshot.ts`, `solver/limits.ts` | EngineProblem/value/identity types, shared resource-limit value contract, canonical rule normalization, normalizeClassic/makeSnapshot. |
| `solver/rules/types.ts`, `solver/rules/assemble.ts`, `solver/rules/all-different.ts` | RuleModule and capabilities, assemble, classic semantics only. |
| `solver/state/types.ts`, `solver/state/candidates.ts`, `solver/state/facts.ts`, `solver/state/indexes.ts`, `solver/state/events.ts` | ReadView/StateKey, initialize/commitChecked, proof-root facts, supports, invalidate. |
| `solver/proof/types.ts`, `solver/proof/primitives.ts`, `solver/proof/checker.ts`, `solver/proof/replay.ts` | ProofBundle/checked types, primitive registry, checkProposal/replay; no discovery imports. |
| `solver/proof/tables.ts`, `solver/proof/counts.ts`, `solver/proof/assumptions.ts`, `solver/proof/unique.ts` | Separate finite table, incidence, scope and trade checkers. |
| `solver/techniques/types.ts`, `solver/techniques/registry.ts`, `solver/techniques/manifest.ts` | Discovery/descriptor/ledger contracts, ordered registry, auditable aliases/bounds/status. |
| `solver/techniques/*.ts` named per batch below | Read-only named pattern discovery and versioned grammar validation, separated functions. |
| `solver/indexes/implications.ts`, `solver/indexes/groups.ts`, `solver/indexes/als.ts`, `solver/indexes/templates.ts` | Shared resumable indexes with revision/provenance dependencies. |
| `solver/scheduling/{work,ledger,features,policy,rollout}.ts` | Work budget, fair service ledger, frozen features, two scoring stages, bounded branch simulation. |
| `solver/exact.ts`, `solver/evidence.ts`, `solver/human.ts`, `solver/run.ts` | Original-problem enumeration, count/quality merge, logical loop, phase orchestration. |
| `solver/transport/{protocol,codec,sender,receiver}.ts` | Protocol 2 decoding, bounded UTF-8 chunks, credit/acceptance barriers. |
| `workers/solver.worker.ts`, `app/solver-worker.ts`, `app/solver-controller.ts` | Worker entry, platform adapter, volatile input/run/result lifecycle. |
| `ui/solver.ts`, `ui/solver-board.ts`, `ui/solver-trace.ts`, `ui/solver-coverage.ts`, `ui/solver-copy.ts` | English screen, read-only board, graph expansion, support ledger, typed text. |

Types are owned by these modules, not repeated in a giant `types.ts`. Re-export imports only when needed; dependency arrows are problem → rules/proof value types → state/checker → indexes/techniques → scheduler/human/exact/evidence → run/transport → app → UI. Break the state/checker type cycle using `import type`; primitives receive read-only `CheckContext`. No production module imports tests; exact never imports human/techniques/scheduler. No source changes to Java.

Test infrastructure lives in `tests/solver/`; actual Vitest cases in `tests/unit/solver/` are discovered by current `vite.config.ts`. Browser tests in `tests/e2e/`. Each technique batch creates its matrix fixture JSON, one theorem/explanation Markdown file, detector and separate named grammar checker functions; it is not accepted just because another technique solves the same puzzle.

Every task follows a red/green cycle: add its explicit failing assertions; run its listed command and observe a meaningful failure; implement the described algorithm; rerun focused tests and typecheck; inspect the diff and commit only that task's listed paths with its suggested message. Paths are exact allowlists, never `git add .`. For test helpers not yet available, first use direct assertions, then adopt the helper when its producer task is complete. Review gates reject missing fixture evidence or mismatched signatures; do not advance by marking a family unsupported without an approved scope change.

## Dependency map

T01 oracle → T02 normalization → T03 primitive roots → T04 shared state → T05 proof graphs/tables. T06 exact depends on T02/T04 and is independent of detectors. T07 kernel/manifest → T08 graph indexes → T09 short patterns → T10 basic/complex fish → T11 chains/coloring → T12 ALS → T13 set/combination → T14 forcing → T15 generalized chains → T16 specialized → T17 templates. T18 conditional families depends on T06/T11/T14. T19 scheduling uses all primary families; T20 orchestration uses T06/T18/T19. T21 transport → T22 worker → T23 controller → T24 UI → T25 integration/correctness → T26 benchmarks → T27 release review. Named families can be reviewed independently when prerequisites exist; this plan does not request parallel agents.

## T01 — Independent fixture and oracle foundation

**Files:** create `tests/solver/oracle.ts`, `grid-check.ts`, `fixtures/counts.json`, `README.md`, `tests/unit/solver/oracle.test.ts`. Reuse `tests/fixtures.ts` constants without modifying them.

**Interfaces:** `oracle(input: OracleInput): OracleResult`; input `{givens: number[], domains?: number[], force?: [number,number], forbid?: [number,number], limit: number, maxNodes: number}`; result `{witnesses: number[][], exhausted: boolean, interrupted: boolean, nodes: number}`. Domains are nine-bit input restrictions decoded independently by integer arithmetic. `checkGrid(givens: number[], values: number[]): boolean` is separate plain-loop validation.

- [x] Write count fixture assertions including complete, one-hole, duplicate, no-place, two-rectangle and empty. Independent count labels are established by the oracle, not copied from production:

```ts
const two = oracle({ givens: rectangleHoles, limit: 3, maxNodes: 1000000 });
expect(two.exhausted).toBe(true);
expect(two.witnesses).toHaveLength(2);
expect(two.witnesses.every(w => checkGrid(rectangleHoles, w))).toBe(true);
const stopped = oracle({ givens: Array(81).fill(0), limit: 2, maxNodes: 1 });
expect(stopped.interrupted).toBe(true);
expect(stopped.exhausted).toBe(false);
```

- [x] Run `npm test -- tests/unit/solver/oracle.test.ts`; require observed failure for missing oracle/fixtures.
- [x] Implement set-based Algorithm X with 729 candidate rows and 324 exact-cover columns: cell, row-digit, column-digit, box-digit. Choose uncovered column with fewest rows; recurse by set copies, deleting intersecting rows. Explicitly distinguish no remaining column, dead column, cap and interruption. Use no production topology/checker imports. Construct fixture strings from existing SOLUTION and independent loops; document source/license/hash and command.
- [x] Rerun command and `npm run typecheck`; verify independent complete grids with row/column/box permutations and bad-given mutations.
- [x] Commit listed files: `test: establish independent solver oracle and count fixtures`.

## T02 — Normalized constraints, snapshots and capabilities

**Files:** create `src/solver/problem.ts`, `snapshot.ts`, `rules/types.ts`, `rules/assemble.ts`, `rules/all-different.ts`; tests `tests/unit/solver/problem.test.ts`, `assembly.test.ts`; create `tests/solver/mock-rules.ts`.

**Interfaces:** `normalizeClassic`, `makeSnapshot`, `assemble`, EngineProblem/RunKey and RuleModule exactly as contracts §§1–2. `canonicalJson(value: Json): string` rejects nonfinite/unknown values before serialization. Test-only `makeMockProblem` and `mockRuleRegistry` cover sum/order and noncovering all-different scopes.

- [x] Write assertions for canonical order, deep copies and unknown rules:

```ts
expect(assemble(withUnknownRule(problem), registry).ok).toBe(false);
expect(normalizeClassic(definition).constraints).toHaveLength(27);
expect(canonicalProblem(reverseRuleOrder(problem)).key).toBe(problem.key);
expect(cageAssembly.covers).toHaveLength(0); // three-cell all-different is not a house
expect(snapshot.problem.givens[0]).toBe(5); // mutate original input after snapshot
```

- [x] Run `npm test -- tests/unit/solver/problem.test.ts tests/unit/solver/assembly.test.ts` and observe failure.
- [x] Implement strict normalize → canonical semantic key → roots → assembly. In this task capabilities can reference rule-root handles; T03 verifies them before a ReadView is exposed. Preserve ordered rule arrays, derive covers only with existence premises, and build sorted incidence/peer sets from scopes. Test helpers such as `withUnknownRule` are local builders declared in each test file, never production API.
- [x] Rerun tests/typecheck; verify all 81 classic peer sets (20 peers each) independently and registration permutations/malformed parameter rejection.
- [x] Commit listed files: `feat: normalize solver problems and assemble rule capabilities`.

## T03 — Proof roots and primitive checker boundary

**Files:** create `src/solver/proof/types.ts`, `primitives.ts`, `checker.ts`, `src/solver/state/types.ts`, `facts.ts`, `src/solver/limits.ts`; create `tests/unit/solver/proof-roots.test.ts`. Update T02 rule type imports and primitive registration only as needed to replace temporary interfaces with actual checker ownership.

**Interfaces:** Fact/Proposition/ProofNode/ProofBundle/PrimitiveInput/CheckContext/CheckedInference, plus `checkProposal` per contracts §5. Use a nonexported unique-symbol brand and runtime authenticity check for CheckedStep, constructed only by checker; wire decoders cannot construct it. Shared Limits lives in `solver/limits.ts`; proof types own AssumptionPolicy for later import by technique contracts. `createRoots(assembly: Assembly): ReadonlyMap<FactId, Fact>` establishes domains, clues and rule premises.

- [x] Assert falsified clue, unknown primitive and arbitrary domain root rejection:

```ts
expect(checkRoot({ kind: "given", cell: 0, symbol: 4 }, problem).ok).toBe(false);
expect(checkRoot({ kind: "domain", cell: 2, mask: 1 }, problem).ok).toBe(false);
expect(checkRoot({ kind: "given", cell: 0, symbol: 5 }, problem).ok).toBe(true);
```

- [x] Run `npm test -- tests/unit/solver/proof-roots.test.ts`; require rejection assertions fail before implementation.
- [x] Implement rule dispatch on explicit version IDs; domain-axiom uses full original symbol set, given uses exact clues, all-different/cover derives from assembled semantics. Implement bounded check events and root-reference validation; `checkRoot` is a test adapter that drains this primitive interface, not a second trusted checker. No detector imports.
- [x] Rerun focused tests/typecheck; try cyclic/forward/missing dependencies and altered capability scopes.
- [x] Commit listed files: `feat: establish checked proof roots and primitive registry`.

## T04 — Shared candidates, supports and invalidation

**Files:** create `src/solver/state/candidates.ts`, `indexes.ts`, `events.ts`; reuse `facts.ts` original-root authority and retain derived facts in the candidate owner; tests `tests/unit/solver/candidates.test.ts`, `events.test.ts`. Bring forward the minimal `proof/primitives.ts` and `proof/checker.ts` elementary domain/link/resolution inference needed by authentic state-edit tests; T05 retains the remaining proof algebra. Create the minimal type-only `src/solver/techniques/types.ts` for LedgerEntry/Ledger; T07 extends this existing owner with descriptor contracts. Watch/ChangeSet remain in state/events.

**Interfaces:** `initialize`, `commitChecked`, `invalidate`, CandidateState/ChangeSet/ReadView per contracts §3. `rebuildIndexes(view: ReadView): ReadView` is the cold correctness baseline. Expose no mutable arrays; filled domains are singleton masks.

- [x] Assert sound initialization, atomic placement and cold/incremental equality:

```ts
const before = initialize(assembly, "primary");
const next = commitChecked(before, checkedSingle);
expect(before.state.values[cell]).toBe(0);
expect(next.view.state.domains[cell]).toBe(1 << (digit - 1));
expect(next.view.state.key.revision).toBe(before.state.key.revision + 1);
expect(next.view.state).toEqual(rebuildIndexes(next.view).state);
expect(next.changes.cells).toContain(cell);
```

- [x] Run `npm test -- tests/unit/solver/candidates.test.ts tests/unit/solver/events.test.ts`.
- [x] Initialize clue/rule roots and full unresolved domains only; preamble peer exclusions use subsequent checked rule-propagation proposals. Commit via cloned local buffers, reconstruct exact effects/peer removals, reject no-op/stale/wrong-branch/given overwrite; publish only after complete validation. Build cell→constraint/cover/relation incidence; conservatively invalidate graph and transitive dependent caches. Check duplicates/empty domain/missing cover without turning human diagnostic into exact count evidence.
- [x] Rerun tests/typecheck; compare cold rebuild after seeded monotone edits and ensure unrelated scopes retain only dependency-valid exhaustion.
- [x] Commit listed files: `feat: add shared candidate state and sound event invalidation`.

## T05 — Proof DAGs, assumptions, finite tables and replay

**Files:** create `src/solver/proof/assumptions.ts`, `tables.ts`, `counts.ts`, `replay.ts`; extend `checker.ts`, `primitives.ts`; tests `tests/unit/solver/proof-graph.test.ts`, `composition.test.ts`; create `tests/solver/acceptance.ts`.

**Interfaces:** `replay`, `checkProposal` plus resolution/conjunction/cases/discharge/Hall/cover-count/table primitive decoders from contracts §5. Test helper `assertSound(view, proposal)` drains the checker, checks pre-state satisfiability with oracle, force/forbids effects and requires exhaustive no-witness counterfactuals. Helper implementation must throw on oracle interruption. Fixture lookup/discovery helpers are added in T07 when the registry exists; T05 passes hand-authored proposal objects directly, avoiding a dependency on future detectors.

- [x] Add mutation and mixed-rule tests:

```ts
expect(checkToEnd(removeOneCase(proof), context).kind).toBe("rejected");
expect(checkToEnd(importSiblingAssumption(proof), context).kind).toBe("rejected");
expect(checkToEnd(truncateTable(proof), context).kind).toBe("rejected");
expect(mixedStep.effects).toContainEqual({ kind: "place", cell: 0, symbol: 4 });
expect(mixedStep.rules).toEqual(expect.arrayContaining(["sum:0", "order:0", "row:0"]));
```

- [x] Run `npm test -- tests/unit/solver/proof-graph.test.ts tests/unit/solver/composition.test.ts`.
- [x] Implement topological node verification, scope propagation and allowed discharge; complete table enumeration trees with rejection reasons, sound joins/projections, coefficient-based incidence counts. Rebuild supports from proved domains during checking. `assertSound` uses `oracle({...preState, force:[cell,symbol],limit:1})` for removals and `forbid` for placements; require `exhausted && witnesses.length===0`. Exhaustively enumerate mock sum/order domains and compare both rule orders; keep mock production registration impossible.
- [x] Rerun tests/typecheck; reject omitted provenance, wrong strong/weak premise, cycles, unsupported primitives, false tuple coverage and hidden uniqueness. Replay one-hole from original clues without detector enumeration.
- [x] Commit listed files: `feat: check proof graphs and cross-rule deductions independently`.

## T06 — Independent production exact counting and quality

**Files:** create `src/solver/exact.ts`, `evidence.ts`; extend `src/solver/state/candidates.ts` with private lightweight accepted-lineage validation under D069; tests `tests/unit/solver/exact.test.ts`, `evidence.test.ts`.

**Interfaces:** `exactSteps`, `isWitness`, `deriveQuality`, CountEvidence/ExactEvent per contracts §7. `mergeEvidence(previous, incoming, context)` validates witnesses, monotonicity and consistency; context binds snapshot, assembly, accepted primary path, active exact phase and full run identity. D069 requires a sixth QualityContext argument with run, assembly and authentic initial/accepted views; candidate lineage validates actual acceptance, including proof-only caches, without copying historical maps.

- [x] Write original-clue independence and interrupted-count assertions:

```ts
expect(countFrom(exactSteps(twoProblem, assembly)).kind).toBe("multiple");
expect(stopAfterFirstWitness(exactSteps(uniqueProblem, assembly))).toMatchObject({
  kind: "unknown", lowerBound: 1,
});
expect(deriveQuality(snapshot, "solved", conditionalSteps, unique, false, conditionalContext))
  .toBe("not-established");
```

- [x] Run `npm test -- tests/unit/solver/exact.test.ts tests/unit/solver/evidence.test.ts`.
- [x] Implement explicit MRV DFS stack, ascending symbols, recomputed classic legal masks and singles, complete-rule leaf checking, witness deduplication and explicit root exhaustion. Emit bounded work between node/propagation operations. No human domains input. Encode duplicate zero proof and root-exhaustion process evidence with run identity/statistics. Preserve valid witnesses when rejecting inconsistent exhaustion/trace evidence. Full valid input is not-applicable quality.
- [x] Rerun tests/typecheck; differential-test all seed count fixtures plus seeded clue removals and mock complete-rule assignments. Verify exact cap two is “at least two,” closing a generator is not exhaustion, and a different second witness invalidates an incompatible human path.
- [x] Commit listed files: `feat: count original-problem solutions with independent evidence`.

## T07 — Coverage manifest and foundation techniques C01–C05

**Files:** create `src/solver/techniques/types.ts`, `registry.ts`, `manifest.ts`, `singles.ts`, `intersections.ts`, `subsets.ts`; create `tests/solver/fixtures/C01.json` through `C05.json`, `tests/unit/solver/foundation.test.ts`, `coverage.test.ts`, `docs/solver/techniques/foundation.md`; update fixture provenance README.

**Interfaces:** TechniqueDescriptor/Discovery/Ledger, `getTechniques(profile: VersionId): readonly TechniqueDescriptor[]`, `coverageEntries`. Register all 38 matrix rows as specified, promote only passing implemented rows. Foundation `discover` yields work/proposal/exhausted and checks exact matrix grammar. Add `fixtureCase(id)`, `discoverFixture(id)` and `checkFixtureMutation(id, mutation)` to `tests/solver/acceptance.ts` now; this file is part of the task allowlist. Fixture discovery returns `{view, proposals, proposal, status}`: `proposal` is the sole expected productive proposal or throws if a productive fixture has none; negative fixtures inspect `proposals`/`status` without reading that accessor. Status is `productive | reject | out-of-profile | interrupted`. Mutation helpers clone the independently authored certificate, apply the named change, then drain checkProposal; they do not rerun discovery.

- [x] Write named discovery and coverage tests:

```ts
for (const id of ["C01-one-hole", "C02-row", "C03-claim-column", "C04-naked-4", "C05-triple"]) {
  const { view, proposal } = discoverFixture(id);
  assertSound(view, proposal);
  expect(proposal.effects).toEqual(fixtureCase(id).expectedEffects);
}
expect(coverageEntries.map(e => e.id)).toHaveLength(38);
expect(validateCoverage(fakeVerifiedWithoutOracle)).toContain("missing-independent-evidence");
```

- [x] Run `npm test -- tests/unit/solver/foundation.test.ts tests/unit/solver/coverage.test.ts`.
- [x] First register mandatory `rule-propagation@1` jobs from RuleModule.propagate (semantic maintenance outside the 38 named rows), with checked preamble effects and the same acceptance barrier. Then implement canonical cell/cover/symbol/subset iteration, bounded yields, Hall/support proofs, intersections with explicit targets and complementary alias detection. Locked subsets combine separately valid roots. No automatic single placement after an elimination. `validateCoverage` is implemented in manifest and rejects unknown aliases/missing evidence; copy all exact bounds and tiers from matrix, not a six-entry union.
- [x] Run all per-row named/boundary/negative fixtures from matrix and force/forbid assertions, typecheck and replay an independently labeled original-clue prefix per alias. Reject no-effect/three-cells-two-values cases as useful deductions.
- [x] Commit listed files: `feat: add broad coverage ledger and elementary subset kernel`.

## T08 — Shared implication, group and ALS indexes

**Files:** create `src/solver/indexes/implications.ts`, `groups.ts`, `als.ts`; tests `tests/unit/solver/implications.test.ts`, `als-index.test.ts`.

**Interfaces:** `buildImplications(view, workspace): Generator<IndexEvent<ImplicationIndex>>`, `buildGroups(view, workspace): Generator<IndexEvent<GroupIndex>>`, `buildAls(view, workspace): Generator<IndexEvent<AlsIndex>>`. D072 requires one shared `IndexWorkspace` and adds an explicit interrupted event to work/ready; incomplete builds release their lease and cannot emit ready. Completed indexes own their lease until disposal. Query work is charged separately. Index entries contain StateKey, premise FactIds, explicit literals/member lists and dependency watches; no bare unproved edge.

- [x] Write strong-versus-weak and stale-index tests:

```ts
expect(graph.strong(a, b)).toBe(false); // same-symbol peers with a third house support
expect(graph.weak(a, b)).toBe(true);
expect(als.rcc(setA, setB, digit)).toBe(false); // one cross-pair cannot see each other
expect(indexFromSiblingBranch.accepts(view.state.key)).toBe(false);
```

- [x] Run `npm test -- tests/unit/solver/implications.test.ts tests/unit/solver/als-index.test.ts`.
- [x] Enumerate exact cell/house covers, weak conflicts, <=3-member groups and <=5-cell n+1 ALS sets in canonical order. Store all occurrence/provenance lists; build RCC from complete cross-conflicts and reject invalid overlaps. Charge every extension and invalidate globally before incremental optimization. Index adapters such as `strong/weak/rcc/accepts` query immutable entries, never infer proof by name.
- [x] Rerun tests/typecheck; compare all entries to cold reconstruction after seeded changes and a mock non-house relation; enforce workspace-entry cap with explicit interruption.
- [x] Commit listed files: `feat: index proved implications groups and almost locked sets`.

## T09 — Short patterns and wings C10–C13

**Files:** create `src/solver/techniques/short-patterns.ts`, `wings.ts`, `bent-subsets.ts`, `remote-pairs.ts`; fixtures `C10.json`–`C13.json`; tests `tests/unit/solver/short-patterns.test.ts`, `wings.test.ts`; `docs/solver/techniques/wings-and-short-patterns.md`; update registry/manifest/provenance.

**Interfaces:** each module exports readonly `TechniqueDescriptor[]`; named validators consume `proposal.pattern` and emit primitive proof requirements. D073 adds required `discover(view, context)` with `DiscoveryContext {workspace: IndexWorkspace; limits: Limits}` and an explicit interrupted discovery event. Update technique types, registry and affected acceptance/test helpers; no per-detector budget defaults. C12 consumes local table checker; other forms consume graph/cover indexes.

- [x] Test named geometry and counterexamples:

```ts
for (const id of ["C10-empty-rectangle", "C11-xy", "C11-xyz", "C11-w", "C12-n6", "C13-chute"]) {
  const f = discoverFixture(id); assertSound(f.view, f.proposal);
}
expect(discoverFixture("C11-xyz-missing-visibility").proposals).toEqual([]);
expect(discoverFixture("C12-n7").status).toBe("out-of-profile");
```

- [x] Run `npm test -- tests/unit/solver/short-patterns.test.ts tests/unit/solver/wings.test.ts`.
- [x] Implement four-vertex single-digit named shapes (three internal strong/weak/strong links; D070), ER exhaustive arm groups, bivalue/trivalue wing joins, identical-pair bridge, remote-pair parity and bounded bent-set table certificates. Local assignment enumeration is restricted to declared cells/conflicts, with all surviving assignments checked for z coverage. Yield between tuple/path extensions.
- [x] Run every alias/orientation/negative and 4/5/6-cell fixture in matrix, force/forbid, replay original-clue examples and typecheck. AIC equivalence alone does not pass named coverage.
- [x] Commit listed files: `feat: explain short patterns wings and bent subsets`.

## T10 — Basic and generalized fish C06–C09

**Files:** create `src/solver/techniques/fish.ts`, `fish-certificate.ts`; fixtures `C06.json`–`C09.json`; tests `tests/unit/solver/fish.test.ts`, `fish-complex.test.ts`; `docs/solver/techniques/fish.md`; update registry/manifest/provenance.

**Interfaces:** `fishTechniques: readonly TechniqueDescriptor[]`; actual T10 `checkFishPattern(proposal, view, available): void` is the closed structural named gate, invoked after primitive validity, reachability, scope and effect checks. It does not call `discover` or issue another proof authority. D076 refines the count-only domain decoder; D079 defines geometry labels; D080 adds watched discovery exclusions. C24 later reuses the same base/cover certificate with proved fin-false premises. See the [fish contract and reasoning](../../solver/techniques/fish.md).

- [x] Write size/overlap counterfactuals:

```ts
for (let n = 2; n <= 7; n++) {
  const f = discoverFixture(`C06-size-${n}`); assertSound(f.view, f.proposal);
}
expect(checkFixtureMutation("C08-mutant-4", "omit-overlap-coefficient").kind).toBe("rejected");
expect(checkFixtureMutation("C09-siamese", "delete-second-root").kind).toBe("rejected");
```

- [x] Run `npm test -- tests/unit/solver/fish.test.ts tests/unit/solver/fish-complex.test.ts`.
- [x] Enumerate same-digit base/cover combinations canonically; basic n2…7, mixed n2…4, <=4 fin occurrences. Compile complete base covers and at-most-one conflicts into a bounded incidence/resolution certificate under target=true. Treat endo-fin multiplicity explicitly; cannibalistic targets may be in bases. Siamese requires two independent certificates, retaining both roots. No full-grid DFS. Classify finned/sashimi and geometry aliases using exact matrix predicates.
- [x] Run all size/orientation/fin/mixed/endo/cannibal/Siamese classes, force/forbid, original-clue replay, typecheck; assert impossible proof/work completion reports interruption rather than absence.
- [x] Commit listed files: `feat: add bounded basic finned and complex fish proofs`.

## T11 — Coloring, chains and loops C14–C17

**Files:** create `src/solver/techniques/coloring.ts`, `coloring-grammar.ts`, `chains.ts`, `chains-runtime.ts`, `chains-certificate.ts`, `chains-grammar.ts`, `loops.ts`; independent helper `tests/solver/chains-acceptance.ts`; fixtures `C14.json`–`C17.json`; tests `tests/unit/solver/coloring.test.ts`, `chains.test.ts`; `docs/solver/techniques/chains-and-coloring.md`; update grammar/registry/manifest/provenance and the coverage status sentinel.

**Interfaces:** `coloringTechniques`, `chainTechniques` and `loopTechniques` descriptors; `Coloring`/`ChainSearch` discovery; untrusted `ChainCertificate`/`compileChain`; independent `checkColoringPattern`/`checkChainPattern`. `ChainEvent` preserves all members, `StrongSource` binds exact cell/house/proved-cover/ALS recipes, and ordered `ChainLink` records carry premise roots. Every effect root must cover its complete named proof. See [actual contracts and evidence](../../solver/techniques/chains-and-coloring.md).

- [x] Write grammar and assumption tests:

```ts
for (const id of ["C14-multi", "C15-cell-wrap", "C16-aic", "C17-continuous", "C17-group"]) {
  const f = discoverFixture(id); assertSound(f.view, f.proposal);
}
expect(checkFixtureMutation("C17-group", "omit-group-member").kind).toBe("rejected");
expect(discoverFixture("C16-length25").status).toBe("out-of-profile");
```

- [x] Run `npm test -- tests/unit/solver/coloring.test.ts tests/unit/solver/chains.test.ts`.
- [x] Implement conjugate-component color alternatives and complete trap/wrap cases; Medusa includes cell and house XOR edges. Traverse simple paths by increasing length, lexical endpoints/edges, <=24 links and <=4 group/ALS nodes. Validate alternation, loop closure and effect polarity with resolution/discharge; no implication edge is trusted because it was colored. Multi-color uses exactly two components/four branches, represented by two discharged lexical assumptions (D082). Count ordinary group vertices plus semantic ALS visits under D078; each visit keeps its full occurrences and separate complete local table. D077 distinguishes 4/24 open vertices (3/23 links) from a continuous loop with 24 links including closure.
- [x] Rerun all named classes/bounds/negative fixtures, force/forbid and original-clue replay; prove no assumption escapes an accepted step; typecheck.
- [x] Commit listed files: `feat: add checked coloring chains and grouped loops`.

## T12 — ALS relationships and Death Blossom C18–C19

**Files:** create `src/solver/techniques/als-patterns.ts`, `death-blossom.ts`; fixtures `C18.json`, `C19.json`; test `tests/unit/solver/als-patterns.test.ts`; `docs/solver/techniques/als.md`; update registry/manifest/provenance.

**Interfaces:** descriptors consuming AlsIndex/ImplicationIndex with complete ALS occurrence groups and the table/count checker; certificates contain every set, cell overlap, RCC occurrence and target visibility premise. Generic GroupIndex syntax must not truncate five-cell ALS occurrences (D078).

- [x] Assert full RCC and branch coverage:

```ts
for (const id of ["C18-xz-double-rcc", "C18-overlap", "C18-xy", "C19-chain-6", "C19-blossom-4"]) {
  const f = discoverFixture(id); assertSound(f.view, f.proposal);
}
expect(checkFixtureMutation("C19-blossom-4", "remove-petal").kind).toBe("rejected");
```

- [x] Run `npm test -- tests/unit/solver/als-patterns.test.ts`.
- [x] Join two/three ALSs for XZ/XY, enumerate <=6-set chains, exclude invalid overlaps from RCC and validate overlap effects through complete local relations. Death Blossom splits over every stem candidate with its proved petal consequence; join only common effects. Use <=5 cells per ALS and <=4 stem candidates; charge cache lookups/construction and each extension.
- [x] Run disjoint/overlapping, single/double RCC, chain endpoints and all stem size fixtures with independent checks; stale cache mutation must fail; typecheck.
- [x] Commit listed files: `feat: explain ALS relationships chains and death blossom`.

## T13 — Set/count and aligned exclusion C20–C21

**Files:** create `src/solver/techniques/sue-de-coq.ts`, `aligned-exclusion.ts`, `subset-counting.ts`; fixtures `C20.json`, `C21.json`; test `tests/unit/solver/set-arguments.test.ts`; `docs/solver/techniques/set-arguments.md`; update registry/manifest/provenance.

**Interfaces:** descriptors using complete table-filter/Hall/count primitives. Certificates specify local cells, complete domains, auxiliary ALS premises and every rejected combination or coefficient inequality.

- [ ] Test enumeration completeness and scope limits:

```ts
for (const id of ["C20-intersection-3", "C21-aligned-2", "C21-aligned-3", "C21-aligned-4", "C21-count"]) {
  const f = discoverFixture(id); assertSound(f.view, f.proposal);
}
expect(checkFixtureMutation("C21-aligned-4", "drop-surviving-tuple").kind).toBe("rejected");
```

- [ ] Run `npm test -- tests/unit/solver/set-arguments.test.ts`.
- [ ] Implement Sue de Coq box-line intersection and disjoint side ALS allocation within matrix bounds; aligned exclusion enumerates only 2…4 selected cells, rejects direct conflicts or explicitly empty auxiliary matchings, then projects. Subset counting reconstructs <=4-scope/12-cell incidence inequalities. Enumeration must cover every tuple; no whole-board solve Boolean accepted.
- [ ] Run min/max intersection/side/selected-cell forms, overlap/double-count negatives, force/forbid, original-clue replay and typecheck.
- [ ] Commit listed files: `feat: add finite set-count and aligned exclusion proofs`.

## T14 — Forcing, nets, nested proofs and Kraken C22–C24

**Files:** create `src/solver/techniques/forcing.ts`, `nets.ts`, `kraken.ts`; fixtures `C22.json`–`C24.json`; tests `tests/unit/solver/forcing.test.ts`, `nets.test.ts`; `docs/solver/techniques/forcing.md`; update registry/manifest/provenance.

**Interfaces:** fresh branch ReadViews; bounded discovery uses graph resolution and C01–C05 descriptors only inside nets. `forkView(view, branchId)` in state/facts shares immutable accepted roots and copies mutable domains/index ownership; add its tests to candidate suite. No call to exactSteps or recursive human/run.

- [ ] Test branch isolation and named limitations:

```ts
const f = discoverFixture("C23-nested-depth2"); assertSound(f.view, f.proposal);
expect(checkFixtureMutation("C22-unit", "omit-last-support-case").kind).toBe("rejected");
expect(checkFixtureMutation("C24-kraken-basic", "omit-fin-branch").kind).toBe("rejected");
expect(discoverFixture("C23-nested-depth3").status).toBe("out-of-profile");
```

- [ ] Run `npm test -- tests/unit/solver/forcing.test.ts tests/unit/solver/nets.test.ts tests/unit/solver/candidates.test.ts`.
- [ ] Enumerate candidate/cell/house exhaustive alternatives in canonical order; <=24-link chains and <=128-node nets/branch, nesting <=2. Static graph frozen at branch start; dynamic links rebuilt from proved branch changes. Nishio accepts only single-digit cover/weak consequences. Kraken proves every fin false under a target assumption then applies T10's checked fish certificate. Discharge all temporary roots before proposing effects.
- [ ] Run every forcing kind, static/dynamic/nested and Kraken basic/mixed fixtures, negative sibling/stale/domain/scope mutations, independent checks and typecheck. Assert branch work exhaustion never becomes a failed-candidate deduction.
- [ ] Commit listed files: `feat: add bounded forcing nets and kraken deductions`.

## T15 — Generalized chain grammars C25–C28

**Files:** create `src/solver/techniques/csp-variables.ts`, `generalized-chains.ts`, `or-forcing.ts`; fixtures `C25.json`–`C28.json`; test `tests/unit/solver/generalized-chains.test.ts`; `docs/solver/techniques/generalized-chains.md`; update registry/manifest/provenance.

**Interfaces:** `buildCspVariables(view)` yields complete cell/house-symbol alternatives with FactIds; generalized pair certificate contains variable ID, left/right literals or group, every excluded alternative and conflict reference. OR forcing consumes proved clauses, not arbitrary lists.

- [ ] Test each distinct grammar and name rejection:

```ts
for (const id of ["C25-bivalue", "C25-z", "C26-t", "C26-whip", "C27-braid", "C27-gwhip", "C28-or4"]) {
  const f = discoverFixture(id); assertSound(f.view, f.proposal);
}
expect(checkFixtureMutation("C27-braid", "label-as-continuous-whip").kind).toBe("rejected");
expect(checkFixtureMutation("C26-whip", "forward-right-dependency").kind).toBe("rejected");
```

- [ ] Run `npm test -- tests/unit/solver/generalized-chains.test.ts`.
- [ ] Implement pair-by-pair bounded enumeration <=12 pairs, checking all excluded alternatives under z-only/t-only/combined policies. Braids can cite any earlier right; whips require predecessor continuity. Groups require all-member conflicts; max four groups/three members. OR2…4 closes the same effect in every proved clause alternative. Final no-right variable needs complete domain/support contradiction. Keep source revision and exact mapping in theorem documentation.
- [ ] Run each grammar at min/max bounds, just-over-limit and valid-general/invalid-narrow aliases, force/forbid and original-clue fixtures; typecheck. An AIC solved example cannot substitute for z/t/braid discovery evidence.
- [ ] Commit listed files: `feat: add distinct bounded whip braid and OR proof grammars`.

## T16 — Specialized patterns C29–C32

**Files:** create `src/solver/techniques/fireworks.ts`, `sk-loops.ts`, `exocet.ts`, `tridagon.ts`; fixtures `C29.json`–`C32.json`; tests `tests/unit/solver/fireworks.test.ts`, `sk-loops.test.ts`, `exocet.test.ts`, `tridagon.test.ts`; docs `docs/solver/techniques/fireworks.md`, `sk-loops.md`, `exocet.md`, `tridagon.md`; update registry/manifest/provenance.

**Interfaces:** four descriptor arrays; named pattern records contain full geometry and finite cover/table certificate. No generic `special-pattern-is-valid` trusted primitive. C32 guardian clauses feed T15 OR discovery through proved relation facts.

- [ ] Write one positive and a decisive counterexample for each family:

```ts
for (const id of ["C29-quad", "C30-mixed-1-3", "C31-junior-4", "C31-double", "C32-degenerate"]) {
  const f = discoverFixture(id); assertSound(f.view, f.proposal);
}
expect(checkFixtureMutation("C31-junior-4", "omit-assigned-s-occurrence").kind).toBe("rejected");
expect(checkFixtureMutation("C32-parity", "retain-valid-core-permutation").kind).toBe("rejected");
```

- [ ] Run `npm test -- tests/unit/solver/fireworks.test.ts tests/unit/solver/sk-loops.test.ts tests/unit/solver/exocet.test.ts tests/unit/solver/tridagon.test.ts`.
- [ ] Implement in four reviewable substeps: (a) triple/quad fireworks from complete intersecting-house cover relations; (b) eight-group SK ring with bounded local tuple joins and verified closure; (c) Junior Exocet complete companions/S-cell covers including givens, base/target count proof, then Double joins of two independently checked relations; (d) four-box Tridagon core permutation rejection, deriving all guardian alternatives. Each family uses its exact matrix shape; reject unsupported mirror/escape, non-Junior, non-ring and other geometry aliases explicitly.
- [ ] Run every advertised specialized form, each local independent table checker, force/forbid and original-clue examples, proof/byte interruption tests and typecheck. Source screenshots alone are not fixture labels; record license and original givens. Commit each family separately if it passes before its neighbors; T16 gate remains incomplete until all four pass.
- [ ] Commit only the passing family's listed files: `feat: add checked fireworks patterns`, `feat: add checked SK loop relations`, `feat: add bounded Junior and Double Exocet proofs`, `feat: add Tridagon guardian proofs`.

## T17 — Templates and pattern overlay C33

**Files:** create `src/solver/indexes/templates.ts`, `src/solver/techniques/templates.ts`; fixture `C33.json`; test `tests/unit/solver/templates.test.ts`; `docs/solver/techniques/templates.md`; update registry/manifest/provenance.

**Interfaces:** `buildTemplates(view, symbol)` yields bounded work and a complete template relation or interruption; template-cover checker reconstructs enumeration independently. Descriptor includes single/pair/triple overlay and incompatibility bounds; all tuple tests count toward work.

- [ ] Test exhaustive set and interruption:

```ts
expect(independentEmptyGridTemplates().length).toBe(46656);
const f = discoverFixture("C33-pair"); assertSound(f.view, f.proposal);
expect(checkFixtureMutation("C33-single", "omit-legal-template").kind).toBe("rejected");
expect(stopTemplateEnumerationBeforeEnd().canEliminate).toBe(false);
```

- [ ] Run `npm test -- tests/unit/solver/templates.test.ts`.
- [ ] Enumerate one cell/row with column/box occupancy, respecting current clue/domain premises, encode complete branch alternatives/rejections as shared DAG nodes. Project one-digit relations; remove templates lacking any pairwise compatible partner; enumerate two/three-symbol compatible tuples within 100,000 tuple tests/revision. Never infer absence from an unfinished list. Apply proof/node/byte caps before publishing; an overlarge proof is explicit incomplete work.
- [ ] Rerun single/pair/triple/incompatibility, independent template set comparison, local and original-clue soundness, overflow and typecheck. Do not promise full nine-symbol POM.
- [ ] Commit listed files: `feat: add bounded template and overlay certificates`.

## T18 — Uniqueness-dependent families U01–U05

**Files:** create `src/solver/proof/unique.ts`, `src/solver/techniques/unique-rectangles.ts`, `unique-loops.ts`, `bug.ts`; fixtures `U01.json`–`U05.json`; tests `tests/unit/solver/unique-techniques.test.ts`, `unique-provenance.test.ts`; `docs/solver/techniques/uniqueness.md`; update registry/manifest/provenance.

**Interfaces:** `unique-transform@1` checks a rule-preserving nonidentity trade under matching independent CountEvidence; descriptors have policy `unique-only`. Conditional flag is inherited through all primitive consequences. `classic-conditional@1` includes the primary profile plus U rows.

- [ ] Assert gating, swap preservation and permanent taint:

```ts
expect(checkConditionalFixture("U01-type1", unknownEvidence).kind).toBe("rejected");
expect(checkConditionalFixture("U02-avoidable-given", uniqueEvidence).kind).toBe("rejected");
expect(checkConditionalFixture("U03-extra-order-rule", uniqueEvidence).kind).toBe("rejected");
expect(afterDischarge.conditional).toBe(true);
expect(deriveQuality(snapshot, "solved", conditionalSteps, uniqueEvidence, false))
  .toBe("not-established");
```

- [ ] Run `npm test -- tests/unit/solver/unique-techniques.test.ts tests/unit/solver/unique-provenance.test.ts`.
- [ ] Implement UR1…6 and hidden/avoidable/extended finite geometry, even unique loops <=12 cells, BUG core plus <=4 extras. Reconstruct affected house/clue preservation and nontrivial alternate assignment mapping; root uniqueness is never discharged. BUG core requires an actual alternate-cycle trade certificate; pure incompatible unique/core inputs become diagnostics. Apply only the conditional profile; no exact solution digits become a premise.
- [ ] Run independent original-clue uniqueness first, every U alias/bound and nonunique trade counterexample, mixed-rule swap rejection, chain-inherited taint, replay and typecheck.
- [ ] Commit listed files: `feat: add isolated uniqueness-dependent deduction families`.

## T19 — Fair scheduling and Explain/Analyze selection

**Files:** create `src/solver/scheduling/work.ts`, `ledger.ts`, `features.ts`, `policy.ts`, `rollout.ts`; tests `tests/unit/solver/scheduling.test.ts`, `rollout.test.ts`.

**Interfaces:** `Budget` exposes `spend(units): boolean`, `remaining(): number`; `SchedulerPolicy` exposes `next(ledger, view): JobKey`, `choose(checked): CheckedStep`. JobKey is `{technique: VersionId, scopeKey: string}`. `WorkClock` is `{now():number}`. `selectStep(view, registry, options)` yields work/checked-step/logical-stop events. Options contain mode, versioned profile, work/phase caps and rollout flag; all included in RunKey.optionsKey.

- [ ] Test fairness/ordering without wall time:

```ts
expect(serviceTickets(100, 10).everyJobServedWithin(40)).toBe(true);
expect(runWithSlices(1).acceptedProofKeys).toEqual(runWithSlices(256).acceptedProofKeys);
expect(interruptedCheaperTier.canClaimSimplerExhausted).toBe(false);
expect(rolloutResult.primaryRevision).toBe(beforeRevision);
expect(rolloutResult.usedWork).toBeLessThanOrEqual(rolloutAllowance);
```

- [ ] Run `npm test -- tests/unit/solver/scheduling.test.ts tests/unit/solver/rollout.test.ts`.
- [ ] Implement fixed scan and event-fixed baselines first; drain checked rule propagation before each selection window. Use one live resumable cursor per descriptor/rule instance, never one materialized job per combinatorial scope. Add 256-unit deterministic quanta, every fourth quantum oldest-job service, canonical ties and dependency-ledger invalidation. Explain searches the lowest tier and finishes its current quantum before choosing. Analyze uses <=4 checked candidates/4,096-unit selection window and frozen integer priority/utility formulas from contracts §6. Implement rollout off by default, <=4 candidates/16 cheap steps, min(8192,10% remaining work), equal allocations, all copying/checking charged and no speculative imports. Runtime time slices cannot change logical quanta.
- [ ] Rerun zero-score/starvation, missed-watch/cold-scan comparisons, useful-step/no-op, partial graph and unsound-filter mutations, fixed-version determinism and typecheck. Safe exclusions need necessary-premise reasons, not low priority.
- [ ] Commit listed files: `feat: schedule fair deterministic Explain and Analyze work`.

## T20 — Human loop, phases, fallback and conditional operation

**Files:** create `src/solver/human.ts`, `run.ts`; extend `evidence.ts`; tests `tests/unit/solver/human.test.ts`, `run.test.ts`.

**Interfaces:** `humanSteps(view, registry, options)` yields work/proposal/logical-stop; accepts commit acknowledgement before dependent work. `runSolver(request, ports): Promise<void>` receives `{clock: WorkClock, yieldTask():Promise<void>, publish(event):Promise<void>, awaitAcceptance(stepId):Promise<"accepted"|"human-stopped">}`. Event types are internal domain events mapped to protocol in T21; no DOM/Worker imports. Request binds snapshot, key, limits, conditional prefix and prior unique evidence.

- [ ] Assert evidence separation and phase reserve:

```ts
expect(runAtHumanCeiling().human).toBe("incomplete");
expect(runAtHumanCeiling().searchReason).toBe("logical-budget");
expect(completeLogicalThenCount().usedFallback).toBe(false);
expect(cancelAfterOneWitness().count).toMatchObject({kind:"unknown",lowerBound:1});
expect(conditionalRun.primaryResult).toEqual(originalPrimaryResult);
```

- [ ] Run `npm test -- tests/unit/solver/human.test.ts tests/unit/solver/run.test.ts`.
- [ ] Implement validate/assemble/initialize → human → exact with 70% human time/work ceiling and remainder exact; early logical stop lends unused budget. No exact start after deadline, no human resume after exact. Proof/resource interruption may retain logic prefix and start identified fallback with remaining independent budgets. Conditional replays original prefix under its own budget and uses no exact phase. Await acceptance or the explicit stop-human reconciliation after each productive proposal, derive stop ledger accurately and keep contradiction/inconsistency distinct. Cap metadata/search summaries.
- [ ] Rerun all count fixtures in both modes, stop before/after witness/root exhaustion, complete-input/no-Perfect, temporary discharge/Perfect and conditional exclusion, plus typecheck.
- [ ] Commit listed files: `feat: orchestrate bounded logical and independent exact phases`.

## T21 — Bounded codec, proof transport and acceptance barrier

**Files:** create `src/solver/transport/protocol.ts`, `codec.ts`, `sender.ts`, `receiver.ts`; tests `tests/unit/solver/protocol.test.ts`, `transport.test.ts`.

**Interfaces:** ToWorker/FromWorker/ProofHeader/Limits exactly contracts §8; `decodeMessage(value: unknown): FromWorker`, `createSender(send, key, limits)`, `createReceiver(context, accept, ack)`. Receiver owns staging, not persistent library. `accept` commits only branded checked steps and returns revision; protocol `accepted` is emitted afterward. Codec exposes incremental encode/decode iterators with bounded records.

- [ ] Write a proof spanning more than two chunks and interrupted acceptance:

```ts
await channel.sendProof(threeChunkProof);
expect(channel.maxUnacked).toBeLessThanOrEqual(2);
expect(channel.acksBeforeProofEnd).toBeGreaterThan(0);
expect(channel.acceptedRevisions).toEqual([1]);
expect(cancelAfterChunk(2).acceptedRevisions).toEqual([]);
expect(deliverSequenceGap().outcome).toBe("error");
```

- [ ] Run `npm test -- tests/unit/solver/protocol.test.ts tests/unit/solver/transport.test.ts`.
- [ ] Decode strict protocol/key/version/seq fields; budget before allocation; UTF-8 incremental tokens, <=16 KiB nodes, <=32 KiB controls and <=64 KiB chunks; topological staged nodes and imported roots; no repeated full traces. ACK after safe bounded staging, accept only after end/all counts/checking/deadline pass. Sender waits on credits and later step acceptance, coalesces statistics while blocked. Ignore old/wrong-key events; gap/malformed active/end-before-complete/oversize are protocol errors. Successful terminal requires no pending step. Implement stop-human/human-stopped phase reconciliation: the controller freezes its accepted revision at the human ceiling, ignores subsequent logical packets while still consuming sequence numbers, and worker reconciles that revision before leaving a pending proof for exact. Test both ACK-before-cutoff and cutoff-before-proof-end orderings.
- [ ] Rerun split UTF-8/codepoint tokens, partial JSON node, missing/duplicate chunks/nodes/imports, overdeclared counts, cumulative caps, wrong operation/parent, early terminal and cancel-in-check races; typecheck. Verify no whole-proof synchronous JSON parse.
- [ ] Commit listed files: `feat: stream bounded proofs with atomic acceptance and backpressure`.

## T22 — Real worker and watchdog adapter

**Files:** create `src/workers/solver.worker.ts`, `src/app/solver-worker.ts`, `web/tsconfig.worker.json`; modify `web/tsconfig.json`, `web/package.json`; create `tests/browser/solver-worker.html`, `solver-worker.ts`, `tests/e2e/solver-worker.spec.ts`.

**Interfaces:** `WorkerPort` wraps postMessage/terminate/error/message handlers; `startWorker(request, callbacks): WorkerHandle` returns `{terminate():void}`. Use static Vite worker URL. Separate WebWorker TS lib with no DOM view imports; main config excludes worker entry and fixture worker-only files if needed; typecheck script runs both configs. Shared engine modules must compile under both environments.

- [ ] Add browser assertions for real worker chunks/cancel/startup failure:

```ts
await page.goto("/tests/browser/solver-worker.html");
await page.getByRole("button", { name: "Start long proof" }).click();
await page.getByRole("button", { name: "Cancel" }).click();
await expect(page.getByRole("status")).toHaveText("Cancelled");
await expect(page.getByTestId("accepted-step-count")).toHaveText("0");
```

- [ ] Run `npm run test:e2e -- tests/e2e/solver-worker.spec.ts`; observe missing-worker failure before implementation.
- [ ] Bind clock/yield/publish/accept ports to runSolver; use task yields (not microtask-only loops), <=8 ms worker slice and <=4 ms main check targets, local deadline from remainingMs and controller-owned total deadline. Startup/runtime/messageerror typed failures terminate and preserve prior state. No ACK-dependent Cancel, shared memory or main-thread solver fallback. Harness is test-only and has deterministic proof sizes/phase triggers.
- [ ] Run browser suite, `npm run typecheck`, `npm run build`; inspect production output includes worker asset. Test terminate during graph build, exact enumeration, blocked ACK and main verification; all late callbacks ignored.
- [ ] Commit listed files: `feat: run solver in bounded cancellable browser workers`.

## T23 — Volatile controller, source copying and Save Clues

**Files:** create `src/app/solver-controller.ts`; modify `src/app/controller.ts` services type only, `application.ts` service lifecycle, `router.ts`; create `tests/unit/solver/controller.test.ts`; modify `tests/unit/router.test.ts`.

**Interfaces:** `createSolverController(deps): SolverController`; deps clock/newId/worker factory only. Controller methods `snapshot()`, `subscribe(listener)`, `replaceInput(definition,source)`, `edit(action)`, `setOptions(options)`, `start()`, `startConditional()`, `cancel(reason)`, `dispose()`. Input reducer reuses creation context, normalizes notes empty. Save Clues is an application action using existing library controller, not a solver engine dependency.

- [ ] Test identity races and state isolation:

```ts
const before = structuredClone(libraryController.snapshot());
solver.start(); solver.cancel("user"); fakeWorker.deliver(validLateResult);
expect(solver.snapshot().outcome).toBe("cancelled");
expect(libraryController.snapshot()).toEqual(before);
expect(routeHash({screen:"solve"})).toBe("#/solve");
expect(parseRoute("#/solve")).toEqual({screen:"solve"});
```

- [ ] Run `npm test -- tests/unit/solver/controller.test.ts tests/unit/router.test.ts`.
- [ ] Implement one application-lifetime workspace; deep-copy draft values/definition clues with source attribution outside engine; use own-property checks. On Cancel/watchdog/disposal invalidate key first, discard staging/check callbacks, preserve accepted state, then clear listeners/timers and terminate. Receipt and precommit check exact total deadline. Primary phase timer also freezes logical acceptance at 70%, discards incomplete proof staging and sends stop-human without terminalizing the exact phase; reconcile acceptedRevision through the ordered port. Primary rerun/input changes discard both result graphs; conditional rerun replaces only conditional. Source rename/delete/restore/unrelated revisions never retarget snapshot. Implement Save Clues through `createDraft`, then copy input with existing `reduceEditor` digit actions, preserving atomic library controller semantics.
- [ ] Rerun startup/timeout/result-Cancel ties, same-input rerun, wrong operation/version/parent, route disposal, reload instantiation, malformed paste, source deletion and save failure tests; typecheck. Assert byte-equivalent sessions/notes/history/settings/revision for all non-Save-Clues actions after prior saves settle.
- [ ] Commit listed files: `feat: isolate solver workspace and request lifecycle from play state`.

## T24 — English screen, proof graph and coverage UI

**Files:** create `src/ui/solver.ts`, `solver-board.ts`, `solver-trace.ts`, `solver-coverage.ts`, `solver-copy.ts`; modify `src/ui/home.ts`, `library.ts`, `player.ts`, `src/app/application.ts`, `src/styles.css`; create `tests/e2e/solver-screen.spec.ts`.

**Interfaces:** `mountSolver(container, services): () => void`; read-only board `mountSolverBoard(container, state): {update(state):void,destroy():void}` where state has values/givens/highlight roles/selection, no onAction digit API. Trace/coverage render accepted immutable records only. `solver-copy.ts` maps typed statuses/primitive/family parameters to English text, no arbitrary HTML.

- [ ] Add end-to-end default/mode/explanation assertions:

```ts
await page.getByRole("button", {name:"Solve",exact:true}).click();
await expect(page.getByRole("radio", {name:"Explain",exact:true})).toBeChecked();
await expect(page.getByText("Temporary input and analysis.", {exact:false})).toBeVisible();
await page.getByRole("button", {name:"Start",exact:true}).click();
await expect(page.getByText("Solution verification", {exact:true})).toBeVisible();
expect(await page.getByTestId("solver-result").getByRole("button", {name:"Number 1"}).count()).toBe(0);
```

- [ ] Run `npm run test:e2e -- tests/e2e/solver-screen.spec.ts` before implementation.
- [ ] Implement §2–4 screen actions/copy, separate input/result/witness selection and conditional panel, advanced limits and ledger reasons. Use current sidebar/editor layout and detached input controls; mode controls locked while active. Render proof children lazily with bounded pages and accessible shared-node navigation, retaining full data. Visible Cancel/status do not move below expanded trace. Library/player say “No analysis is saved for this puzzle. Use Solve for a temporary analysis.” No gameplay hint/check/reveal controls.
- [ ] Rerun screen tests, keyboard/focus/live-region/unsafe-string checks and `npm run typecheck`; inspect 1280×800 and 1920×1080 in representative themes, then all ten color combinations for text/role distinction. Confirm shared UI changes retain M1 squircle/grid/note/input behavior.
- [ ] Commit listed files: `feat: present English solver modes proofs and separate evidence`.

## T25 — Integrated correctness and production-browser acceptance

**Files:** create `tests/unit/solver/differential.test.ts`, `coverage-release.test.ts`, `tests/e2e/solver-isolation.spec.ts`, `solver-races.spec.ts`, `web/playwright.production.config.ts`; extend solver worker/screen suites; add `test:e2e:production` script in `web/package.json`.

**Interfaces:** production Playwright config uses port 5175 with `vite preview --host 127.0.0.1 --port 5175 --strictPort`; build first; production suites visit app routes only, since test HTML harnesses are not emitted by the normal build. Test-only fixture harness remains development coverage. No production debug globals or special proof injection UI.

- [ ] Write release-gate assertions:

```ts
expect(unverifiedRequiredCoverageRows()).toEqual([]);
expect(differentialCases.every(c => c.actualCount === c.oracleCount)).toBe(true);
expect(replayAllAcceptedPaths().invalid).toEqual([]);
expect(perfectCases.some(c => c.conditional || c.usedFallback || !c.unique)).toBe(false);
```

- [ ] Run `npm test -- tests/unit/solver/differential.test.ts tests/unit/solver/coverage-release.test.ts` and full browser suites; a missing advertised fixture must fail the gate.
- [ ] Fill remaining matrix fixtures through independent authoring/labeling, not production golden updates. Add seeded digit/row/column/band/stack/transpose transformations, cold versus incremental scheduler/index comparisons and real source/session/backup byte comparisons. Exercise Cancel after one witness, partial proof, secondary operation and navigation; empty/full/duplicate/nonduplicate-zero/two/unique; startup/runtime/protocol failure injection at unit/harness boundaries. Production tests cover real run/cancel/navigation/reload plus correct bundled worker asset.
- [ ] Run `npm run typecheck`, `npm test`, `npm run build`, `npm run test:e2e`, `npm run test:e2e:production`. Verify every enabled alias's original-clue path, independent acceptance, no false Perfect and preserved D058 settings/backup behavior. Repeat only checks affected by new fixes.
- [ ] Commit listed test/config/fixture fixes with focused messages: `test: gate expanded solver coverage and production integration`.

## T26 — Benchmarks and resource calibration

**Files:** create `tests/solver/bench/corpus.json`, `tests/solver/bench/README.md`, `tests/e2e/solver-benchmark.spec.ts`, `web/playwright.benchmark.config.ts`, `docs/m2-solver-benchmarks.md`; add `bench:solver` script; modify frozen profile/policy constants only when measurements justify it. Store raw benchmark output in ignored test output, commit compact measured tables and corpus hashes.

**Interfaces:** benchmark config inherits production browser settings on port 5175; suite selected separately from routine e2e using `testIgnore`/`testMatch` in configs. Record versioned run options, deterministic counters and standard browser performance/memory instrumentation, never online tuning inside Explain.

- [ ] Establish training/held-out partition, family/oracle labels and a schema assertion:

```ts
expect(intersection(calibrationHashes, heldOutHashes)).toEqual([]);
expect(requiredPolicyIds.every(id => report.policies.includes(id))).toBe(true);
expect(report.samples.every(s => s.correctness === "passed"))
  .toBe(true);
```

- [ ] Run `npm run build` then `npm run bench:solver`; first execute a schema/dry-run case and ensure missing policies/labels fail before collecting performance data.
- [ ] Execute contracts §9 matrix: five cold/30 warm trials on foreground PC and 4× throttle; fixed-scan/event-fixed/scored Explain/Analyze/rollout ablations with identical caps, 50/70/unreserved phase shares and adversarial cases. Measure latency distributions, named logical coverage/fallback/count correctness, detector/cache/scheduler/checker/rollout work, proof/transport/peak heap, main tasks and 100 Start/Cancel cleanup cycles. Include all family classes; heavy stress fixtures may honestly time out at defaults but must pass generous deterministic correctness gates.
- [ ] Report all failures and defaults/ranges as measured or unvalidated. Retain 10 s/70%/score/proof proposals only if supported; revise frozen versions and docs for review when not. Recheck affected deterministic/correctness tests for changed profiles; no family removal to improve a speed score. Keep rollout default off unless held-out measurements justify enabling it and review records that choice.
- [ ] Commit benchmark docs, configs and justified constants: `perf: record solver policy and resource benchmarks`.

## T27 — Final acceptance, documentation and release review

**Files:** create `docs/m2-solver-verification.md`; update `docs/README.md`, `docs/roadmap.md`, `docs/decisions.md`, technique descriptions/manifest evidence links and root `README.md` startup/solver guidance. Update this plan's checkboxes only for completed tasks with actual evidence.

**Interfaces:** release verification record identifies implementation/spec/engine/profile/checker commits, commands, corpus hashes, all 38 row statuses, actual bounds, runtime limits, benchmark results and remaining platform limitations.

- [ ] Compare all design requirements to the coverage map below and fail release for any missing required row/test, unchecked applied proof, false count/Perfect, play-state mutation or missing benchmark result. No generic “all techniques” badge.
- [ ] Run final appropriate gates after last changes: typecheck/unit/build/development and production browser commands; `git diff --check`; verify documentation links and staged file allowlist. Preserve unrelated work and generated ignored files.
- [ ] Document actual results, independent fixture provenance and any deliberately incomplete stress outcomes. Clearly distinguish algorithm support from runtime completion. Update roadmap M2 only when all required implementation/acceptance work is complete; gameplay hints and variants stay later.
- [ ] Review implementation against the approved spec and focused commits; resolve actionable findings, rerun affected gates, then seek the authorized integration/release review. No push/deploy/merge implied by this plan.
- [ ] Commit documentation only: `docs: record verified expanded M2 solver and limitations`.

## Requirement-to-task acceptance map

| Requirement | Contract / matrix | Tasks / decisive gate |
| --- | --- | --- |
| Preserve current modules, English, appearance, no implementation during planning | Screen §§1–2; D046/D053/D058/D059 | Setup; T23–T25 isolation/themes; current documentation-only audit |
| Normalized rules, full identity, assembly, no unsupported semantics | Contracts §§1–2 | T02/T03; unknown rule/order/scope/house tests |
| Shared candidates/facts, invalidation, cross-rule provenance | Contracts §§3–5 | T04/T05/T08; cold rebuild and exhaustive mock composition |
| All expanded families, aliases, exact bounds, independent fixtures | Matrix C01–C33/U01–U05 | T07–T18; T25 manifest fails missing coverage |
| Explain/Analyze, deterministic order/fairness/safe filters/two scores/lookahead | Contracts §6 | T19; fixed-work determinism/4N service/rollout isolation; T26 ablations |
| Proof graph/assumptions/Perfect/conditional paths | Contracts §§5/7 | T03/T05/T14/T18/T20; mutation/scope/quality tests |
| Exact independent original-clue zero/one/two evidence, fallback | Contracts §7 | T01/T06/T20; oracle differential/one-witness interruption |
| Worker identity, bounded transport, atomic acceptance, backpressure/Cancel/deadlines | Contracts §8 | T21/T22/T23/T25; >2-chunk credit test and real browser races |
| Resource/persistence policy and measured defaults | Contracts §9; screen §§2–3 | T20/T23/T26; phase reserve, backup equivalence, full benchmark matrix |
| English read-only solved/partial board, expandable proofs and separate counts | Screen §4 | T24/T25; keyboard, actual fallback, two witnesses, ten themes |
| Design approval and reviewable complete plan | Screen §6; contracts §10 | Current planning verification; execution waits for explicit approval |

## Review handoff

The plan is complete for design review. No first-release interview answer is outstanding. Proposed choices are finite broad profiles, shared proof/fact contracts, separate uniqueness-dependent operation, event-driven fair scoring, a 70% human ceiling, bounded ACK/accept transport and memory-only results/preferences. Work/time/proof defaults and rollout benefit are empirical gates in T26. Unbounded generalizations are named exclusions in the matrix; every requested family has a planned bounded form and independent gate. **Do not execute this plan until the user approves the design.**
