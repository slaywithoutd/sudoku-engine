# M2 implementation: pause and resume handoff

Recorded 2026-09-14 at the user's explicit request to document completed and outstanding work and stop. **Activities are paused. Do not resume implementation or review until the user asks.** The running T19 reviewer was interrupted; the implementer had already completed its turn. No fixes were started after the stop request. Only documentation was completed afterward.

## Workspace and preserved work

- Implementation: `.worktrees/m2-engine`, branch `feat/m2-engine`.
- Latest implementation commit: `bcf48129e16eedde290bf3b250d9f0af966f6936` (T19, 34 task-owned files).
- T19 review range: `0bb376220148afa7c72917dfce0b177fe185344d..bcf48129e16eedde290bf3b250d9f0af966f6936`.
- Original checkout remains on `docs/m2-solver-design` at `f3eb4ac`, clean when inspected. Research `24e0d25`, approved design `0e98c2b`, and newer M1/application/theme work are preserved.
- No merge, push, deployment, solver UI release or application persistence change was performed.
- The paused implementation workspace and ignored working records were preserved. Do not clean or delete them while this work is incomplete. No task-owned test process remained at the stop audit; the unrelated pre-existing Node process was left untouched.

## Resume update: T19 review completed

The three communicated T19 findings were reproduced with regression tests and
fixed in the follow-up commit. The HypotheticalSession work-meter concern was
reviewed against rollout prepayment and actual checker deltas and was not
classified as an undercount. See [scheduling verification](solver/scheduling-verification.md#independent-t19-follow-up-review).

The [implementation progress record](m2-implementation-progress.md) contains task-by-task commits and verification from T01 onward. The [approved 27-task plan](superpowers/plans/2026-09-12-m2-classic-solver.md) remains the complete implementation scope; this handoff does not replace or reduce it.

## Completed and implemented work

T01-T18 have passed their independent task reviews and required fix reviews. They cover independent original-clue fixtures/oracles, normalization/capability assembly, authentic proof roots and primitive checking, shared candidates/facts, scoped proof DAGs and replay, independent exact counting/quality, shared implication/group/ALS indexes, all bounded C01-C33 techniques, and the separate U01-U05 conditional families. The [technique matrix](superpowers/specs/2026-09-12-m2-technique-coverage.md) gives exact aliases, bounds and acceptance evidence. None of this implies universal technique completeness or finished browser integration.

Recent completed work:

| Change | Commit/evidence | State |
| --- | --- | --- |
| Conditional uniqueness implementation | `a2f7a53`, native bootstrap claim fix `5a19be1`, documentation `59bb3fb` | T18 reviewed and complete. |
| Generalized catalogue closure | `18c103c` | Eight missing per-alias negative/boundary evidence cells closed; independent review passed. |
| Catalogue status promotion | `0bb3762` | All 38 rows independently verified; actual primary/conditional job assembly enabled without bypassing the readiness gate. |
| Scheduler, selection and confined rollout | `bcf4812` + follow-up | T19 review findings fixed and independently rechecked; follow-up commit is the T19 completion point. |

T19 adds documented `WorkBudget`/holds, `SchedulingLedger`, `FairPolicy`, `StepSelection`, canonical option identity, Explain/Analyze ordering, fixed-scan/event-fixed baselines, and isolated bounded rollout. It also adds explicit owned source preparation, exact source tokens, checker usage for rejected/closed checks, immutable stage views, incremental table seeding, and equivalent indexed accesses in affected technique code. User-requested OOP/pattern usage is reflected in stateful owners, registries, policies and factories; pure value/math functions remain simple.

Read the [scheduler guide](solver/scheduling.md) for concrete APIs and resource ownership, and the [complete T19 implementation evidence](solver/scheduling-verification.md) for exact files, formulas, commands, durations, red/integration evidence and limitations. These documents describe committed code; their existence is not independent approval.

## T19 review findings at interruption

The reviewer read the complete 34-file diff and ran focused read-only Vite probes. It had **not written a final review report or issued final spec/quality verdicts** when interrupted. The following three reproductions were communicated and are now fixed in the follow-up commit; exact evidence is in the scheduling verification record:

| Finding | Committed location | Reproduction and consequence |
| --- | --- | --- |
| Lost exclusion dependency | `web/src/solver/scheduling/ledger.ts:45` (`advance`, particularly line 48) | A carried terminal exclusion with an actual graph watch is overwritten with the descriptor's default cell watch. A later graph change then leaves the exclusion active. Preserve the complete event-supplied dependencies when retaining a terminal result. |
| Analyze window overrun | `web/src/solver/scheduling/select.ts:160` | A 46-unit authentic C01 job followed by a 4,096-unit competitor services 4,142 units before checked-step selection. The window boundary is checked only after a whole quantum. Enforce the approved 4,096-unit selection window without changing deterministic work/service accounting. |
| Cache-only candidate sent to rollout | `web/src/solver/scheduling/select.ts:170`, `rollout.ts:40`, `state/candidates.ts:213` | A valid effect-free C01 cache with Analyze and rollout enabled throws `unproductive-step`. Keep legitimate proof-only acceptance working while restricting rollout to productive first deductions; do not remove supported cache work or silently disable Analyze. |

A **fourth concern remains unclassified**: closing `HypotheticalSession.check` on its fourth public work event showed four public units versus five underlying `verifyBranch` units. However, rollout already prepays `1 + nodes + imports`; the reviewer was checking whether that covers the gap. Do not label this a confirmed undercharge until comparing total prepaid and actual work. Relevant boundaries are `state/candidates.ts:260` and `scheduling/rollout.ts`. No accounting fix was attempted.

The reviewer also mentioned assessing remaining source-list scan accounting, but communicated no final finding. Preserve that as unfinished review work, not a proven defect.

The interrupted review was resumed, the three findings were fixed with covering
regressions, and the scoped re-review passed. T19 is complete; T20 is the next
task in the approved sequence.

## Verification and honest limits

T19 has 182 distinct focused passing cases across the final covering runs: 30 scheduler/rollout; 123 candidate/proof/conditional ownership; six selected set/Cartesian-bound controls; six template controls; 12 coloring; five composition. Typecheck and staged whitespace checks passed. Exact commands and durations are preserved in [the evidence record](solver/scheduling-verification.md).

The final concurrent template subset had five passes and one 30-second harness timeout: the authentic mixed-rule C33 case took 38.814 seconds. The same case passed alone with the unchanged timeout in 15.01 seconds total. Both outcomes remain recorded; this is not an entirely green concurrent run and no production/test limit was relaxed for that retry.

An authentic 27-rule classic two-hole rollout produced one checked cheap continuation, using 8,129 of 8,192 units with utility 32, then honestly stopped incomplete with `work-limit`. The prior conservative setup/copy model produced zero continuations. This proves some useful bounded continuation, not a speed advantage, complete rollout, or a guarantee that four equal 2,048-unit shares are useful. Rollout remains off by default.

The earlier complete T18 broad run recorded 1,656 passes and **33 harness timeouts** across 52 files. Focused later passes do not erase that result. The last historical wholly green broad run belongs to an earlier revision, not the current branch. Final whole-suite, real-browser, production-worker, isolation and benchmark acceptance remain outstanding. Proposed time/work/proof/memory limits, score weights, 70% phase share and 4/8 ms slice targets remain unvalidated performance choices.

Only document/reference/whitespace checks were performed after the user's stop request. No new solver tests, investigation or implementation were started afterward.

## Documentation and technical decisions recorded

Current specifications now explicitly recognize implementation approval under D065/D066; stale current-tense statements waiting for approval were removed while historical decision entries retain their context. README, progress, roadmap and the bounded matrix distinguish reviewed technique coverage from unfinished runtime/UI work.

D094 records `RunKey.scheduler = scheduler@1` separately from the versioned selected policy in canonical `optionsKey`. A conditional run may choose a different mode/policy while retaining its exact primary parent identity.

D095 records the technical changes required by scheduler integration: exact publication tokens without retaining every old view; confined adoption of actual checked primary deductions; archived discharged scopes remain scoped; complete/facts-only owned source preparation and independent lease disposal; reserve-before-capture with actual-size settlement; complete work charging distinct from service debt; narrowing-only checker credit; metered named source reads; incremental retained-prefix/table preparation; and unchanged finite proof/family/rollout bounds. T19 follow-up conformance is recorded in the scheduling verification section. Wrong accounting or ownership choices require code/test rework; they do not justify relaxing correctness or silently reducing technique coverage.

Additional handoff clarifications preserve existing requirements: selecting/moving a cell stays accessible during a run while value edits are locked; missing uniqueness authority is disabled, not exhausted/excluded; internal checker headers may be 32 KiB but wire/prefix individual header/node records remain 16 KiB, with 32 KiB control packets separately bounded.

## Remaining implementation tasks

| Task | Required work still outstanding | Main planned files/gates |
| --- | --- | --- |
| T19 completion | Completed: repair confirmed findings, covering tests and scoped review. | Scheduler verification follow-up section and follow-up commit. |
| T20 | Human loop, original-clue initialization, exact phase, acceptance waits, honest fallback and separate conditional runtime. | `web/src/solver/human.ts`, `run.ts`, evidence integration, human/run unit tests. |
| T21 | Strict protocol-2 codec, bounded proof/prefix streaming, two-chunk backpressure, atomic proof acceptance and stop-human barrier. | `web/src/solver/transport/{protocol,codec,sender,receiver}.ts`, protocol/transport tests. |
| T22 | Actual Vite worker, transferable authority port, error/watchdog lifecycle, separate worker typecheck and real-browser harness. | `web/src/workers/solver.worker.ts`, `web/src/app/solver-worker.ts`, worker TS config, worker browser tests. |
| T23 | One volatile application-lifetime controller, isolated input/source copies, cancellation identities, route and atomic Save Clues. | `web/src/app/solver-controller.ts`, application/router integration, controller/route tests. |
| T24 | English Explain/Analyze screen, safe accessible proof graph and coverage, separate count/conditional result, preserved themes and input behavior. | `web/src/ui/solver*.ts`, application/styles/copy integration, screen browser tests. |
| T25 | Integrated differential/coverage gates, durable fixture evidence, pending small fixes, production-browser races and persistence isolation; resolve full-suite failures. | Differential/release tests, production Playwright configuration, isolation/race suites. |
| T26 | Calibration/held-out corpus, scheduling/rollout/phase ablations, correctness-preserving timing/work/proof/heap measurements and justified defaults. | Benchmark corpus/config/suite and `docs/m2-solver-benchmarks.md`. |
| T27 | Final requirement audit, all required verification, documentation and broad independent branch review. | `docs/m2-solver-verification.md`, README/roadmap/decisions/manifest updates. No automatic merge/push/deploy. |

All approved families remain required. Gameplay hints, implemented variants, construction assistance, community and AI remain outside M2. The completed first-release interview stays closed; no new product question currently blocks resumption.

## Concrete downstream integration notes

T20 must use the existing canonical options encoder and keep one `StepSelection`/`TemplateOperationContext` per operation. Selection work events have **already charged** a supplied shared budget; do not debit them again. Fully drain selection and await actual receiver acceptance before `advance(actualImmediateSuccessor)`, including proof-only bundles at unchanged candidate revision. Prepaid synchronization does not replace separate actual receiver validation costs.

Startup, copying, checking, bootstrap replay and acceptance waits consume the original total/phase allowances. The T19 internal phase timer is relative to selection construction; T20 needs a tighter absolute phase deadline and prior-consumption-aware budget from click/startup. Do not encode measured startup delay as a new user option. Worker `remainingMs` must subtract send/start delay using local deadlines rather than comparing main/worker clock origins. Startup may exhaust the human share while leaving exact time; that requires an honest phase transition, not a refreshed human allowance.

Exact counting starts only from original clues/rules, with fresh enumeration and independently checked witnesses. One witness is not uniqueness. Perfect needs actual accepted unconditional original-clue lineage, independent uniqueness, initially incomplete input and no fallback. Conditional evidence never qualifies. Reserve initialization, evidence/quality validation, retained headers, copies and transport storage before allocation; count failed/closed work.

Protocol ACK means safe staging, not deduction acceptance. Preserve complete RunKey, sequence and bundle identities. Ordered `accepted(stepId,revision)` before `stop-human` resolves proof-only acceptance even if revision did not change; inspect the whole ordered state machine before adding fields. No pending/staged fact becomes authority. Cancel invalidates identity first and requires no ACK.

Conditional bootstrap uses an explicitly installed transferred native MessagePort, actual accepted parent authority, one-use claim, bounded SHA256 prefix identity and complete rechecked primary prefix. Ordinary data frames, witness digits or copied WeakMap brands cannot grant authority. Prefix descriptor bytes, hash framing and wire framing are separate counters. Constructor/hash/replay/check work belongs to the same new operation. Conditional Cancel/rerun preserves primary eligibility; parent replacement/input change/quarantine revokes children. Saved conditional replay stays bound to the same exact run/branch; a new run replays the primary prefix afresh.

The solver service must not depend on the persistent library repository. Source copying reads draft values or immutable puzzle givens directly, never mounts the player (which writes play state). Save Clues uses one atomic library-controller transform building a new draft; preserve its existing in-memory/save/flush/retry behavior. Navigation cancels the active solver run and unsubscribes the screen while retaining the temporary workspace; application disposal terminates the service. Selection alone does not clear results or alter request identity.

## T25 follow-ups already identified

1. Correct T10 boundary-positive provenance references and negative filtering metadata.
2. Replace purported out-of-profile fish seeds whose actual geometry only has seven houses or whose fifth fin is not a candidate; use genuine size/fin violations with independent SAT/zero controls.
3. Correct the C21 manifest description that says both C20 spellings.
4. Improve the previously deferred candidates/nets-runtime formatting without changing semantics.
5. Reconcile C28 `maxSetSize` descriptor 0 versus registry projection 4, if still present after scheduler fixes; preserve actual OR/group support.
6. Add the genuine causal braid-to-Whips relabel rejection using existing C27-braid-causal, preserving its whole sound primitive proof and changing row/technique/grammar/alias consistently. Seven positions are causal; positions four and six use non-predecessor right sources.
7. Complete the authentic domain-compatibility fault defense and final cross-family/browser combinations. Actual C32-to-C28 and conditional C28/C33 engine integrations already exist; do not redo them as missing.
8. Make fixture provenance reproducible without ignored scripts. Ten tracked containers still mention `.superpowers`: C18, U01-U05, unique-link-bound, unique-case-link-bound, unique-conditional-or and unique-conditional-templates. Distinguish historical authorship from current durable test/tool commands; retain real hashes/history and existing T16 consumer-opposite commands. Do not delete scratch provenance before durable reproduction is supplied.

## Benchmark preparation already done, not measurements

Read-only original-clue accounting on C01-one-hole found 458 estimator units plus 223,841 initialization work, 458 root nodes, 71,676 proof bytes and 96,056 workspace bytes; exact setup estimated 178,861 work and 4,480,872 workspace bytes. These values only show that one setup fits the proposed accounting reserve, not measured enumeration/latency or validated defaults. Recompute against final runtime accounting.

The latest static corpus inventory found 331 cases, 178 exact original clue strings and 152 limited D4-plus-digit groups; six added T18 integration/boundary records add no new originals over the preceding inventory. This is not complete Sudoku-isomorphism classification or benchmark performance. Regenerate after final fixture changes and prevent duplicate/source-related clues crossing calibration/held-out partitions. Prepared benchmark seeds 26091401-04 assign odd seeds to calibration and even seeds to held-out before measurement. Final T26 still owns corpus adoption, labels and all trials.

## Local recovery records

The ignored plan workspace `.superpowers/sdd/2026-09-12-m2-classic-solver/` is preserved. It contains `progress.md`, current task-19 through task-27 briefs, the complete T19 report and lossless review package, prior task reports/reviews and preflight scripts/seed records. T19's review file does not exist because review was interrupted before writing it. Root recorded the communicated findings above so resumption does not depend on live agent memory.

The original implementer is `/root/t19_scheduling`; the interrupted reviewer is `/root/review_t19`. These are recovery references, not running tasks. Historical brief versions are archived alongside current briefs. If agent handles are unavailable later, use the committed evidence, exact review range and this handoff to recreate only the unfinished review/fix work. Do not reimplement T01-T18 or reopen their resolved findings without new evidence.
