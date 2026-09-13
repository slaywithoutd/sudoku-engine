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
| T03 Proof roots and checking boundary | Complete | `4427544`, `40a2603`; 64 focused tests and typecheck passed; independent review and fix review passed. |
| T04 Candidate state and invalidation | Complete | `f7cf56f`; 203 tests and typecheck passed; independent task review passed. |
| T05 Proof composition and replay | Complete | `10c2a52`; 242 tests and typecheck passed; independent task review passed. |
| T06 Exact counting and quality | Complete | `27f856c`; 280 tests and typecheck passed; independent task review passed. |
| T07 Manifest and foundation techniques | Complete | `f072846`, `56cf5bf`; initial 391 tests, post-fix 113 focused tests and typecheck passed; independent review and fix review passed. |
| T08 Shared implication/group/ALS indexes | Complete | `6d44e97`; 423 tests before final query refinement, final 25 focused tests and typecheck passed; independent review passed. |
| T09 Short patterns and wings | Next | Independent original-clue seeds prepared; explicit discovery context and named proof compilation. |
| T10-T27 | Pending | Approved requirements remain in the implementation plan; no family dropped. |

## Coding conventions

Public operations and stateful services should explain their invariants in JSDoc. Algorithm comments explain the proof or reason for a constraint. Use cohesive objects for search sessions, rule registries, policies and application/worker lifecycles; strategy interfaces and factories express replaceable responsibilities. Prefer composition and readonly value records. Keep pure arithmetic and validation helpers simple. Tests remain independent of production discovery/checking where the plan requires independent evidence.

No application availability, broad technique support or runtime performance is claimed until its acceptance gates pass. Work/proof/time defaults remain benchmark proposals.

T01 uses an encapsulated set-based Algorithm X session and a separate plain-loop grid checker. Neither imports production engine logic. Empty-grid results are capped witnesses, not an exact count. Code documentation conventions: [architecture guide](solver/architecture.md).

T02 adds documented RuleRegistry/CapabilityAssembler and AllDifferentRule objects, strict complete semantic keys, isolated immutable snapshots and separate all-different/cover capabilities. Review regression tests preserve own `__proto__` JSON keys and reject unregistered primitive versions. Full suite before review hardening: 122 tests passed; post-fix focused suite: 35 tests passed. No logical technique is exposed by this foundation yet.

T03 adds PrimitiveRegistry/ProofChecker, authentic immutable roots and proof-only checked certificates. Regression checks cover retained-premise substitution, M2 preflight bounds, UTF-8 accounting and cooperative node staging. Full suite before review fixes: 161 tests passed; post-fix focused suite: 64 tests passed. No effectful deduction is accepted by the T03 boundary yet. D067 records the resulting implementation refinements; timing targets remain unmeasured.

T04 adds CandidateOwner/CandidateIndexes, exact checked domain facts, atomic effects and cold/incremental support checks. Diagnostics remain separate from count evidence; newly exposed singles stay unresolved. A real 4,097-node proof verifies larger configured step limits. T07 must migrate internal placement certificates to named grammar; T19/T20 must reserve initialization work/workspace before synchronous initialization.

T05 adds scoped proof composition, complete finite table DAGs, incidence counts, mixed-rule acceptance and original-clue replay. Its 39 focused tests include a 6,561-row table, incomplete/forged proofs and cumulative replay budgets. The complete suite passed 242 tests. Independent review found no blocking issue; Git line-ending notices and an occasional Vitest caching recommendation are informational tooling noise. D068 records representation bounds; named family grammars, exact counting and runtime operation accounting remain later gates.

T06 adds original-clue MRV exact enumeration, local evidence authority, private accepted-path lineage and explicit primary-operation quality gating. All 38 focused tests and the full 280-test suite passed; independent review found no blocking issue. The second-witness/forged-view regression checks lineage rejection; an isolated authentic-domain compatibility fault test remains a T25 defense-in-depth follow-up. Exact setup and synchronous evidence validation require T20/T23 resource accounting and T26 measurement.

T07 records all 38 rows and independently verifies C01-C05 using 61 fixture records, 19 alias replays and 133 certificate mutations. Review reproduced a getter/proxy view-substitution bypass; the fix authenticates exact published views and preserves trusted cold rebuilds. It also repairs catalogue UTF-8 and removes argument-spread failure at the supported 262,144 retained-key bound. The post-fix 113 focused tests passed; the earlier full 391-test result belongs to the original implementation commit. D070/D071 document naming and certificate authority. Expanded profile readiness remains blocked until later family gates pass; no timing/default validation is claimed.

T08 adds shared budget leases, exact proved-source recipes, complete implication/group/ALS enumeration and resumable RCC queries. The checked local all-different subset primitive preserves proof metadata without creating a cover. Independent review found no blocking issue; a relation-conflict certificate-expansion regression is explicitly carried to T09 (its truth is already independently checked). D072 records index ownership and overlap rules; D073 supplies the next task's discovery-context integration. No advanced named detector is claimed by the indexes.
