# Deterministic scheduling

T19 supplies selection and confined rollout. Worker phases, transport, receiver
acceptance, browser task slicing and UI orchestration remain T20 onward.
The source is under `web/src/solver/scheduling/`.

## Identity and policy

`SCHEDULER_VERSION` is `scheduler@1`. `schedulingOptions()` freezes mode, policy,
profile, rollout, limits, phaseWorkUnits and phaseTimeMs; `canonicalOptionsKey()`
encodes these fields with recursively sorted object keys. T20/T23 must use this
encoder for RunKey.optionsKey and put the implementation version in RunKey.scheduler.
Clocks, workspaces and browser slice lengths are operation resources, not options.

The defaults are Explain, `explain-fair@1`, `classic-expanded@1`, rollout off and
phase caps equal to the supplied run caps. Analyze selects `analyze-fair@1`.
`fixed-scan@1` and `event-fixed@1` are canonical scan baselines; the former restarts
all records after acceptance and the latter preserves sound exhausted/excluded
watches. Registry input is the result of `assembleTechniqueJobs(assembly,profile)`.
It admits actual original rules and the complete profile, at most 256 combined
jobs. A job owns one resumable cursor, not one cursor per combinatorial scope.

`FairPolicy` implements `SchedulerPolicy.next(ledger,view)` and `choose(checked)`.
It drains original rules first. Explain considers the lowest active tier and
finishes its 256-unit service quantum before selection. Analyze collects at most
four checked candidates in a 4,096-unit window. Every fourth fair quantum serves
the least recently serviced eligible job; ties use tier, technique and scope key.
Other quanta rank integer hit × gain / cost, each factor clamped to 1…1,024.
Zero estimates do not exclude a job. Exclusions require a reason and dependencies;
disabled or interrupted work is never complete coverage.

`stepFeatures()` uses only authenticated proof/effects and current domains.
Analyze utility is 16 × placements + removals + 8 × newly created unplaced singles.
Complexity compares assumption depth, assumption count, link count, then node
count. Explain compares tier then complexity; Analyze compares utility, complexity
then tier. Remaining ties compare technique, canonical effects and canonical proof.
These weights, priorities and defaults are engineering hypotheses, not calibrated
performance claims.

## Selection ownership and acceptance

`new StepSelection(view,registry,options)` requires an authentic publication.
`SelectionOptions` adds workspace, optional clock, shared WorkBudget,
TemplateOperationContext and UniqueAuthority to the normalized logical options.
The owner exposes `view`, `ledger`, `options`, `usedWork`, `select()`,
`advance(nextView)` and idempotent `dispose()`.

`select()` yields work, checked-step, or logical-stop events. A checked-step carries
the authentic step, a monotonically increasing bundleId, budgetLimited and
canClaimSimplerExhausted. A logical-stop carries complete, reason and ledger rows.
Fully drain the generator before advancing. It is an error to start another
selection while a bundle awaits acceptance. Early generator closure disposes the
selection and every source, producer, checker and buffered-proposal lease.

Only the receiver may accept a selected bundle. After actual acceptance, pass the
exact immediate successor from `commitChecked` or `retainCheckedFacts` to
`advance()`. `acceptedStepChanges(before,after,step)` authenticates owner lineage
and the exact accepted step. Same-label siblings, unchanged views and unrelated
successors fail. Proof-only acceptance changes source/graph/cover/relation watches
even at the same candidate revision. Equivalent closed cache consequences are
deduplicated; partial or open facts do not become reusable closed caches.

One TemplateOperationContext survives the operation. Accepted-lineage advance is
prepaid before the selected event, and preserves its 100,000-tuple allowance
across same-revision source additions. Rollout never advances it. `selectStep()`
is a one-shot helper which disposes its owner; workers that continue after
acceptance must keep a StepSelection instance.

## Work and storage accounting

`Budget` has spend(units):boolean and remaining():number. `WorkBudget` also has
charge(units), used and reserve(maximum). A WorkHold excludes its maximum from
available credit before allocation, settles actual consumed work exactly once,
and releases only unused held capacity. Disposal cannot refund consumed work.
Invalid units, overspend and double settlement fail. `WorkLimit.reason` identifies
an honest cutoff. Shared and phase credit are both required.

Production event cost is debited in full before further producer advancement.
Only service debt is split across deterministic 256-unit quanta. Another job
cannot spend credit belonging to a partly serviced large event. Work events are
progress/slicing boundaries: **T20 must not charge them again** when supplying the
shared budget. Ledger work records service; usedWork records consumed operation
work, including setup and debt not yet serviced at interruption.

`checkUsage(cursor)` returns a frozen cumulative workUnits snapshot for
checkProposal/verifyBranch, including rejection and early closure.
`checkedWorkUnits(step)`, `checkedHeaderBytes(step)` and `checkedStepBytes(step)`
remain authentic-success lookups. The last includes the actual UTF-8 header and
node codec size. `CheckContext.remainingWork?:()=>number` only narrows the frozen
checker limit. The scheduler subtracts hidden ticks from uncharged work inside the
current next() call and also respects the shared budget. Resource failures remain
proof-work-limit/proof-time-limit diagnostics, never semantic exclusions.

The operation reserves job metadata, live checker/proposal buffers and source
storage through IndexWorkspace before construction. A proposal producer stays
paused through capture and independent checking. Checked losers, all live cursors
and every partial preparation are released on replacement, cutoff or disposal.
Predictable accepted synchronization is prepaid as
`1 + cells*(symbols+1) + sumJobs(2+dependencies.length)`.
Canonical scoring costs `2*nodes + 4*effects + ceil(stepBytes/256) + 1`.

`prepareSources(view,workspace,{level,reserveWork})` is an explicit cooperative
source owner. The default complete level builds exact ordered fact/proposition
lookups, maximum ID and current-domain conflict incidence. Facts level omits only
incidence and is sufficient for C01–C05. Both levels index the entire actual prefix.
Each fact holds 65 work units before its bounded 16 KiB capture, settles
`1+ceil(actualBytes/256)`, and reserves storage before canonical key construction.
Failed capture consumes the conservative hold. Sealing each lookup list costs
`1+ceil(length/256)`; pair, candidate-pair and relation tuple-coordinate visits each
yield and consume one unit. Storage is a 65,536-byte scratch reservation plus
`1024+4*actualBytes+128*ruleCount+8*scopeCount` per fact and 128 per incidence entry.

The published SourceIndex has no mutation API, returns frozen source lists and
checks active ownership. Registrations bind exact authentic views. Dual owners
have independent leases; a newer facts-only preparation cannot shadow a live
complete preparation. Complete queries on facts-only ownership throw instead of
claiming conflict absence. Non-scheduler callers retain legacy fallback lookup
semantics; a scheduler asserts its required live preparation before resuming work.
Conditional revocation remains enforced. No checked step strongly retains a
historical ReadView solely for source matching: private opaque publication tokens
back the read-only `checkedStepMatchesSource(step,view)` predicate.

## Confined rollout

Rollout is allowed only for Analyze on the primary expanded profile, off by
default. `rolloutCandidates()` accepts at most four authentic first candidates
and returns only their selected first step and metrics. Its allowance is
`min(8192,floor(remainingWork/10))`; every branch receives the same floor-divided
share, with unused remainder unavailable. Ordering costs are charged once per
candidate inside these shares. No branch borrows another branch's unused credit.

`HypotheticalSession.fromChecked(parent,step,label,workspace,charge)` authenticates
the exact active primary source, imports and unconditional closed published roots.
It rejects conditional origins or taint. An advanced discharged first step may
retain lexically scoped intermediate nodes; those remain scoped and cannot be
used as closed premises. Private immutable append layers share authentic parent
objects and keep branch disposal gates. Source validation, changed-cell indexes,
branch storage and predictable cleanup are charged before allocation; preparation,
checking, scoring and subsequent publication stay within the share.

Only sessions created by fromChecked forbid assumptions, limit checks to C01–C05
and limit productive publications to 16. Ordinary HypotheticalSession callers
retain their existing forcing/net assumptions and branch-graph whitelist. Confined
sessions cannot publish into primary state, expose speculative facts through
rollout results, advance primary ledgers, or alter operation tuple allowances.
The chosen first step is rechecked on the real current source before selection.

An authentic normalizeClassic fixture with all 27 rules and two missing values
produced one cheap continuation with measured share usage 8,129/8,192, utility 32,
then incomplete work-limit. The earlier conservative preparation/copy version
produced zero continuations (5,838 consumed before an unaffordable operation).
This demonstrates useful bounded work, not a guarantee that every 2,048-unit
four-candidate share can initialize or continue.

## Synchronous boundaries and integration obligations

Retained-prefix copying, authentication, root validation and retained-table seeding
are incremental. A private immutable pre-node map facade preserves the exact
stage cutoff without copying the entire available prefix for every new node.
Coloring source reconstruction and pair incidence yield through prefix-dependent
loops. Remaining synchronous work is explicitly bounded and charged; it is not
claimed to meet 4/8 ms browser targets.

The checker has a 16 KiB node and an internal 32 KiB header ceiling. T21 still
enforces the approved 16 KiB wire/prefix single-header and single-node record
gates; 32 KiB control packets are separate. The codec bounds 4,096 array elements, 64 object
fields/premises/scopes, 1,024 imports/roots and the selected node/run caps. A named
grammar precharges `cells + 4*allDifferentCellSlots + nodes*(effects+4) +
ceil(headerBytes/256)`. Its readonly source facade additionally charges every
get/has/iteration, including repeated imported conjunction ancestry and rejection.
Live remaining credit can interrupt these synchronous reads. C21 aligned grammar
also prepays eight units per Cartesian tuple and charges each matching-leaf
probe; selected cells are at most four, so the existing domain maximum is
`9^4 = 6561`. This is distinct from the 4,096-element codec cap, which can honestly
prevent an oversized certificate. No family bound was changed. Unique original
source packing retains original order plus all current domain facts; the 1,105
early impossibility guard follows from 1,024 imports plus at most 81 domain IDs.

T20 must reserve/charge initializationReservation before initialize, own the shared
budget/workspace and operation template context, drain work in browser tasks,
handle cancellation and receiver acceptance, and dispose StepSelection in finally.
Do not reset phase credit on continuation, replay a work event as fresh credit,
count proof-only retention as candidate progress, or infer completion from disabled
or interrupted ledger rows. T26 must measure codec captures, finite named grammar
calls, source-list sealing and candidate publication on browser fixtures before
claiming response-time targets. This scheduler does not implement T20 transport,
conditional grant readiness, controller state, UI or calibrated defaults.
