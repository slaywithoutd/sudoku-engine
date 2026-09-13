# T02 report — normalized constraints, snapshots and capabilities

## Outcome

Implemented strict solver problem normalization, isolated snapshots, a versioned
all-different rule strategy, and deterministic capability assembly. Unsupported
rules and malformed modules/capabilities fail closed. All exposed problem,
snapshot and capability value data is copied and frozen; the module lookup uses
an encapsulated read-only map facade rather than exposing a mutable `Map`.

All-different scopes always provide pairwise-conflict capabilities. They provide
symbol covers only when the scope size equals the problem symbol-domain size,
because only then does all-different plus the shared domain establish existence.
A three-cell cage therefore provides no nine-symbol house covers.

## Public API ownership

- `web/src/solver/problem.ts`: `CellId`, `SymbolId`, `Mask`, `Json`,
  `VersionId`, `ConstraintId`, `BranchId`, `ProblemKey`, `ConstraintInstance`,
  `EngineProblem`, `ProblemInputError`, `canonicalJson`, `canonicalProblem`,
  and `normalizeClassic`.
- `web/src/solver/snapshot.ts`: `SourceRef`, `SolverSnapshot`, `RunKey`,
  `StateKey`, and `makeSnapshot`.
- `web/src/solver/rules/types.ts`: `FactId`, `NodeId`, rule/capability/assembly
  contracts, and the generator-shaped `Discovery` contract.
- `web/src/solver/rules/assemble.ts`: `RuleRegistry`, `CapabilityAssembler`,
  and the thin approved `assemble` entry point.
- `web/src/solver/rules/all-different.ts`: `AllDifferentRule`.

`ReadView`, `PrimitiveInput`, `CheckContext`, and `CheckedInference` are explicit
type-only later-task placeholders in `rules/types.ts`. T02 does not manufacture
checker success: every current rule declares no primitives and `checkPrimitive`
throws. No-op propagation is a generator that yields exactly
`{ kind: "exhausted" }`.

## T03 root handle handoff

Assembler premise handles reserve IDs in this order:

1. one domain root for every canonical cell, starting at zero;
2. one clue root for every nonzero given, iterated in canonical cell order;
3. one rule root for every constraint, iterated in canonical constraint-ID order.

T03 must materialize roots in this same order before treating capability premise
handles as checked facts. T02 deliberately does not expose these handles as
checked premises.

## Test evidence

TDD red evidence:

- Initial focused run: both suites failed because the requested solver modules
  did not exist.
- Strict-validation red run: two focused assertions failed because ignored array
  properties and sparse capability tuples/primitive arrays were still accepted.
- Missing-key red run: assembly accepted an engine-shaped object without its
  canonical key.

Green verification from `web/`:

- `npm test -- tests/unit/solver/problem.test.ts tests/unit/solver/assembly.test.ts`
  — 2 files, 32 tests passed.
- `npm test` — 10 files, 122 tests passed.
- `npm run typecheck` — passed with no diagnostics.

The focused tests independently derive and verify every classic cell's 20 peers,
all 27 normalized houses, 243 covers, canonical registration permutations,
ordered relation cells, deep-copy isolation, forged/missing keys, malformed
parameters and capabilities, complete-assignment semantics, and mutation
resistance of exposed data.

## Integration notes

Production includes only `all-different@1`. Sum and ordered-relation strategies
remain test-only in `web/tests/solver/mock-rules.ts`. Semantic soundness of a
rule's emitted capabilities remains the responsibility of its registered rule
strategy; assembly validates structure, known problem references, unique IDs,
and assembler-owned premise handles. T03 supplies the checked fact authority.
