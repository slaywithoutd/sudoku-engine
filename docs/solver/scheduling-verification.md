# T19 implementation evidence at the user-requested pause

Recorded 2026-09-14. Implementation `bcf48129e16eedde290bf3b250d9f0af966f6936` is committed, but **T19 has not passed independent review**. The user requested documentation and a stop while review was in progress. Three reproduced review issues remain unfixed; a fourth accounting concern is unresolved. See the [pause and resume handoff](../m2-resume-handoff.md) before continuing. This is a durable copy of the implementer report, preserving its test evidence and limitations; it is not a release approval.

---

# T19 implementation report

Base: `0bb376220148afa7c72917dfce0b177fe185344d`, branch `feat/m2-engine`.
Implementation commit: `bcf48129e16eedde290bf3b250d9f0af966f6936`
(`feat: schedule fair deterministic Explain and Analyze work`),34task-owned files.
Post-commit status contains only root's seven unstaged documentation edits.
Root provides the
independent review; this report is implementation evidence, not approval.

## Result and actual API

Implemented scheduler@1 selection with explain-fair@1, analyze-fair@1, fixed-scan@1
and event-fixed@1. Production registry admission is unchanged: actual original
rule jobs plus complete profile descriptors, max256. Original rules drain first;
256-unit service quanta and every-fourth oldest service remain independent of
browser task grouping. Explain finishes the current quantum; Analyze has max4
checked candidates/4096-unit windows. Unsound resource/missing-authority completion
claims are refused. Rollout remains opt-in, primary Analyze only.

Public APIs are implemented, not planned:

- work.ts: Budget, WorkHold, ReservableBudget, WorkClock, SCHEDULER_VERSION,
  QUANTUM, PolicyId, WorkLimit, WorkBudget, SchedulingOptions,
  schedulingOptions(input), canonicalOptionsKey(options).
- ledger.ts: JobKey, TechniqueJobs, ScheduledJob, compareJob, compareText,
  SchedulingLedger with jobs/ticket/active/complete/rows, job/service/status,
  simplerExhausted and advance.
- features.ts: canonicalProof, StepFeatures, stepFeatures, compareFeatures,
  featureWork. Authentic proof metadata drives scoring, never graph construction.
- policy.ts: SchedulerPolicy.next(ledger,view)/choose(checked), FairPolicy.
- select.ts: SelectionOptions, SelectionEvent, StepSelection constructor,
  view/ledger/options/usedWork, select(), advance(actualAcceptedSuccessor), dispose();
  selectStep one-shot generator.
- rollout.ts: RolloutShare, RolloutEvent, rolloutCandidates generator, returning
  first-candidate identity and metrics only.
- state/source-index.ts: SourcePreparationOptions, SourceWork, SourceIndex,
  prepareSources generator; read-only preparedSources(required capability),
  sourceMaximumId, matchingFacts, sourceFacts, uniqueSourceFacts. SourceIndex
  exposes complete/maximumId, assertActive, originalSources/matching/kind,
  conflictSource/scopePair and dispose; source, lease and mutation are private.
- proof/checker.ts: checkUsage(cursor): frozen {workUnits};
  checkedStepMatchesSource(step,view): boolean; checkedStepBytes(step). Existing
  checkProposal/verifyBranch remain generators; their identity is meter-registered.
- proof/types.ts: optional CheckContext.remainingWork:()=>number, narrowing only.
- candidates.ts: HypotheticalSession.fromChecked and acceptedStepChanges.
- grammar.ts: checkTechniqueGrammarSteps generator; optional accounting callback
  on checkTechniqueGrammar and its generator wrapper. coloring-grammar.ts:
  checkColoringPatternSteps, preserving synchronous compatibility wrapper.
  set-grammar.ts: optional accounting callback on checkSetPattern.
- primitives.ts/tables.ts: seedRetainedTable/seedRetained equivalent incremental
  retained-table preparation; no checking/candidate authority is issued by seeding.

Tracked guide `docs/solver/scheduling.md` describes API usage, exact formulas,
ownership, limitations and T20/T26 integration.

## Accounting and leases

WorkBudget has atomic finite spend and held capacity before allocation; settlement
consumes actual work once, releasing only unused capacity. Failure/closure does
not refund consumed work or undo service tickets. All emitted production work is
fully debited before another producer resumes; only service debt is divided into
256-unit tickets. Competing job regression verifies1200units remain spent after
768units of service, and a600unit competitor cannot reuse the pending debt.

Checker usage includes rejected and closed generators. A live narrowing callback
subtracts hidden ticks accumulated inside next() from available local/shared
credit; frozen checker caps still apply. Named source get/has/iteration charge
actual work via an immutable cutoff map facade, including repeated imported
projection ancestry. No helper catch in these named paths swallows resource
exceptions; exhausted named-source credit regression returns proof-work-limit.

Source preparation explicitly owns and accounts exact authentic prefix entries.
Before each16KiB codec capture, reserve65units, then settle
1+ceil(actualBytes/256); failed capture consumes65. Source-list sealing consumes
1+ceil(length/256), yielding per list. Pair/tuple inner loops yield/charge each
visit. Storage reserves scratch65536; each fact reserves
1024+4*bytes+128*rules+8*scopes; incidence128per entry. Complete/facts-only capability
distinction prevents falsely proving conflict absence. Two exact-view owners have
independent registration/storage; disposal in both capability orders is covered.

Retained prefix/root validation and table seeding are cooperative; per-node
ProofStage eliminates repeated entire-prefix Map copies and preserves earlier
stage visibility. Source lookup index entries are actual immutable owned facts,
preserving first-match order/conditional/open-scope policy. Compatibility fallback
remains for existing non-scheduler APIs; the scheduler asserts its live lease.

Scheduler metadata/proposal buffers reserve before construction; producer cursor
remains paused during checking. Closing/cancelling a generator, cutoff, throwing
checkpoint or disposal releases partial preparation/branch/order/checker leases.
All cursor cleanup is attempted even if one producer's return throws. Accepted
synchronization is prepaid before publication as
1+cells*(symbols+1)+sumJobs(2+dependencies.length). Feature cost is
2*nodes+4*effects+ceil(stepBytes/256)+1. Actual UTF-8 codec remains authoritative.

Confined factory validates exact token source identity, active primary origin,
imports, all source/node conditional taint and closed unconditional published
roots. Lexically open archived intermediates of authentic discharged C22 remain
scoped; branchAllowsFact/verifyBranch still control premise eligibility. Tokens
do not strongly retain a historical source ReadView per checked step.

Factory precharge is parentFacts+8*newNodes+16*cells+2 before validating/copying
changed data; branch maps share immutable prefix objects with bounded private
append layers. Subsequent publication prepays24*nodes+16*cells+2. Confined sessions
alone refuse assumptions, allow only C01-C05 checks and at most16 productive
publications. Existing ordinary forcing/net HypotheticalSession callers retain
their scope and branch-graph behavior. Preparation does not own the immutable
parent storage, and disposing it cannot revive/revoke a different live owner.

Rollout max4 candidates, max16subsequent cheap steps, min8192/floor10percent
remaining, equal floor shares and defaultoff are unchanged. Parent/order costs
are inside the allowance; there is no external setup credit. Shared immutable
storage avoids another full-prefix allocation. Each branch pays its own actual
validation and preparation; unused branch capacity is not transferred. Selected
first candidate is independently rechecked on the real current source.

Measured genuine normalizeClassic/all27rule fixture (two holes): final share
allowance8192, used8129, productive steps1, utility32, completefalse, reasonwork-limit.
Earlier conservative setup/copy implementation stopped at5838consumed with0steps
before an unaffordable operation. Before final source sealing accounting, the
productive version used8192 with1step and proof-work-limit; final measured8129
reflects refusal of a further held-capacity reservation. This is unit accounting,
not browser timing or a promise all four2048shares are productive. Temporary
console.info was removed; positive progression and unchanged primary assertions
remain in the permanent regression.

## Bounded synchronous sections and exact limitations

Internal checker node16KiB/header32KiB ceiling; the approved wire/prefix single
header/node gate remains16KiB in T21 (32KiB control packets are separate).
Codec arrays4096, object fields64, premise/scope arity64,
imports/roots1024; stepNodes/runNodes remain selected limits. One bounded record
capture or one bounded primitive/named record operation remains synchronous.
Source preparation, retained copying/seeding and coloring prefix loops yield.
No repeated complete retained-map copy per node or scheduled fact-scan fallback
remains in amended paths.

Generic named grammar prepays cells+4*allDifferentCellSlots+
nodes*(effects+4)+ceil(headerBytes/256), then actual source reads consume live
credit. C21 aligned enumeration prepays8*volume and meters each matching-leaf
probe plus actual ancestry reads. Its existing selected<=4Cartesian domain bound
is9^4=6561, NOT4096:4096 is the separate codec array cap. Classification can reach
6561 while a too-large wire certificate honestly rejects. Neither bound changed.
The unique1105guard is a conservative impossibility guard derived from1024proof
imports plus at most81current domain IDs; exact all-rule/given predicate, ordering,
and separately all current domain facts (including derived placements) are kept.
C33 existing full-source generator/operation tuple accounting remains unchanged.

Remaining finite named calls, byte serialization, list freezing and candidate
publication need browser duration measurement in T26. Live metering bounds work
and interrupts with resource diagnostics, but does not insert a browser task
boundary inside every named helper. No4/8ms responsiveness claim is made. Family
limits, primitive authority, rollout whitelist and canonical options did not gain
an optimizer/truth cache or a default budget relaxation.

## Verification

Commands run from `web/` with npm/Vitest; no unchanged all-family suite.

Final focused T19 command:
`npm test -- tests/unit/solver/scheduling.test.ts tests/unit/solver/rollout.test.ts`
30passed (21scheduling+9rollout),0failed,22.26s; final `npm run typecheck` passed.
Coverage includes100tickets/10zero-score jobs/40servicebound, slice1vs256 genuine
accepted proof identity, actual production rule priority, exact acceptance gate,
same-revision cold/event cache invalidation/no-op dedup, Analyze4candidate window,
disabledretry, interrupted coverage, work reservations, oversized shared debt,
metered named rejection, dual-capability source lifetime, immutable exact source
objects, earlier checker stage isolation, incremental tables, cancellation/closure,
forged/stale/same-label/conditional/revoked rollout, authentic C22 discharge and
genuine useful classic continuation.

`npm test -- tests/unit/solver/candidates.test.ts tests/unit/solver/proof-graph.test.ts tests/unit/solver/proof-roots.test.ts tests/unit/solver/unique-provenance.test.ts tests/unit/solver/unique-resources.test.ts`
123passed,0failed (102candidate/proof +21unique lifetime/resources),9.56s.

`npm test -- tests/unit/solver/set-arguments.test.ts -t 'rejects independent valid substitute|auxiliary empty matching|aligned classification visits all6561|both C20 spellings'`
5passed,96skipped,9.54s. The intentionally separate next command corrects the missing
space in that expression and exercises the explicit classifier bound:
`npm test -- tests/unit/solver/set-arguments.test.ts -t 'aligned classification visits all 6561'`
1passed,100skipped,13.95s.

`npm test -- tests/unit/solver/templates.test.ts -t 'operation tuple allowance survives|advance accepts only|unplaced singletons|original anchor omission|same-revision proof-prefix|authentic additional compatible'`
6passed,85skipped on the completed pre-final-meter run,22.13s. Final repeat
under concurrent test/typecheck load:5passed,1timeout,85skipped,78.24s total;
authentic additional compatible rule assembly took38.814s against its existing
30s harness allowance. Isolated unchanged-timeout rerun:
`npm test -- tests/unit/solver/templates.test.ts -t 'authentic additional compatible rule assembly compiles and replays C33'`
1passed,90skipped,15.01s total. All six affected cases therefore have final passing
evidence; no timeout allowance or implementation changed for the rerun.

`npm test -- tests/unit/solver/coloring.test.ts -t 'independent complete XOR evidence|requires complete edges'`
12passed,12skipped on the final repeat,42.59s.

`npm test -- tests/unit/solver/composition.test.ts -t 'table identity|certificate-only tables|projection|forg'`
5passed,19skipped on the final repeat,10.58s.

`git diff --check` passed after removing one extra EOF blank line; Git reports
expected LF-to-CRLF normalization notices, not whitespace errors.
Final covering cases total182passes across the selected suites/subsets (counting
the isolated C33 success once, not repeated earlier executions).

Development failures were resolved before final claims: invalid test helper/type
fixtures, Analyze fixture without prerequisite rule maintenance, ordinary rollout
zero continuation due conservative setup/copy accounting, and initial metered-map
subclass writing a property after its base froze the object. The latter was caught
by production/genuine-coloring tests and corrected using a private field. No
failure is being hidden by broad timeout changes or fixture weakening.

Recorded red/green evidence, without reconstructing missing historical output:

- `npm test -- tests/unit/solver/rollout.test.ts -t 'classic primary'`: authentic
  classic fixture initially failed the positive-continuation assertion (steps0,
  used5838 before the next unaffordable operation). This regression drove the
  actual-size reservation/facts-only preparation/immutable-prefix sharing work.
  The recorded productive isolated run then passed1test/7skipped in7.27s; after
  final sealing accounting it is included in the30-test green run above.
- `npm test -- tests/unit/solver/scheduling.test.ts -t 'production profile|prepared source'`:
 2failed/18skipped in11.54s after the initial metered-source integration: genuine
 coloring preamble returned malformed-proof and production selection lost its
 original rule proposal. Investigation found the inherited freeze/private-property
 assignment error. After the private-field correction the exact command passed
 2tests/18skipped in9.23s. This is a caught integration regression, not a claim
 that these already-existing tests were newly written in that cycle.
- `npm test -- tests/unit/solver/scheduling.test.ts -t 'competing service|live checker'`
 passed2/18skipped in7.12s after the accounting correction. Those diagnostics and
 the later named-source exhausted-credit test were added during integration;
 no unobserved failing-first output is claimed for them.

Earlier initial test-first cycles are not reconstructed from missing tool output.
The concrete red behavior above and final meaningful controls are the retained
evidence; no test suite was rerun with deliberately broken code to invent history.

## Exact file ownership and T20 handoff

Created6scheduling source files, state/source-index.ts,2test files and scheduling
guide. Approved integration edits: proof/{builder,checker,primitives,tables,types},
state/{candidates,events}, techniques/{chains-certificate,coloring-grammar,
csp-variables,fish-certificate,fish-grammar,fish,forcing-proof,grammar,
kraken-grammar,pattern-contracts,set-certificate,set-runtime,set-grammar,
subset-counting,types,unique-compiler,unique-grammar}. These are equivalent source
lookup changes or the explicitly approved ownership/accounting bridges. No
template implementation edit or fixture metadata change was needed.

Root's seven dirty README/decision/spec/uniqueness status documents are untouched
by staging. The ignored task report/brief are never force-added.

T20 must use canonicalOptionsKey and scheduler@1; reserve/charge initialization
before initialize; provide operation shared WorkBudget/IndexWorkspace/template
owner; consume selection work in browser tasks without double-charging; retain
StepSelection until exact receiver acceptance; fully drain select then advance
the actual immediate successor including proof-only bundles; keep bundle/revision
identity separate; preserve tuple allowances; cancel/dispose every operation;
re-evaluate missing unique readiness instead of treating disabled as exclusion.
T20 implements transport/phases and actual receiver protocol, not this task.
T26 measures bounded synchronous durations and tuning; no calibrated defaults or
response-time guarantee is claimed. Root performs independent review after commit.
