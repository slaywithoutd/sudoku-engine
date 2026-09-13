# Finite set arguments: C20 and C21

C20 implements Sue de Coq and its Two-sector disjoint subsets spelling. C21
implements aligned pair, triple and generalized four-cell exclusion, plus
multi-symbol Subset counting. They produce removal proposals; checking and
candidate-state admission remain separate operations.

## Named mathematics and sources

For Sue de Coq, choose intersection C of two or three cells of a real classic
box and line, and disjoint line/box side sets A/B of one to four cells each.
Each side is an ALS: its complete candidate union has one more symbol than
cells. Write V for C's union, VA/VB for the side unions. Admission requires:

```text
|V| >= |C| + 2
V intersect VA intersect VB = empty
|A| + |B| = |V| - |C| + |VA minus V| + |VB minus V|
|C| + |A| + |B| <= 11; |V union VA union VB| <= 9
```

The unused geometric third intersection cell may belong to one side. Symbols
outside V may occur on both sides and contribute separately to the two deficits.
The permitted line eliminations use VA union (V minus VB), and symmetrically for
the box, outside that sector's selected cells. This is the extended form in
[HoDoKu's Sue de Coq description](https://hodoku.sourceforge.net/en/tech_misc.php),
inspected 2026-09-13. The engine also checks the complete local allocation table;
the cardinality annotation alone has no authority.

Aligned exclusion enumerates the complete Cartesian product of two to four
selected current domains, including conflicting assignments, up to 6,561 rows.
A row survives or cites a proved direct conflict or an explicitly empty matching
in a disjoint auxiliary ALS of at most five cells. Auxiliary domains are complete.
Every blocked auxiliary candidate has a checked conflict with an assigned
selected candidate. A complete auxiliary table proves that at least one blocked
candidate must occur; resolution yields the tuple's exclusion. Closed relation
conflicts may involve different symbols. Equal values in nonpeer selected cells
are retained unless an actual constraint forbids them. Selected cells need not
see each other; see [SudokuWiki's aligned-pair description](https://www.sudokuwiki.org/Aligned_Pair_Exclusion),
inspected 2026-09-13. A selected candidate is removed only when absent from all
surviving rows.

Subset counting implements the multi-symbol Extended Subset Principle described
in [SudoCue's guide](https://www.sudocue.net/guide.php#SubsetCounting), inspected
2026-09-13. Force a target candidate and count the exact maximum compatible
occupancy for every original symbol over at most twelve counted cells, using
one to four explicit all-different scopes. The sum of these maxima is an upper
bound on the number of filled cells, even if the individual maxima cannot occur
together. A sum below the counted-cell total refutes the target. Zero capacities
remain in the certificate. This implements multiple symbols, rather than
substituting a one-symbol cover inequality for this family.

The author's search advice starts with empty cells. This engine's approved
finite arithmetic profile also permits checked original or derived singleton
cells as counted terms. The target remains unresolved. An external target is
not a thirteenth counted cell; its exact domain is an additional premise and
its incidences are included in the same four scopes.

## Proof and ownership contracts

`set-contracts.ts` exports `LocalSet`, `SdcRoute`, `SdcPattern`, `AlignedPattern`,
`CountScope`, `CountPattern`, and `SetPattern`. These are untrusted wire records.
Patterns carry exact current domains, local geometry and proof roots. Aligned
`reasons` and `rejections` use lexicographic Cartesian order: zero/-1 means a
survivor, negative reason `-1-pairIndex` a direct conflict, and positive reason
`1+auxiliaryIndex` an empty matching. Every row has exactly one slot.

`SetCertificate` composes `ChainCertificate`; it borrows a complete
`PatternGraph` and the invocation's compilation reservation. `table()` splits
complete domain rectangles into leaves of at most 256 combinations and reunites
every partition. SDC projections retain the complete two-sector table. Aligned
elimination resolves only the selected variables and retains all declared
auxiliary/rejection components. Each call compiles one proposal.

Independent `checkSetPattern` imports no detector or compiler implementation.
It reconstructs exact geometry, sources, complete partitions, rejection
components and effect lineage. Every supplied negative effect root is checked;
an unrelated valid proof cannot decorate a named certificate. Conjunctions
transfer only the selected proposition's lineage, not unrelated conjuncts.

`SubsetCountChecker` adds the cooperative primitive `subset-count@1` through
`PrimitiveRegistry.checkSteps`. Parameters are exactly
`{cells, symbols, capacities, target:{cell,symbol}}`. Premises are the positive
target assumption, sorted complete domain evidence for counted cells plus target,
then one to four distinct reduced all-different scopes. The assumption must be
active in the lexical context. The primitive reconstructs trial restrictions,
enumerates all `2^cells.length` occupancy subsets per original symbol and checks
the exact maximum, including zero. It yields for subsets, selected members and
conflict tests, checks a conservative 4,096-byte scratch allowance against the
remaining checker workspace, and returns only `false`. Existing `discharge@1`
closes the assumption. Original source taint and rule provenance survive.
No fact issuer, bootstrap, replay or candidate-state authority was changed.

`sueDeCoqTechniques` and `alignedExclusionTechniques` supply the C20/C21
descriptors. `SueDeCoqSearch`, `AlignedExclusionSearch` and
`SubsetCountingSearch` own the three enumerations. `sdcAllocation`,
`countCapacities`, `assignments`, `combinations`, `setDigits` and `setUnion` are
untrusted finite math/discovery helpers. `localSets` builds a complete closed
source ALS inventory, and `setDescriptor` owns the invocation lifecycle.

C20 services 32 size cursors. C21 services three aligned sizes and 96 count
cursors (twelve sizes, four scope counts, unresolved-only and singleton-inclusive
spaces). These are fixed internal cursors, not one scheduler job per combination.
Each yield advances one cursor before round-robin service resumes. The complete
implication index is captured before any throwing checkpoint after `ready`.
Compiler/index/reservation ownership is released on return, cancellation, work,
proof or workspace limits and exhaustion. A yielded proposal borrows its lease
until the producer resumes or closes; a retaining caller must reserve its copy.

## Acceptance and limits

`C20.json` has seven original-clue positives: intersection sizes two/three,
both four-cell side boundaries, unused-third-side, shared-outside-symbol, and a
genuine eleven-cell/nine-symbol pattern. The last retains seventeen independently
specified C01 placements outside its selected geometry and one C04 naked pair.
Its exact domains, 48 local allocations, effect and original clues are preserved.

`C21.json` has eight positives: selected sizes two/three/four, a five-cell
auxiliary, internal/external multi-symbol count targets, one-symbol counting,
and twelve counted cells/nine symbols. The twelve-cell case adds nine original
given singleton terms and explicitly makes no essentiality claim. The small
aligned seeds likewise establish supported selected counts, not that every
selected cell is necessary. The independent author reuses disclosed C11/C19 clue
geometry, never production discovery output.

The focused suite checks independent and production certificates, satisfiable
pre-states, exhaustive forced removals and satisfiable forbids, original-clue
replay, actual discovery of every C20 bound/extended feature and each C21 family,
6,561 surviving nonpeer tuples, partition completeness, corruption/substitution,
source-prefix freshness, authentic partial capability shapes, closed relation
sources, cancellation and exact index-transfer budget boundaries.

```text
cd web
npm test -- tests/unit/solver/set-arguments.test.ts
npm run typecheck
```

All bounds are enumerable, but broad grids can interrupt before reaching a
productive combination. Such cursors report `work-limit`, never `exhausted`.
Large certificates may reach existing node/header/byte caps and report
`proof-step-limit`; table partitions do not exempt wire limits. Production
discovery of the padded twelve-cell count fixture is not claimed. Expanded
application readiness, worker scheduling, benchmark enforcement and UI remain
later tasks. T19/T26 must account for the new primitive's yielded work and scratch
allowance and preserve the proposal-lease contract.
