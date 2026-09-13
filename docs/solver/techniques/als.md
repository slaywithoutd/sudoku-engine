# ALS relationships, chains and Death Blossom (C18–C19)

An Almost Locked Set contains n unresolved cells in a declared classic house,
with exactly n+1 current candidate symbols. Every set retains its exact domains,
all occurrences of every symbol, and its actual house source. A restricted common
candidate (RCC) requires a checked conflict for every cross-occurrence pair.
Sharing a cell carrying that symbol invalidates the RCC; other shared cells
remain the same logical variables throughout the proof.

## Responsibilities and contracts

| Export | Responsibility |
| --- | --- |
| `alsPatternTechniques` | C18 strategy descriptor for ALS-XZ and ALS-XY-Wing. |
| `deathBlossomTechniques` | C19 strategy descriptor for ALS chains and Death Blossom. |
| `AlsSearch`, `alsDescriptor` | Invocation-owned ALS recipes, charged RCC cache, deterministic search cursors and resource lifecycle. |
| `AlsCertificate` | Untrusted compiler composed with the existing `ChainCertificate` primitive algebra. |
| `checkAlsPattern` | Independent named admission: complete geometry, local tables, source roots, target visibility and every supplied effect root. |
| `alsMembers`, `alsOverlaps` | Pure occurrence/overlap value helpers; neither establishes correctness. |

The wire types are `AlsSet`, `AlsOverlap`, `AlsProjection`, `AlsRcc`, `AlsRoute`,
`AlsPattern`, `BlossomBranch`, `BlossomPattern` and `AlsCandidate`. The compiler
owns its projection cache. Search owns its recipe/RCC cache. The descriptor owns
the indexes, all live search cursors and the current proposal lease. These are
composition boundaries, without an inheritance hierarchy for named techniques.

## Complete local proofs

Each ALS projection has a complete finite table built from current proved
domains and a checked all-different subset. Leaves partition at most 256 raw
assignments; table unions reconstruct the complete input product. A pair of
distinct symbols projects an OR of **all** their occurrences. This is an OR,
not an XOR. Every ALS has its own table, including singleton ALSs. A primitive
bivalue clause cannot substitute for that named table certificate.

Separate local tables preserve overlapping-cell identity through their literal
coordinates. Resolution combines those complete relations and explicit RCC
conflicts. The compiler never creates an oversized table containing all six
sets. This also preserves the effects of overlap without assuming independent
assignments to a shared cell.

Single-RCC XZ uses two ALSs and a common endpoint symbol z. XY-Wing uses three
ordered ALSs and different neighboring RCC symbols. ALS chains enumerate two
through six distinct sets, with different incoming/outgoing symbols at each
internal set. The complete endpoint OR is derived before target conflicts are
applied. This prevents a shorter route through an overlapping cell from
silently replacing the declared chain.

Doubly linked XZ has two explicit effect classes:

- A non-RCC symbol is locked in its own ALS. Its route contains both projections
  from that set, the other set's RCC-pair projection, and both RCC conflicts.
- An RCC symbol is locked in the union of its occurrences in both ALSs. Its
  route uses both sets' RCC-pair projections and the other RCC's conflict.

Both complete RCC certificates remain present for a double-RCC pattern. Each
effect records exactly which route establishes it. Targets may occur in the
other ALS when the complete proof supports their removal. The root-authored
fixtures explicitly exercise nonshared locked symbols and both locked RCCs.
This behavior follows the [HoDoKu ALS description](https://hodoku.sourceforge.net/en/tech_als.php).

Death Blossom splits on the complete current domain of one stem with two,
three or four candidates. Each branch has one proved petal projection, every
stem-to-petal conflict, every petal-to-target visibility premise, an explicit
assumption, and its own negative consequence. An actual `cases@1` node joins
the identical consequence after discharging every alternative. Petals can be
shared or overlap, but their identities, complete occurrences and individual
branch proofs remain explicit. No branch-local fact enters the global indexes.

## Admission and bounded search

The independent grammar reconstructs every declared set and pairwise overlap,
checks every RCC occurrence and local table source, and validates **every**
negative effect root. Its lineage follows only the selected conjunction
projection, so unrelated packaged clauses cannot provide required provenance.
All selected source roots must participate. Every Blossom root must be the
complete declared case tree, and each leaf must carry its own full branch
lineage. Generic primitive validity alone cannot authorize a named explanation.

C18 retains the matrix bound of two/three sets, each at most five cells. C19
allows up to six sets and at most 24 inference links; a simple six-set ALS path
uses six internal OR links plus five RCC links. Each Blossom petal has at most
five cells and the stem has at most four candidates. Bound violations remain
rejected even when a general primitive certificate is sound.

Search consumes the complete current `AlsIndex` and `ImplicationIndex`. ALS
occurrence groups retain up to five members directly; generic GroupIndex
three-member syntax is not used to truncate them. Both indexes must be
`completeFor(view)`. Merely valid recipes after a same-revision source-prefix
extension do not justify absence or search exhaustion. A new invocation rebuilds
for the exact immutable view; stale proposals and stale search sources reject.

C18 gives deterministic turns to XZ and XY enumeration. C19 services chain
enumeration and separate two-, three-, and four-candidate stem cursors. Chains
preserve increasing set count and canonical path order. Blossom filters petals
against each target before taking their Cartesian product: this removes only
combinations that cannot establish that target in every branch.

Cache construction/lookups, pair checks, path extensions, local assignments and
compiler steps yield charged work. Retained recipes, cache entries, Blossom
choice scratch, compiler records and published proposal lifetimes have workspace
leases. Index `ready` events transfer ownership before any checkpoint can throw.
All leases/cursors close on return, completion, cancellation or resource limits.
Consumers retaining a yielded proposal must reserve their own copy before
resuming its detector.

Only completed enumeration reports `exhausted`. Work, workspace, cancellation
and proof limits report explicit interruption. The bounded broad-search test
checks every emitted effect at a 100,000-work cap; it does not claim complete
enumeration or rediscovery of the exact six-set fixture within that budget.
The exact six-set geometry is checked through both independent and production
compilers. All four named families, overlapping XZ, both double-RCC effect
classes, and all three stem sizes have measured production discovery evidence.

## Independent acceptance and remaining integration

`C18.json` and `C19.json` contain 14 productive fixtures plus two sound but
out-of-profile fixtures. Their 16 original-clue records and all 18 opposite
assignments are checked with the unchanged independent Algorithm X oracle.
SHA-256 records bind each original clue/domain input. The construction witness
never supplies candidate axioms. Productive proofs replay from original clues
and declared rule maintenance.

The original root-authored overlap/double-RCC inputs and effects are preserved.
Additional independently interpreted T11 ALS and C11 XY seeds cover one- through
five-cell ALSs. Repository-owned constructions cover the six-set chain, stems
of sizes two/three/four, a shared five-cell petal, distinct overlapping petals,
a six-cell petal boundary and a five-candidate stem boundary.

`tests/unit/solver/als-acceptance.ts` independently interprets the JSON using
test-only primitive algebra and direct candidate domains. It imports no
production detector, compiler, index or named grammar at runtime. Negatives
include missing petals/occurrences/RCCs/overlaps, wrong stem/branch roots,
assumption escape, repeated/excess sets, incorrect double-RCC effect classes,
and standalone/mixed primitive-valid substitute roots.

T19/T20/T26 still own cumulative runtime accounting of the shared grammar/source
scans, resolution scratch, serialization and measured browser slices. The
checked APIs and cooperative loops do not by themselves establish browser
responsiveness. Registry integration is present; expanded runtime/application
availability still depends on the remaining M2 tasks.

Run from `web/`:

```text
npm test -- tests/unit/solver/als-patterns.test.ts
npm run typecheck
```
