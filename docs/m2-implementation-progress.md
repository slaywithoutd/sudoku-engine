# M2 implementation progress

Approved design/plan: `0e98c2b`, 2026-09-12. Authorization and coding conventions: D065/D066. Implementation branch: `feat/m2-engine`, isolated worktree `.worktrees/m2-engine`; initial base `f3eb4ac`. The complete expanded M2 release is not implemented yet.

## Baseline

- Dependencies installed from existing lockfile: 45 packages, audit reported zero vulnerabilities.
- Typecheck passed; 64 existing unit/storage/route tests passed; production build passed.
- Chromium baseline browser suite passed: 23 tests, 20.0 seconds. Existing environment-only FORCE_COLOR/NO_COLOR warning appeared; no test failed.

## Execution

| Task | Status | Evidence |
| --- | --- | --- |
| T01 Independent oracle and fixtures | Complete | `f01fa70`; 26 focused tests and typecheck passed; independent task review passed. |
| T02 Normalization and capabilities | Complete | `c0f93ca`, `8eb00d9`; 35 focused tests and typecheck passed; independent review and fix review passed. |
| T03 Proof roots and checking boundary | In progress | True clue/rule roots and independently checked inference contracts. |
| T04-T27 | Pending | Approved requirements remain in the implementation plan; no family dropped. |

## Coding conventions

Public operations and stateful services should explain their invariants in JSDoc. Algorithm comments explain the proof or reason for a constraint. Use cohesive objects for search sessions, rule registries, policies and application/worker lifecycles; strategy interfaces and factories express replaceable responsibilities. Prefer composition and readonly value records. Keep pure arithmetic and validation helpers simple. Tests remain independent of production discovery/checking where the plan requires independent evidence.

No application availability, broad technique support or runtime performance is claimed until its acceptance gates pass. Work/proof/time defaults remain benchmark proposals.

T01 uses an encapsulated set-based Algorithm X session and a separate plain-loop grid checker. Neither imports production engine logic. Empty-grid results are capped witnesses, not an exact count. Code documentation conventions: [architecture guide](solver/architecture.md).

T02 adds documented RuleRegistry/CapabilityAssembler and AllDifferentRule objects, strict complete semantic keys, isolated immutable snapshots and separate all-different/cover capabilities. Review regression tests preserve own `__proto__` JSON keys and reject unregistered primitive versions. Full suite before review hardening: 122 tests passed; post-fix focused suite: 35 tests passed. No logical technique is exposed by this foundation yet.
