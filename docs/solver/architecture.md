# Engine architecture and coding guide

M2 implementation follows the approved [engine contracts](../superpowers/specs/2026-09-12-m2-engine-contracts.md) and [implementation plan](../superpowers/plans/2026-09-12-m2-classic-solver.md). This guide records the object-oriented approach requested under D066; consult [progress](../m2-implementation-progress.md) for what currently exists.

## Responsibility and pattern choices

| Responsibility | Appropriate structure | Reason |
| --- | --- | --- |
| One exact/oracle enumeration | A search-session object with private frontier/counters and immutable input | Keeps mutable search bookkeeping out of callers; each operation owns its own limits and evidence. |
| Rule semantics | Strategy interface implemented by a class per versioned rule | Checking, normalization and capabilities stay with the semantics that justify them. |
| Capability assembly | Registry plus factory/assembler | Reject incompatible or unknown versions before any full-puzzle claim; combine shared capabilities rather than independent solvers. |
| Technique discovery | Strategy descriptors with resumable iterators | Family-specific recognition changes without changing checking or scheduling. |
| Checked proof and candidates | Immutable value records, checker service, atomic state owner | Proposed effects cannot mutate shared truth before all premises are checked. |
| Scheduling | Replaceable policy strategies with a fairness ledger | Computation priority is separate from correctness and from the selected proven step. |
| Worker/controller | Objects owning one request lifecycle and explicit state transitions | Cancellation, late messages, credits and accepted revisions have one authority. |
| Screen updates | Existing subscription/observer style | Plain TypeScript views consume state/actions without importing solver internals. |

Use composition over inheritance. Do not build a class for each digit, mask, literal or array operation. Function entry points from the approved contracts can delegate to cohesive objects; retain pure functions for canonical serialization, mask arithmetic and independent grid checking. No service locator, DI framework or artificial inheritance chain is needed.

## Documentation that belongs next to code

Public types/methods document input restrictions, ownership, output meaning, side effects and failure behavior. Search code explains why an exhausted root differs from finding one solution or reaching a limit. Proof code states the precise inference and scope/assumption rules. A rule capability explains its premise: all-different alone does not imply every symbol must appear in a small scope. Transport code explains why ACK returns buffer credit while accepted commits the whole deduction.

Comments should explain the mathematical or lifecycle reason for a step, not narrate assignments and loops. Keep long family proofs and fixture provenance in the associated technique Markdown; link to them from the detector/checker. Keep examples honest: an algorithm supported in the design is not implemented until its code and acceptance evidence exist.

## Dependency constraints

Production engine code cannot import views, persistence, play state or test fixtures. Independent test oracles cannot import production topology, candidate helpers, detectors, proof checking or exact enumeration. Rule/discovery code can propose effects; only the checker/reducer boundary applies them. The exact verifier starts from original normalized rules and clues, never the human-pruned candidate state. Each speculative/conditional branch has separate mutable ownership.

Shared resource-limit values live in `solver/limits.ts` so proof checking, scheduling and transport can use one contract without importing each other’s implementations. The proof layer owns assumption policy. During foundation implementation, elementary inference checks needed by candidate-state tests move forward from T05 into T04; those tests must use authentic checker output. No public test bypass can mint accepted steps.

Proof staging must be resumable at bounded node boundaries: a finite total-byte limit alone does not make a long synchronous graph copy responsive. Header/control and per-node bounds are distinct. Functional tests establish yields and mutation isolation; T26 measures scheduling responsiveness and the proposed slice targets.

An authenticated proof node must retain the identity of the premises actually checked. Matching numeric IDs and problem/branch/revision fields alone cannot authenticate a prefix: two separately checked proposals can allocate the same IDs to different facts. Wire nodes are rechecked, and retained in-memory nodes must match their checked premise bindings.

The root preflight bounds synchronous initialization before canonical traversal: at most 81 cells, nine symbols, 256 declared rules, 256 all-different capabilities, 2,304 covers and 2,978 original/capability roots; scopes contain at most 81 cells. The active profile must also enforce the stricter combined limit of 256 rule and technique jobs. These are structural bounds, not benchmarked time/proof defaults or custom-size product support. Finite test-only relation roots use the same bounded authority boundary; production M2 registers classic all-different only.

CandidateOwner publishes immutable revisions and retains exact accepted proof objects. Initial given literals explicitly justify singleton domains; every later changed domain points to a checked domain proposition. CandidateIndexes owns exhaustive supports and rebuilds affected entries; cold rebuilding is the correctness baseline. Empty domains, missing covers and duplicates are state diagnostics, never independent count evidence.

The proof algebra separates scope handling, finite tables and incidence counting into dedicated checker responsibilities. Assumptions are lexical; discharge removes only its named hypothesis, and uniqueness dependencies remain conditional. Table definitions retain exact producing-node identity and complete input coverage; their counts never substitute for their rows. See D068 for bounded leaf/union representation and the explicitly unsupported general table-to-table projection.

Effect-free `retainCheckedFacts` authenticates and expands a proof prefix without advancing the candidate revision. It is useful for reusable checked relations, but consumes retained proof/workspace budget and needs deterministic deduplication plus a separate transport bundle sequence. It cannot be counted as productive candidate progress or bypass named technique grammar.

Replay rechecks original-clue bundles without detector enumeration. `initializationReservation` describes and reserves root/index construction before synchronous initialization; it reports deterministic conservative accounted work/workspace, not measured heap usage. `checkedHeaderBytes` and `checkedWorkUnits` read authentic checker accounting so callers include retained bundle headers and non-yield bookkeeping in cumulative limits. Runtime schedulers and transport must use these boundaries; functional proof tests do not calibrate performance defaults.

ExactSearchSession owns a separate original-clue MRV frontier. It validates every complete assignment and separates cap-reached from root exhaustion; iterator close supplies no completeness claim. Reserve `exactInitializationReservation` before constructing the iterator, then charge its first setup event once. This finite synchronous setup isolates input immediately; its timing and conservative memory estimate require browser measurement.

Candidate ownership also maintains lightweight accepted-step lineage: proof checking alone does not mean a step was committed. `isAcceptedPath` validates the original-root anchor and exact accepted sequence without retaining every historical full view. QualityContext binds this lineage, the original module instances and the actual RunKey. Evidence merging admits process exhaustion only during the matching active primary exact phase, preserves valid witnesses through inconsistent claims and issues local immutable count authority. Controllers must store returned count/human state and diagnostics together.


The technique catalogue separates declared scope from independently verified implementation. `getTechniques` selects all 33 primary rows or all 38 rows for conditional analysis; `profileReadiness` and `assembleTechniqueJobs` prevent a partially implemented profile from masquerading as a completed search. Unavailable families are neither logically excluded nor exhausted. The C01-C05 strategy classes use a shared untrusted `CertificateBuilder`; the closed named grammar checks geometry, aliases, bounds and the complete newly computed proof independently of discovery.

`verifyCertificate` and `CertificateSession` support non-applying mathematical verification with a separate opaque `CheckedCertificate`. This authority cannot enter candidate commits, production retained contexts, replay or quality. Production `checkProposal` first authenticates the exact published view identity, then requires both named grammar and primitive validity to issue `CheckedStep`. The checker/candidate ownership query and trusted cold-rebuild adapter create function-only module cycles: no module may invoke a cross-cycle function during initialization. `rebuildOwnedIndexes` authenticates its source before constructing and publishing the rebuilt support view; callers cannot supply a registration callback or substitute state. Keep admission selection in the unexported verification closure; TypeScript-private methods alone are not a runtime authority boundary.

Rule maintenance removes candidates through explicit weak-link, resolution and exact-domain proofs. It never silently places a singleton. Named singles may retain a bounded positive cache without advancing candidate revision; duplicate caches and arbitrary table/forcing bundles are rejected. Future indexes carry state-bound premises and proof recipes, whose use must still pass named checking. Candidate revision and accepted proof-prefix identity remain separate integration concerns.


Shared implication, group and ALS indexes use `IndexWorkspace` leases across the operation. The builders reserve retained records, lookup partitions and scratch before use; incomplete iteration releases its lease, and a completed index owns it until disposal. Borrowed entries cannot outlive that ownership. `strong`/`weak` use retained lookup sets, and RCC queries expose a resumable cursor so source/tuple scans do not hide long synchronous work. The convenience RCC drain requires an explicit work-charge callback. Cancellation and allocation failure are incomplete outcomes, never negative logical answers.

An index entry carries exact premise facts and a bounded reconstruction recipe, including inherited conditionality. It can consume closed accepted derived covers/relations/scopes as well as original rules. `acceptsView` validates reuse; different prefixes require explicit charged checking or conservative refusal. `completeFor` requires the exact source fact publication and guards absence/exhaustion claims, even at unchanged candidate revision. Generic group membership remains syntax; named classic patterns must enforce the declared house-intersection geometry. RCC permits overlapping cells without the tested symbol when every tested occurrence conflicts, while a shared occurrence of that symbol invalidates RCC. The later ALS deduction still needs its own complete proof.
