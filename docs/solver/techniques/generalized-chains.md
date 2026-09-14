# Generalized chains and proved OR clauses

C25–C28 use complete CSP-variable alternatives and ordered primitive proofs.
They do not reinterpret an arbitrary AIC as a whip or braid. The implemented
aliases are `Bivalue chains`, `z-chains`, `t-whips`, `Whips`, `Braids`,
`g-whips`, `OR-k forcing`, and `OR-k whips`. The last alias names the finite
inserted-OR specialization below. Implementation evidence is in
`web/tests/unit/solver/generalized-chains.test.ts`; independent task review is
separate from the manifest's `implemented` status.

## Variables, candidates, and the finite grammars

`buildCspVariables(view)` returns unresolved cell variables and declared
house-symbol variables. Each record contains its exact current alternatives,
stable variable ID, and the FactIds proving the complete domain/support. A
candidate is the physical `[cell, symbol]` occurrence. Projecting an occurrence
into a cell and a house does not create two different candidates.

For an assumed target Z, a position identifies a complete variable, a left
candidate L, its continuity conflict, a scalar right or right group, and every
other rejected alternative with its witness. The right set must actually
survive the previously established truths. A previously refuted right cannot
be carried through redundant positions to reach a numeric bound.

| Grammar | Left continuity | Other rejected alternatives |
| --- | --- | --- |
| Bivalue | Preceding right, or Z at the start | Exactly two original alternatives; endpoint closes against Z |
| z-chain | Preceding right, or Z at the start | Z only |
| t-whip | Preceding right, or Z at the start | Earlier rights only |
| Whip | Preceding right, or Z at the start | Z or earlier rights |
| Braid | Z or any earlier right | Z or earlier rights |
| g-whip | Preceding scalar/group right, or Z | Z or earlier scalar/group rights |

All forms have at most **twelve positions**, including a no-right terminal
variable. Twelve full pairs followed by endpoint closure also use twelve
positions; an extra terminal would be a thirteenth position. In the t-only
terminal, one explicitly designated `closingCandidate` may conflict with Z;
the remaining non-left alternatives must use earlier rights. The first t-only
position remains bivalue. Target-dependent interior extras do not qualify as
t-only evidence.

A group is two or three occurrences of one symbol in a declared classic
box-line intersection. At most four right groups occur. Every conflict with a
group has a proof against every actual member. The group itself is an OR
clause; group labels do not mint candidate identities or exclusivity. A scalar
is represented by one member. Main left/right occurrences are distinct across
positions. In the source-supported g-whip extension after a group, a variable
may be revisited nonadjacently, while physical main occurrences remain distinct.

## The two C28 structures

**OR forcing** imports an already checked, closed clause with two through four
signed alternatives. Every alternative has its own lexical case assumption
and a checked branch yielding the same effect or a contradiction. Static paths
have at most twenty-four links per branch, summing both paths when a branch
closes by complementary endpoints. Generalized branches have at most twelve
positions and retain their own C25–C27 grammar. A generalized branch can refute
its positive case alternative, or derive the common negative effect from its
last right. Multiple cases may need generalized proofs, including different
scalar/group grammars. No recursive cases or inserted-OR branch are admitted.
Positive static conclusions include every required peer removal and domain
closure.

A nonterminal right must contain at least one actual candidate. A generalized
branch's result proposition must exactly match its declared negative literal
or explicit contradiction role; a primitive-valid contradiction cannot be
presented as a direct literal result.

**Inserted OR-k whips** import a positive-candidate clause in exactly one
position of a scalar continuous whip. Its left alternative conflicts with the
preceding right or Z. Every other rejected OR alternative conflicts with Z or
an earlier right, leaving exactly one right. Ordinary prefix and suffix
positions use the general whip policy. The OR position counts once within the
twelve-position cap, as does a no-right terminal. One target assumption is
discharged; there is no outer case split. A generic exhaustive forcing proof
cannot be relabeled as this ordered insertion. Clause truth supplies OR only,
even when a particular fixture obtains its clause from an exclusive variable.

## Proof assembly and independent recognition

`compileGeneralized(view, plan, lease?)` and
`compileOrForcing(view, plan, effect, lease?)` assemble untrusted proposals.
The optional caller lease accounts individual proof nodes. Discovery owns that
lease and the surrounding temporary storage. `GeneralizedProof` composes the
existing primitive assembler; it is not a new issuer.

For each excluded candidate, weak clauses and successive resolutions turn the
witness's scalar/group truth into a negative literal. Complete variable cover
reduction proves the surviving right. A terminal lists the complete cover and
all complementary exclusions. `GeneralizedLineage` independently reconstructs
the variable and verifies exact node roles, sources, scopes, member proofs,
ordering, and every reduction. It does not import the production variable
builder, detector, or compiler at runtime. `checkOrPattern` separately checks
the exhaustive case grammar and the inserted grammar.

Every supplied effect root must reach the required complete certificate.
Retained or separately valid shorter theorems cannot replace or decorate the
ordered proof. An unused braid position is rejected, even if the other positions
already prove the removal. Independent test algebra builds a second certificate
from the original fixture recipe, and the independent exact-cover oracle checks
the prestate and the opposite of each effect. Maximum-length proofs need not
be the shortest available deduction.

## Retention and source ownership

`buildProvedClauses(view, workspace)` yields a leased `ProvedClauseIndex` of
authentic closed **signed** clauses of arity two through four. Entries borrow
exact FactIds and Fact objects, carry inherited conditional taint and all-state
watches, and exclude lexical branch-local facts. Inserted discovery filters
for positive clauses; forcing accepts signed clauses. The index does not issue
facts, infer XOR, or accept caller-created fact maps.

`acceptsView` may authorize existing entries against an exact identical source
or a charged same-revision prefix extension. `completeFor` requires the exact
fact-map prefix. Retaining a new clause at the same candidate revision therefore
invalidates source completeness; absence is never inferred from a stale index.
Candidate revision changes, sibling publications, and source replacement do
not inherit source authority. Ready events transfer the lease before any caller
checkpoint that can throw. Cursor closure, cancellation, work/time/proof limits,
entry/byte limits, and failures release each owned index and temporary lease.

D088 adds `mode: "cache"` only for a complete negative C22/C25–C27 theorem.
Its effects are empty and its only root is the fully checked negative theorem.
It retains through `retainCheckedFacts`; values, domains, and candidate revision
do not change. It is neither a cover-only issuer nor candidate progress.
Repeated retention of the same node IDs is rejected. C22 cache mode does not
admit positive placement caches. The C28 fixture sources use independent,
globally scoped cover/weak nodes inside these complete checked DAGs, never the
cached consumer theorem as an OR premise. Run-wide cache dedup remains a
scheduler integration responsibility.

Acceptance exercises separate production and independent source-to-consumer
paths. The independent test assemblers build the complete cache theorem before
named checking and actual retention, then resolve the consumer's clause FactId
from that retained view. Original-clue replay includes the independent source
and independent consumer, including C22 and C25-C27 cache modes.

## Discovery and limits

`GeneralizedSearch` enumerates increasing position bounds, canonical targets
and variable choices, using an occurrence incidence lookup for possible left
links. Complete alternatives and allowed conflict witnesses determine each
right set. `discoverGeneralized` interleaves the two grammars in each descriptor;
equivalent proposals are deduplicated by effect and semantic features without
terminating enumeration. `discoverOr` services static forcing and insertion by
arity, plus separate generalized case grammar cursors. Within a source, its
positive alternative jobs are interleaved so a satisfiable early alternative
does not monopolize generalized case search. Cases never pool hypothetical
rights or sources.

The search has explicit work, time, proof, and shared workspace limits. Consumer
time between yields counts toward the invocation deadline. A stopped search
reports its actual interruption, not contradiction or exhaustion. Complete
variable/incidence storage is reserved from the actual capability counts before
allocation; classic's twenty-seven houses are not assumed for accounting.
These are finite grammar searches, not a universal completeness or browser
performance claim. The focused tests distinguish exact certificate bounds from
the geometry actually found by discovery.

## Primary-source mapping

Mathematical references were inspected at CSP-Rules-V2.1 revision
`7eefd71566b37e55c15f330d474140bfc4f4371d`. The implementation and fixtures are
independently authored; no GPL rule implementation or puzzle collection was
copied. The author's [2013 derivation](https://arxiv.org/abs/1304.3210v1) and
[pinned repository](https://github.com/denis-berthier/CSP-Rules-V2.1/tree/7eefd71566b37e55c15f330d474140bfc4f4371d)
provide terminology and mathematical context.

The inspected paths at that revision are:

- `CSP-Rules-Generic/CHAIN-RULES-MEMORY/Z-CHAINS/z-chains[3].clp`
- `CSP-Rules-Generic/CHAIN-RULES-MEMORY/T-WHIPS/T-Whips[3].clp`
- `CSP-Rules-Generic/CHAIN-RULES-MEMORY/WHIPS/Whips[3].clp`
- `CSP-Rules-Generic/CHAIN-RULES-MEMORY/BRAIDS/Braids[3].clp`
- `CSP-Rules-Generic/CHAIN-RULES-MEMORY/PARTIAL-G-WHIPS/Partial-gWhips[3].clp`
- `CSP-Rules-Generic/CHAIN-RULES-EXOTIC/OR3-FORCING-WHIPS/OR3-Forcing-Whips[3].clp`
- `CSP-Rules-Generic/CHAIN-RULES-EXOTIC/PARTIAL-OR3-WHIPS/Partial-OR3-Whips[2].clp`
- `SudoRules-V20.1/GENERAL/glabels.clp`

The engine explicitly proves surviving rights and every exclusion; source
scheduling assumptions about shorter-rule exhaustion are never premises. The
t-only start and terminal profile follows D081, which is narrower than some
modern target-restricted t starts. C28 uses per-branch bounds rather than the
source's aggregate branch-length ranking. D087 distinguishes forcing from
insertion. Numerical twelve/four/three bounds are the engine's finite profile,
not a claim that the source solver has those limits.

## Remaining publisher integration

C32's actual mixed-symbol guardian publisher belongs to T16. T16/T25 must retain
its authentic closed clause, invalidate C28 completeness at the same candidate
revision, discover/check the deduction, and replay the entire original-clue
path. Repository-owned independently checked guardian recipes exist in the
task handoff, but they are not substituted with a fabricated issuer here.
Actual conditional publishers, scheduler cache dedup, controller mapping and
browser performance remain their owning tasks' integration gates.
