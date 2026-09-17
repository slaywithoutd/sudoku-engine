# Wings and short patterns (C10–C13)

These four classic families emit named, checkable deductions. Their implementation
does not make the expanded profile ready: C06–C09 and C14 onward remain separate
acceptance obligations. No puzzle solution or uniqueness premise enters discovery.

## Public contracts and responsibilities

`TechniqueDescriptor.discover(view, { workspace, limits })` requires the caller's
shared `IndexWorkspace` and selected `Limits`. Events are `work`, `proposal`,
`exhausted`, or `interrupted` with an explicit reason. The caller charges work and
time and closes an abandoned cursor. A forced iterator return is incomplete.
`RuleModule.propagate` retains its existing signature; foundation strategies may
ignore the new context.

Each module exports a frozen descriptor array: `shortPatternTechniques`,
`wingTechniques`, `bentSubsetTechniques`, and `remotePairTechniques`. `ShortPatterns`,
`Wings`, `BentSubsets`, and `RemotePairs` implement a composed strategy interface.
The shared descriptor factory owns invocation lifecycle. `PatternGraph` borrows a
complete implication index and reserves its own lookup entries. `PatternBuilder`
emits untrusted primitive syntax. None of these objects issues proof authority.

`pattern-contracts.ts` independently exports `validateShortPattern`,
`validateWingPattern`, `validateBentPattern`, and `validateRemotePattern`. They
consume the declared pattern and effects and return finite primitive requirements.
`checkPatternProof` checks named geometry, current proved domains, exact support
premises, permitted elementary clauses, local table scopes, and resolution
vocabulary. The ordinary checker still verifies every primitive, imported fact,
scope, root, domain closure, and effect. There is no generic named-certificate
acceptance switch.

`pattern-proof-lineage.ts` adds independent mandatory proof checks after ordinary
primitive admission. `BentTableLineage` walks the local filter/union DAG iteratively
and memoizes exact node identities. Every leaf uses every current selected-cell
domain fact and exactly one authenticated constraint for every declared pair.
Union children must retain identical source premise IDs and reconstruct disjoint,
complete Cartesian partitions. The final nonempty table projects the exact Z
occurrence clause, and that projection must be an ancestor of every supplied
negative effect root. Auxiliary relation-conflict tables cannot replace this local table;
an unused local table cannot decorate a smaller proof.

Dual ER identity includes the symbol, ordered vertices and strong-scope cell sets.
The empty-intersection label is presentation data and does not distinguish an
inference. The first strong scope is always the box, fixing path orientation.
`ShortComponentLineage` separately binds each component's endpoint clause to its
two exact current house covers and every middle conflict. Its target roots then
use only that endpoint clause and the component's outer target conflicts. Every
supplied negative effect root must belong to one of these component-local proofs,
and the two components must contribute distinct
root node IDs. Shared premises and coincident endpoint clauses are permitted;
pooled cross-component resolution does not satisfy either component's grammar,
even when genuine component roots accompany it.

## Implemented named geometry

| Family | Construction and bounds |
| --- | --- |
| C10 | Scalar Turbot has four same-symbol candidate vertices and three internal strong/weak/strong links. Skyscraper has parallel strong houses; Two-String Kite has orthogonal strong houses with its inner join in a box. Empty Rectangle partitions every support of a box cover into nonempty disjoint row/column arms of at most three members, with an empty intersection and a conjugate line. Dual Empty Rectangle declares two distinct valid paths and retains both checked roots. Targets conflict with every member of the outer groups. |
| C11 | XY-Wing and Y-Wing use a bivalue XY pivot and XZ/YZ wings. XYZ-Wing adds Z to the pivot, and the target must also see that occurrence. W-Wing uses two identical bivalue endpoints and an exhaustive two-support house bridge. All endpoint/bridge cells are distinct. |
| C12 | Four to six unresolved cells have exactly as many union symbols. Exactly one shared symbol is unrestricted; every other shared symbol's occurrences conflict. The complete selected-cell all-different conflict list and domains define the table. Nonempty surviving assignments must all contain Z. Targets see every declared Z occurrence. Four cells use WXYZ-Wing; five/six use Bent almost-locked subsets. Seven cells are outside the profile. |
| C13 | A simple path contains 4, 6, 8, 10, or 12 identical-bivalue cells. Each internal cell contributes a strong edge and each neighboring pair contributes a weak edge: `2m−1`, namely 7/11/15/19/23 inference links, bounded by 24. Endpoints have opposite colors. The target's two conflict premises are additional. The chute alias requires every path cell in one band or one stack. |

Patterns retain explicit geometry: C10 `paths` with vertices and strong houses;
C11 pivot/wings or endpoints/bridge; C12 cells, symbols, occurrences and conflicts;
C13 ordered cells, two symbols, counted `inferenceLinks`, and chute. Nonempty
subsets of eligible effects are admissible, allowing separately checked roots
and independent fixture certificates to retain their original effects.

## Primitive expansion and provenance

Cell covers expand through `cover-clause@1`; house covers use `support@1` with
every current scope domain followed by `cover-clause@1`. All-different and cell
conflicts use `weak-link@1`. Resolution composes only the declared local clauses.
Every effect has a negative literal root and an exact `domain-restrict@1` closure.

Relation conflicts expand through the indexed source relation and complete
single-cell domain filters/joins for all its cells. The cooperative
`table-project@1` checker can prove a canonical 2–64-literal clause only when
every surviving source tuple satisfies it. It rejects incomplete partitions,
foreign cells and surviving counterexamples. This permits unconditional graph
families to consume relations without introducing assumptions. Empty complete
sources entail clauses at the primitive level; C12 separately requires nonempty
local survivors. Existing single-literal and false projection forms remain intact.

C12 derives two-cell constraints with `all-different-subset@1`, enumerates only
the selected cells, and partitions larger Cartesian products into leaves of at
most 256 combinations, joined by complete partition unions. It projects the Z
occurrence clause and resolves ordinary target conflicts. Its discharged policy
permits this unconditional proof. No target cell or remainder of the grid enters
the assignment table. Table work includes rejected assignments.

Borrowed recipes retain exact source fact IDs. Open source assumptions never
enter the index. Conditionality and rule provenance flow through normal primitive
inference; the named compiler does not replace them with geometric authority.

## Ownership, bounds, and cost

Each invocation currently builds its implication index under the caller's shared
workspace, checks `completeFor(view)`, and disposes it on exhaustion, interruption,
return, or exception. No cache is treated as complete merely because its old
premises remain valid after a same-revision proof-prefix extension. There is no
global index locator or detector-local whole-run budget.

The index owns its T08 reservations. The invocation additionally reserves 65,536
scratch bytes; lookup records reserve one entry and 256 or 512 bytes. Each current
certificate reserves 65,536 scratch bytes and conservative per-node storage
(2,048 bytes plus serialized conclusion and premise allowances). Its lease stays
live while the proposal is yielded and closes on resume or return. Earlier
proposals do not accumulate detector-owned leases. Retaining a proposal after
resuming its producer is the caller's responsibility. These are conservative
accounting conventions, not measured JavaScript heap sizes.

Source scans, graph preparation, tuple/path extensions, rejected combinations,
table enumeration and relation filtering yield work. Workspace cancellation is
checked between those yields. Selected step node/byte ceilings emit
`interrupted("proof-step-limit")`; index caps and cancellation preserve their
explicit reasons. Only completed enumeration emits exhaustion. Full-board bent
combinations, remote simple paths, and dual-ER pairing can be expensive. No claim
of cheap exhaustive discovery is made. T19/T20 must charge every work event,
enforce operation limits, invalidate cursors after accepted state/source changes,
and may add an explicitly owned cache provider. These families do not query ALS
or RCC; future ALS consumers must use T08 `rccSteps` under shared accounting.

Named grammar admission remains synchronous in the existing checker contract.
Its temporary sets, arrays and source scans are bounded by the admitted proof
prefix, finite pattern sizes and step limits, but are not separately yielded or
byte-reserved by that admission routine. In particular, weak-source checks scan
closed facts and relation tuples, C12 reconstructs at most 15 selected-cell
conflicts, and proof admission scans the step's nodes. Builder signatures and
the final proposal-size `JSON.stringify` are also synchronous. Discovery arrays
for at most 81 cells, ER arm lists, and recursion cursors occupy the invocation
scratch allowance. T19/T20 must account for these atomic sections; T26 must
measure their worst observed slices. Cooperative outer loops and proposal caps
alone do not establish UI responsiveness.

The additional lineage checks are also synchronous. C12 retains a memo and work
stack linear in its admitted local table nodes, with at most six masks and 21
source IDs per memo entry, plus a linear set of projection descendants. Dual ER
uses two bounded component scans and one node scan per component/effect, retaining
one integer mask per admitted node rather than complete ancestor sets. Its ER
groups bound middle conflicts to three and outer target conflicts to four.
Semantic identity serializes four groups and two nine-cell scopes per comparison.
These temporary allocations and scans require T19/T20 accounting and T26 slice
measurement; this fix does not add cooperative yields to named admission.

## Independent acceptance and reproduction

`C10.json`–`C13.json` contain repository-owned original clues, exact given-peer
prestates, named geometry, effects, provenance, and SHA-256 oracle-input records.
The root authored 25 positive inputs before these detectors: 8 C10, 7 C11, 3 C12,
and 7 C13. Their prestates, selected geometry, and effects are preserved. Alias
serialization changes are explicit. Three Y-Wing presentations, a row Turbot
presentation, and an independently transposed W-Wing add five positive fixtures.
The transpose maps every clue, domain, cell and effect identically, without
consulting discovery. A further independently authored original-clue six-cell fixture exercises 5,000
Cartesian assignments and 220 surviving local assignments, requiring complete
partition unions in both production and independent certificates. Fifteen
additional fixtures exercise invalid geometry and
profile boundaries.

`short-pattern-acceptance.ts` independently compiles certificates from those
fixtures. It imports no production builder, detector implementation, named
validator, or index. Its local resolution and table routines are separately
written. Discovery matching is a separate harness function. Acceptance verifies
both independent and discovered proposals, recomputes every given-peer domain
independently, reproduces input hashes, establishes SAT, refutes 42 forced
counterfactuals, and confirms the corresponding forbidden cases remain SAT.
Every positive certificate replays after its original-clue proof prefix.

Tests cover every named alias, row/column forms, XY/XYZ box forms, ER arm
completeness, both dual roots, wrong pivot sizes, missing visibility, false
conjugacy, restricted-symbol lookalikes, C12 table-source/foreign-cell mutations,
nonempty local survivors, omitted conflict edges, all five remote lengths,
odd/overlong paths, chute boundaries, primitive/premise/pattern mutations,
shared leases, cancellation and proof caps. The relation regression separately
expands both the unconditional clause recipe and the original discharged T08
recipe inside a non-applying `CertificateSession`.

Review regressions independently construct primitive-valid substitutions: the
C12 four-cell table with one declared conflict omitted and five recounted
survivors, a ten-node two-cell proof with no table, an unrelated complete table
root, and an independent effect root beside a genuine table-derived effect root.
Dual regressions cover the same inference under two empty-corner
labels, exhaustive discovery on that prestate, genuinely distinct paths with
coincident endpoint clauses, and a pooled proof using both components' covers
without both component-local roots.

Run from `web`:

```text
npm test -- tests/unit/solver/short-patterns.test.ts tests/unit/solver/wings.test.ts tests/unit/solver/implications.test.ts
npm run typecheck
```

The mathematical counting clarifications are D070, D074 and D075 in the tracked
decisions and contracts. No external puzzle or authored solution is used as a
proof fact.
