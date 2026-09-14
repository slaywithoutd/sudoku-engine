# Templates and pattern overlay (C33)

Status: implemented, pending independent review. This family enumerates complete
one-digit template relations and checks every removal independently. It does not
enumerate complete nine-symbol solutions.

A template chooses one cell in each row, column and box. Its selected cells must
contain the digit in their current candidate masks, and it must contain every
explicitly placed occurrence of that digit. An unresolved singleton is a mask
restriction; it becomes an anchor only after an applied placement. This is a
complete enumeration of that abstraction, which is a superset of full solutions.

| Mode | Symbol count | Completion requirement |
| --- | --- | --- |
| Per-digit templates | 1 | Complete source list, then project its supported cells |
| Pattern overlay / POM | 2 or 3 | Test the complete Cartesian product and project compatible tuples |
| Template incompatibility | 2 through 9 | Synchronously remove each template without a partner in every other symbol; repeat through a nonproductive round |

All geometrically legal empty-grid templates number **46,656** per symbol.
Overlay and incompatibility share **100,000 actual tuple tests per candidate
revision**. Pair tests count even when rejected or short-circuited. Triple mode
counts every full triple, including those whose first two members intersect.
No partial source list, product, or fixed point can establish an absence.

## Ownership and public APIs

`buildTemplates(view, symbol, workspace)` yields `work`, then a complete
`TemplateIndex` in `ready`, or `interrupted`. Production uses row-by-row column
and box occupancy. Every attempted row alternative, including rejections, yields
work. `TemplateIndex.codes` is sorted and immutable; `symbol`, `acceptsView`,
`completeFor` and `dispose` follow the existing owned-index contract. Acquire the
index before accounting at a ready transition: the producer has transferred its
lease. Closing an unfinished generator releases its reservations and publishes
no index. Codes contain base-nine column positions, most significant position
for row zero; `templateCells(code)` decodes them into **CellIds**, not SymbolIds.

`TemplateOperationContext(view)` is an explicit operation/branch owner. Pass it
as `DiscoveryContext.templates`. `consumeTuple(view)` checks the accepted
candidate revision and consumes one persistent exploration test. `tupleTests`
reports usage. No module-global counter or detector-created replacement exists.

`advance(nextView, charge)` requires an authentic descendant in the same accepted
lineage, assembly, problem and branch. It calls `isAcceptedDescendant` with the
supplied work callback, traversing only the changed proof prefix. A newer
candidate revision resets the allowance; a same-revision proof-prefix update or
cold rebuild preserves it. Lower revisions, independently initialized states
and same-assembly siblings reject. A callback interruption propagates before any
counter reset. Merely restarting discovery or extending a proof prefix cannot
replenish the quota.

`compileTemplates(view, plan, context)` yields accounted work and returns a
complete proposal or `null` for no effects. It releases temporary indexes and
scratch before transferring the returned proposal to its caller. The caller
owns that result. `TemplatePlan` specifies `mode`, ordered distinct `symbols`,
and an optional compatible alias. Standalone callers must create and preserve
their explicit operation context too. Compiler interruption throws a resource
error and never returns partial effects.

`discoverTemplates`, registered through `templateTechniques`, shares nine source
relations and round-robins four independent mode cursors. Incompatibility starts
with the full-nine fixed point, then lazily considers all other subsets of sizes
two through eight. A proposal is borrowed until the generator resumes or closes.
Terminal interruption/exhaustion is emitted after all discovery leases are
released. Missing `context.templates` is a configuration error before work or
allocation. Missing authentic classic geometry is an explicit watched exclusion.
Tuple overflow maps to `interrupted: work-limit`; it never reports exhaustion.

T19/T20 must own the context for the operation, call `advance` on accepted state
transitions with charged lineage work, and count ordinary work events across
wall slices, restarts and detector calls. The compiler's local work/deadline
guards do not replace that operation-wide controller accounting. Its source scan
also accounts the finite prefix traversal used by the proof allocator.

## Authenticated certificate

`template-cover@1` is a cooperative primitive producing one nonempty conjunction
of **all** unsupported current, unplaced candidate literals for its selected
mode. Ordinary `conjunction@1` projections derive the negative effect roots, and
ordinary `domain-restrict@1` derives each final changed domain. There is no new
Proposition variant, table widening, or cache-only C33 issuer.

Its premises are canonical, one-level `conjunction@1` packs with at most 27
terms each:

1. Three packs contain the 81 current exact domain assertions, in cell order.
2. One pack contains the 27 explicit row, column and box all-different facts.
3. Cover packs contain nine row-cover facts per selected symbol, in symbol/row order.
4. Anchor packs contain one checked positive literal for every nonzero current
   value, in cell order. An empty anchor category has no pack.

Original positive given literals can establish both a singleton-domain slot and
its anchor slot. Derived placements require their actual checked positive root.
There are no missing/extra/duplicate members within a category, no nested-pack
laundering, and no fabricated anchors inferred from singleton masks. Scopes,
rule provenance, assumptions and conditional taint propagate normally.

Compilation accepts closed conditional facts as sources and continues to exclude
open assumptions. Primitive-level tests demonstrate inherited conditional taint,
rule provenance and open-scope metadata through the source packs, certificate and
projections; these inputs do not issue checked authority. The authentic lifecycle
from a uniqueness-derived placement through C33 compilation/discovery, checking,
conditional commit and original-clue replay remains an explicit T18/T25 gate,
including refusal by the primary/Perfect path. No uniqueness issuer exists in T17,
so that end-to-end conditional gate is not claimed here.

Parameters are exactly `mode`, `symbols`, `templates`, `supported`, `tupleTests`
and `rounds`. Each source/supported list is strictly ordered, distinct base-nine
codes in canonical chunks of 1,024, with a shorter final chunk permitted.
`rounds` records every productive synchronous removal-count vector. These are
untrusted claims: their complete contents and counts are independently checked.

`TemplateCoverChecker` imports no production index/detector/compiler. It visits
all 9! column permutations, filters boxes and each symbol's exact mask/anchor
restrictions, compares every legal template against the supplied list, then
recomputes the complete mode. Rejection alternatives are reconstructed during
this bounded replay rather than transported as thousands of separate branch
nodes. One shared authenticated DAG node therefore covers every negative root.
The final grammar requires every supplied negative root to project this exact
new certificate. Additional individually valid but unrelated roots reject.

Independent replay has its own **100,000 per-certificate semantic limit** and
charges actual verifier work. It neither consumes nor replenishes the discovery
operation's persistent exploration quota. Interleaved discovery modes track
their own certificate counts separately from the shared counter.

Existing 64-premise, 16 KiB node, proof-node, step-byte, retained-proof and workspace
caps remain in force. Scratch is conservatively reserved before source flattening,
decoded lists, support sets and synchronous generations. Large complete indexes
may exist when their wire certificate cannot fit; that is explicitly incomplete
proof work, never permission to omit legal templates. This does not promise that
all combinations can be visited within a configured work slice.

## Durable acceptance evidence

Run from `web/`:

```text
npm test -- tests/unit/solver/templates.test.ts
npm test -- tests/unit/solver/coverage.test.ts
npm run typecheck
```

Repository-owned [C33 fixtures](../../../web/tests/solver/fixtures/C33.json) share
one original clue set honestly. They retain their independently authored exact
source and supported cells. Pair uses 70 tests; triple uses 200 and proves four
exclusions beyond complete pair closure. The three-symbol incompatibility seed
needs two productive rounds and 303 tests. The nine-symbol seed needs four
productive rounds, 2,205 tests and produces 68 complete removals.

The durable tests compare the empty-grid set against a separate permutation
enumerator, independently rebuild each relation with BigInt intersections,
assemble a second certificate without production builders, replay every prefix
from original givens and explicit peer exclusions, and force every returned
candidate through independent Algorithm X using both local domains and original
clues. Actual discovery has its own checked/oracle gate. Mutation gates cover
source/support omission, unfinished products/rounds, anchors, mode substitutions,
mixed valid/unrelated roots, transport/work limits and resource ownership.
Catalogue evidence is preflighted on a read-only proposed verified status while
the tracked row stays `implemented` until independent review.
