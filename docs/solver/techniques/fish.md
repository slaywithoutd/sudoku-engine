# Fish C06–C09

These descriptors implement basic fish sizes 2–7, finned and sashimi fish sizes
2–7 with 1–4 exo-fins in one box, and generalized/endo-fin/cannibalistic/Siamese
fish sizes 2–4 with at most four combined fin occurrences. Both simple line
orientations and dense patterns equivalent to smaller fish remain supported.
The six basic names are X-Wing, Swordfish, Jellyfish, Squirmbag, Whale and
Leviathan. Finned and sashimi use the catalogue aliases plus an explicit size.

## Contracts and proof

`fishTechniques: readonly TechniqueDescriptor[]` exports four frozen strategy
descriptors. Each requires `discover(view, {workspace, limits})`. There are no
global indexes, private default budgets, solver calls, candidate-assignment
tables, or deductions inferred from scores.

`checkFishPattern(proposal, view, available): void` is structural named admission,
called by the closed `checkTechniqueGrammar`. The existing `checkProposal`
first verifies primitives, exact imports/provenance, reachability, scope closure
and effect/domain roots; only then does it call this named checker. The checker
does not call a detector or builder and does not issue a second proof authority.
This is the actual API adaptation of the older plan's `CheckedInference[]`
sketch. `validateFishPattern`, `validateFishComponent`, `fishHouse` and
`mixedFishForm` are pure geometry/arithmetic helpers in `fish-grammar.ts`.

Each component specifies `alias`, `form`, `size`, `symbol`, sorted distinct
`bases` and `covers`, and exact sorted `fins`. Mixed components also specify the
full 81-entry `incidence` vector. A Siamese pattern specifies alias, size, symbol
and exactly two components. Its component identity is the chosen symbol, bases
and covers, not the display alias. The components share bases and have different
covers. Effects are the union of the separately proved productive effect sets;
overlapping or identical effect sets are permitted. Cannibalistic presentation
selects the proved targets lying in a base.

For every cell, let `b` count selected base houses and `u` selected cover houses.
Full authenticated base digit covers imply `sum(b*x) >= n`; full authenticated
cover all-different capacities imply `sum(u*x) <= n`. Subtraction gives
`sum((u-b)*x) <= 0`. Coefficients retain every overlap, including magnitude two
or greater. Negative coefficients require the digit to be proved absent. With
these terms zero, every remaining term is nonnegative, so a target with positive
coefficient must be false. This arithmetic proves the deduction; geometry names
and cached support recipes do not.

D076 adds a count-only domain decoder. It requires a unique valid in-scope
domain assertion for every negative incidence with the tested bit absent.
Optional zero/positive-incidence domains remain compatible but must also be
valid, unique and in scope. Malformed, duplicated, foreign and non-domain extras
reject. `provedDomains` and `support@1` retain complete-scope evidence semantics.
Full-house weighted parameters, bounded positive weights, premise identity,
inherited provenance/conditional taint and lexical scope rules remain unchanged.
The original size 5/6/7 basic certificates require 30/30/28 count premises,
within the unchanged 64-arity limit.

Exo-fins are live base occurrences outside the covers; endo-fins are live
occurrences belonging to multiple bases. Every declared fin is explicitly false
under the target assumption, even if its net coefficient is nonnegative.
The compiler uses direct authenticated weak links, resolution with target=true,
and restrictions of the exact current fin domains. The count contradiction is
discharged before any root is published. Basic C06 uses an unconditional count
without assumptions. C07–C09 use the discharged policy; primary P is unchanged.
C24 may later extend fin-false branch grammar with separately verified paths;
it cannot treat this implementation as already accepting Kraken paths.

Every supplied negative effect root must contain its matching complete component
count with exact full source IDs and coefficient-one weights, all necessary
current domain facts, and all local fin branches. Each Siamese component must
contribute its own root for each of its effects. A smaller or unrelated valid
proof cannot establish the claimed name, and legitimate component roots cannot
decorate extra pooled or unrelated roots. Final domain roots must restrict the
current domain using one of these accepted negative roots.

D079 keeps Mutant as the general arbitrary-house grammar. Franken is a specific
presentation with a box somewhere and an orientation assignment of rows/boxes
on one side and columns/boxes on the other (swap allowed; a side may contain
only boxes). Geometry can belong to the broad Mutant grammar while discovery
prefers the specific Franken presentation. Same-house IDs across the two sides
are permitted; cancellation of their incidences is not a scope exclusion.

## Discovery, ownership and interruption

`FishTechnique` owns invocation lifecycle, `FishCursorSet<T>` owns deterministic
one-event-per-live-cursor service and closure, `FishSources` borrows source IDs under
an accounted local recipe lease, `FishSearch` owns finite house-combination
cursors, and `FishCompiler` owns each proposal reservation. No inheritance is
needed between these distinct responsibilities. Math and named validators stay
pure. Search uses classic scopes to suggest syntax; the proof checker independently
authenticates the resulting source IDs and arithmetic.

Simple enumeration visits canonical parallel/orthogonal combinations. General
cover enumeration branches on unsatisfied house-incidence requirements, not on
grid values. Every live non-visible base occurrence must have enough cover
multiplicity, and the target must have capacity greater than its base count.
An endo-fin not visible to the target makes that target impossible. These are
necessary conditions of the same certificate, not additional family restrictions.
Sibling exclusions enumerate each cover set once per target, then an accounted
per-base set removes cross-target copies.

Version-one ordering interleaves size cursors and live base-overlap classes.
Within C09, ordinary endo/cannibal and paired Siamese cursors receive independent
turns under the same descriptor, avoiding pair-volume starvation. At most twelve
internal cursors are live; this adds no scheduler jobs. A small finite-stream
test fails with serial service and passes with round-robin service/cleanup;
an eight-house bounded-prefix test also observes both C09 subfamilies.
It first examines unresolved-house combinations and pairs without a shared
house ID across sides; cancelling/redundant combinations remain deferred.
Distinct-effect Siamese explanations precede equal-effect presentations, which
remain in a complete second pass. These are ordering heuristics, not support
filters. Later passes retain earlier components too, so cross-partition pairs
are emitted exactly once. Repeated traversal work is charged. A focused
six-classic-house regression failed by exhausting without a cross-partition
pair before this retention fix, then passed with a checked pair and zero usage.

One source scan and every enumeration/compilation continuation emit work and
check cancellation. A per-cursor `limits.workUnits` guard is secondary to the
future scheduler's cumulative operation budget. The scheduler must count emitted
work once and supply remaining phase allowances. Workspace entry/byte failure,
cancel, work cap and proof step node/byte failure emit `interrupted`; none imply
absence or exhaustion. `finally` closes every live size/cover/compiler cursor
and releases source, cursor, component and compilation leases, including when
the caller stops at a proposal. A failed second live cursor cannot dispose the
first cursor's lease.

D080 capability eligibility resolves actual classic row/column/box cell sets
and closed accepted full-cover/all-different facts, not merely 81 cells or an ID
spelling. Per-symbol bases require a proved full digit cover; capacity houses
require their proved all-different scope. A supporting subset of classic houses
is sufficient; all 27 houses/all nine covers are not mandatory. Open hypothetical
source facts cannot supply global capabilities. Conditional metadata is preserved
for the caller's appropriate branch/policy, never stripped by recipe lookup.
An authentic missing-capability view receives
`{kind:'excluded',reason:'missing-classic-capability',dependencies:[{kind:'all'}]}`
both from eligibility and from direct discovery. It neither throws nor claims
exhaustion. Forged/unowned views fail admission before source access. T19/T20
must consume the explicit exclusion as a watched ledger state; T21/T23 must
preserve its reason/dependencies when transporting and displaying it.

Finite synchronous boundaries remain: classic house/peer reconstruction, arrays
over at most 81 cells and 27 houses, recursion depth at most four for mixed cover
sets, bounded proof-node allocation and proposal serialization, and the named
checker scans over admitted proof nodes and current facts. These atomic sections
are not browser latency guarantees. T19/T20 must charge their work/temporary
storage along with generic checker costs and enforce shared elapsed-time budgets;
T26 must measure actual slices and heap overhead. Source IDs are recipes, and
accounted bytes are conservative units rather than a JavaScript heap promise.

## Independent evidence and provenance

The 63 root-authored positive prestates and 98 expected removals retain their
original givens, domains, geometry and effects. The four original seed sets cover
36 basic/finned/sashimi cases, 12 mixed/endo/cannibal cases, three Siamese cases
with six components, and 12 fin-count boundary cases. All 66 component incidence
vectors and all count premises are independently reconstructible. Only display
serialization changes: generic catalogue aliases/capitalization, and D079 changes
`C09-siamese-2` component two from Franken to Mutant because both sides contain
rows. Its houses, fins, incidence and effects are unchanged.

`fish-acceptance.ts` assembles certificates independently from the frozen input
geometry, without production builders, detectors, grammar validators or indexes.
The committed tests re-run the unchanged T01 oracle: original input hashes,
satisfiable prestates, 98 forced UNSAT counterfactuals and 98 forbidden SAT checks.
Every independent certificate and every accepted discovered proposal replays after
the original clue/peer-exclusion prefix.

Simple discovery matches exact seed geometry, including dense/equivalent patterns.
Complex discovery matches the semantic bound class, required fin count, live
overlap/mixing features and an original expected removal. It can choose other
houses; every one of its effects is independently checked and replayed. A
`discoveryRecord` is explicitly post-implementation observation and is neither
an independent seed expectation nor a proof premise. The exact original complex
geometry remains mandatory in the separate independent certificate/oracle/replay
gates. Nine durable negative/profile fixtures and additional mutations test
aliases, size, missing coverage, fin count/visibility, overlaps and component
count. Valid two-cell, repeated-component and pooled-count substitutions are
tested alone and alongside genuine roots.

Reproduce from `web` with:

```text
npm test -- tests/unit/solver/fish.test.ts tests/unit/solver/fish-complex.test.ts tests/unit/solver/composition.test.ts tests/unit/solver/coverage.test.ts
npm run typecheck
```

An exploratory exact-presentation Siamese scan reached 627,158 proposals and
10,000,000 work units before interruption (124.86 seconds on this workstation).
That result is a volume warning, not a release performance claim. Feature-level
discovery and exact independent proof coverage are separate acceptance questions.
The expanded registry remains blocked until every other required row completes
its own independent acceptance gates.
