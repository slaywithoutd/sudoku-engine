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
