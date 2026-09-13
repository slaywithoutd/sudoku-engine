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
