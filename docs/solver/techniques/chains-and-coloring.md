# Coloring, chains and loops (C14–C17)

These strategies discover candidate proposals. The independent primitive checker
and closed named grammars establish their correctness before candidate state can
change. Neither a colored edge, an index recipe, nor an oracle score is a proof.

## Public responsibilities

| Export | Responsibility |
| --- | --- |
| `coloringTechniques`, `Coloring` | C14 simple coloring/trap/wrap and two-component multi-coloring; C15 Medusa. |
| `chainTechniques` | C16 X-Chains, XY-Chains and AICs. |
| `loopTechniques` | C17 continuous/discontinuous loops, grouped AICs/loops and ALS links. |
| `ChainSearch`, `chainDescriptor` | Invocation-owned OR-event graph and deterministic resumable enumeration. |
| `ChainCertificate`, `compileChain`, `chainProofFits` | Untrusted primitive expansion and wire-budget gate; no checking or candidate mutation. |
| `checkChainPattern`, `ChainSources`, `projectedSource` | Exact source, geometry, polarity and all-effect-root lineage validation. |
| `checkColoringPattern` | Complete XOR components and exact two/four-leaf case trees. |

The public certificate types are `ChainEvent`, `StrongSource`, `ChainLink`,
`ChainPattern`, `ColorEdge`, `ColorComponent`, `ColorBranch` and
`ColoringPattern`. Helpers for candidate/event identities are pure values.
The registry composes descriptor arrays as strategies; each invocation owns its
graph, compiler and cursors. There is no process-global discovery cache.

## OR events and checked sources

A chain event is an OR of **all** its `members`. A strong link establishes at
least one of its endpoint events; it does not automatically establish XOR.
A weak link records the complete Cartesian product of negative member pairs.
Each ordered link stores its primitive source roots, and each continuous-loop
effect records the weak-edge cut whose strengthening supports that effect.

Scalar strong links expand current bivalue domains or complete current supports
of a declared classic house cover. A `proved-cover` recipe can instead cite an
exact closed smaller cover inside a declared classic house. It filters every
source member against current proved domains. Coloring additionally proves
exclusivity through its separate weak premise, preserving both provenance paths.
Group vertices contain two or three
same-symbol candidates forming the full current support in a three-cell classic
house intersection. Omitting a group member changes the claim and is rejected.

An ALS visit is identified by its selected cell set, independently of source
house or presentation. Its two symbol events retain every occurrence in that
set, including five occurrences where applicable. The local table uses the
exact current domains and a proved all-different subset. Leaves partition boxes
of at most 256 assignments; unions reconstruct the entire domain product.
The checked projection proves the OR of both entry/exit events. Each ALS has
its own table, so four visits never require an oversized combined table.

## Complete coloring certificates

C14 components use single-symbol house conjugates; C15 adds bivalue-cell XOR
edges. Every edge has both a checked positive OR and a checked negative pair.
The grammar reconstructs all eligible current edges touching each supplied
component, checks connectivity and both colors, and rejects disconnected or
truncated components. Strong-index membership alone never supplies exclusivity.

Each effect has an actual primitive `cases@1` tree. Simple coloring and Medusa
have two leaves. Multi-coloring selects exactly two distinct components and
has all four joint assignments. A leaf derives either the declared conflict or
the target exclusion from checked XOR propagation and its declared witness.
The grammar checks every leaf and every supplied effect root. A valid smaller
resolution proof, even appended beside genuine roots, cannot replace the tree.
All assumptions are discharged before the effect and domain roots are admitted.

D082 projects multi-coloring's two lexical assumptions as `maxBranchDepth=2`
and four alternatives; C15 remains depth one/two alternatives. This is the
bounded two-component case tree, not a forcing-net search extension.

Complete source clauses are packaged through checked conjunction introduction
and projection to keep every mandatory source reachable. A projection retains
only its actual selected source's lineage; unrelated conjuncts cannot contribute
path coverage or substitute for a coloring case tree.

## Paths, loops and profile bounds

Paths are simple in candidate-event identity, except their explicit closing
endpoint. Ordered strong and weak links alternate. X-Chains use one symbol;
XY-Chains use bivalue-cell strong transitions; AICs permit cell/house sources.
Open endpoint proofs start and end strong. The compiler establishes the full
endpoint OR before applying target conflicts, preventing a target in the
interior from silently selecting a shorter proof.

Continuous loops include their closing edge in the link count. Removing a weak
edge leaves a complete strong-ended route that proves that edge's positive OR.
Discontinuous loops check both links at the repeated endpoint: two strong links
prove it on; two weak links prove it off. Positive placements include explicitly
proved peer removals and exact final domain roots.

| Bound | Admission and acceptance |
| --- | --- |
| At most 24 inference links | All internal links count, including cell transitions, ALS internal links and loop closure. Target conflicts are additional. |
| Four/24 open vertices | Independent original-clue positives contain 3/23 links. An even 24-link alternating prefix is not a productive strong-ended path; 25 links reject (D077). |
| Productive 24-link loop | Independent and production compilation exercise the supplied 24 distinct vertices and all 24 links including closure. |
| At most four special nodes | Count ordinary group vertices plus semantic ALS visits. Each ALS entry/exit pair is one visit, with its internal edge counted separately (D078). |
| Groups of at most three members | Supplied positive uses two complete three-member intersections, also closed into a grouped loop. |
| ALS sets of at most five cells | Supplied ALS3/4/5 positives retain complete occurrences and separate tables. A four-visit positive uses four singleton ALS tables; a primitive-sound five-visit case rejects. |

For each path effect, the named grammar tracks every selected link source
through only allowed resolution steps and exact conjunction projections. Every
matching supplied root must cover the complete path; a smaller valid path cannot
decorate the long explanation. Continuity also requires the omitted weak edge's
checked source certificate.

## Work, ownership and honest completion

Discovery builds the implication index under the caller's shared workspace and
requires `completeFor(view)`. `acceptsView(view)` alone is insufficient after a
proof-only prefix extension. ALS discovery similarly requires its complete
current index, then retains copied event recipes under its own graph lease.
Only closed accepted source facts enter either graph. A new invocation rebuilds
for the exact immutable view; no old cursor is resumed against a new prefix.

The current accepted proof-only publisher can add singleton covers. Its unchanged
revision invalidation and the consumption of a smaller two-literal cover after
an accepted effectful step are separately tested. No current same-revision
publisher creates a new two-literal cover; the combined unchanged-revision
edge-growth test remains a future producer integration gate assigned to T25.
These techniques do not admit effect-free caches merely to manufacture that test.

Paths use iterative deepening by link count and canonical event/edge order.
C17 gives deterministic turns to scalar, grouped and ALS cursors; C14 similarly
services single-component and two-component spaces. Cursor state stays local;
there is no scheduler job for each combination. Work yields, workspace
reservations, cancellation and explicit work/proof caps bound the operation.
Every cursor and lease closes on completion, return, cancellation or error.

`exhausted` means completed enumeration only. An interrupted broad search reports
`work-limit`, a workspace reason, cancellation or `proof-step-limit`; it cannot
claim absence or exhaustion. The bounded-search regression checks all emitted
effects and reaches its 100,000-work limit before rediscovering the exact
23-link original route. This is explicit incomplete search evidence, not a
claim that every maximum-length route is reached within that budget.

## Independent acceptance and provenance

`web/tests/solver/fixtures/C14.json` through `C17.json` retain the root author's
16 original clue strings, exact given-peer domains, complete selected geometry,
and all 30 expected effects. The original SHA-256 input records reproduce
16 satisfiable prestates, 30 exhausted force/forbid counterfactuals, 1,578 oracle
nodes and zero failures using the unchanged T01 Algorithm X implementation.
The known complete grid used when constructing clues is never a candidate or
proof axiom. All prestates and steps replay from original clues and declared rules.

`web/tests/solver/chains-acceptance.ts` is an independently written certificate
compiler. It uses seed geometry, current domains and direct coordinates, imports
no production detector/builder/grammar/index at runtime, and reuses only the
earlier test certificate algebra and original-clue fixture harness. Production
certificate types are type-only imports. JSON retains the original semantic seed
format; the compiler adapts singular seed aliases to the exact catalogue aliases
and records explicit source/case roots in the resulting wire certificate.

The positive discontinuity seed retains its expected placement. Its full
transaction adds the two required, independently checked peer removals. Added
repository-owned cases close the supplied group geometry and independently
enumerate four/five ALS visits on the original XY prestate. Their extra effects
are checked independently and are not included in the original 30-effect count.

Production discovery tests establish every named family and independently check
returned effects. Exact maximum geometry is tested through independent
certificates **and** the production compiler; family discovery does not claim
it recovered the exact long seed before its work cap. Adversarial checks include
false XOR, omitted edges/members/branches/occurrences, broken alternation,
wrong polarity, excessive length/ALS visits, assumption escape, and standalone
or mixed primitive-valid substitutes. Resource tests cover both honest
interruption and genuine completed exhaustion.

Run from `web/`:

```text
npm test -- tests/unit/solver/coloring.test.ts tests/unit/solver/chains.test.ts
npm run typecheck
```
