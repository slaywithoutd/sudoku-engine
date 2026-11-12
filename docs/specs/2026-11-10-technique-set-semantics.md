# Technique set semantics for Explain — design note (S1)

Status: **approved under D105** (2026-11-12), with the §9 recommended defaults taken by the implementing agent on the user's delegation, and one deviation recorded in D105: the library and backup format version is bumped (§5.6). This is task S1 of the [technique selection proposal](2026-10-22-technique-selection-and-solve-views.md) (its §4.1, §4.3, §5 and §6), which is itself not approved. No decision number is assigned; see §10. Written 2026-11-10 **by reading code only**: nothing was run, because another session was running the whole suite. Every behaviour below is either quoted from the code or marked as inferred, and §7 lists what must be run before S2 starts.

Code references are to `feat/m26-hardening` at `71887c8` (M2.6 T01–T08, not merged when this was written) unless a path is marked `master`. `explain-fair@3` exists only there. Line numbers shift if that branch changes before it merges.

Related: [M2.6 engine hardening](2026-09-22-m26-engine-hardening.md) (D103), [deterministic scheduling](../solver/scheduling.md), [decisions](../decisions.md) D047, D049, D055, D063, D094, D099, D101, D103

## 1. Objective

Settle, before any engine or UI work on technique selection:

1. What tier exhaustion means when a run may use only some technique families, and in particular what `incomplete-cheaper-tier` does for a set with gaps, under `explain-fair@3` and its `capped` jobs.
2. What a step, and a stall, found under a restricted set may and may not claim (D055).
3. How the set enters the canonical options key and the `RunKey`, so that the default set keeps today's key and every golden trace (D094).
4. How presets, settings and backups carry the set.
5. The tests task S2 must pass.

This note changes no code. "Family" means one coverage row (`C01`…`C33`, `U01`…`U05`, and `K01`/`K02` on variant profiles): one row is one descriptor and one scheduler job (`techniques/registry.ts:115-159`). Aliases of one row (Naked Single, Full House, Last Digit) cannot be chosen separately, as the proposal states.

## 2. What the code does today

### 2.1 From profile to ledger

- `getTechniques(profile)` returns one descriptor per coverage row. `classic-expanded@1` is the 38-row list with the five `unique-only` rows filtered out, and the variant profiles append K01 and K02 (`techniques/registry.ts:169-178`). A profile is already "the catalogue minus some rows, removed before assembly".
- `assembleTechniqueJobs(assembly, profile)` returns the rule jobs plus that list (`registry.ts:203-221`). `SchedulingLedger` builds one row per rule job (tier −1) and one per descriptor (`scheduling/ledger.ts:61-97`).
- Nothing adds or removes rows during a run. Every ledger predicate below quantifies over `this.jobs`, which is exactly what was assembled.

Tiers of the classic rows (`techniques/manifest.ts`), used by §5.2 and §5.4:

| Tier | Rows |
| --- | --- |
| 0 | C01 singles, C02 hidden single, C03 locked candidates |
| 1 | C04 naked and hidden subsets, C05 locked pair and triple |
| 2 | C06 basic fish (X-Wing, Swordfish, Jellyfish), C10 Turbot Fish / Skyscraper / Two-String Kite / Empty Rectangle, C11 XY-, XYZ- and W-Wing, C13 Remote Pairs |
| 3 | C14 colouring, C15 3D Medusa |
| 4 | C07 finned and sashimi fish, C08 Franken and mutant fish, C09 endo-fin, cannibalistic and Siamese fish, C12 WXYZ-Wing, C16 X-/XY-chains and AICs, C17 nice loops and grouped AICs, C18 ALS-XZ and ALS-XY-Wing, C19 ALS chains and Death Blossom |
| 5 | C20 Sue de Coq, C21 aligned exclusion, C29 Fireworks, C30 SK Loops, C31 Exocet, C32 Tridagon, C33 per-digit templates |
| 6 | C22 forcing chains, C23 forcing nets, C24 Kraken Fish, C25 bivalue chains, C26 t-whips, C27 braids, C28 OR-k forcing; U01–U05 (conditional profile only) |

### 2.2 The tier gate

Explain picks its next job from the lowest tier that still has an active job, after the rule jobs:

```ts
// scheduling/policy.ts:41-48
let jobs = [...ledger.active];
if (!jobs.length) throw Error("no-pending-job");
// Original rules drain before every family selection window.
if (jobs.some((j) => j.tier === -1)) jobs = jobs.filter((j) => j.tier === -1);
else if (this.mode === "explain") {
  const tier = Math.min(...jobs.map((j) => j.tier));
  jobs = jobs.filter((j) => j.tier === tier);
}
```

Before the chosen job is served, the selection applies the gate. This is the only place in `web/src` that produces `incomplete-cheaper-tier`:

```ts
// scheduling/select.ts:553-566
while (this.ledger.active.length) {
  const key = this.#policy.next(this.ledger, this.#view),
    job = this.ledger.job(key);
  // An interrupted rule/cheaper tier cannot authorize later Explain claims.
  // Under explain-fair@3 a capped lower job counts as settled.
  if (
    !(this.#tierCap
      ? this.ledger.simplerSettled(job.tier, this.#tierCap.fromTier)
      : this.ledger.simplerExhausted(job.tier)) &&
    (this.options.mode === "explain" ||
      (job.tier >= 0 &&
        this.ledger.jobs.some((j) => j.tier === -1 && j.status === "interrupted")))
  )
    return "incomplete-cheaper-tier";
```

```ts
// scheduling/ledger.ts:157-176 (comment omitted)
simplerExhausted(tier: number): boolean {
  return this.jobs
    .filter((j) => j.tier < tier)
    .every((j) => j.status === "exhausted" || j.status === "excluded");
}
simplerSettled(tier: number, fromTier: number): boolean {
  return this.jobs
    .filter((j) => j.tier < tier)
    .every(
      (j) =>
        j.status === "exhausted" ||
        j.status === "excluded" ||
        (j.tier >= fromTier && (j.status === "capped" || j.status === "interrupted")),
    );
}
```

`tierCap` exists exactly for `explain-fair@3` (`scheduling/work.ts:173-175`), with the default `{ fromTier: 3, unitsPerJobPerState: 100_000 }` (`work.ts:54-57`). On `master` the same gate is `select.ts:459-465`, with `simplerExhausted` only.

What follows from these three excerpts, by reading: because Explain picks from the lowest active tier, every job below the chosen one is already inactive. The gate therefore fails only when a lower job is inactive in a status the predicate rejects.

| Policy | A lower job in this status ends the selection with `incomplete-cheaper-tier` |
| --- | --- |
| `explain-fair@1`, `explain-fair@2`, and `fixed-scan@1` / `event-fixed@1` in Explain mode | `interrupted` or `disabled`, at any tier, rule jobs included |
| `explain-fair@3` | `interrupted` below tier 3 (rule jobs and tiers 0–2); `disabled` at any tier |
| Analyze policies, and the two baselines in Analyze mode | a rule job `interrupted`, when a technique job is picked |

The baselines accept either mode (`work.ts:179-183` checks only the `explain-fair` and `analyze-fair` prefixes) and `FairPolicy` receives the run's mode (`select.ts:134-139`).

A row that does not exist cannot fail either predicate. `capped` cannot occur below `fromTier`, since the cap applies only from it (`select.ts:600-603`). No test in `web/tests` names `incomplete-cheaper-tier`; `scheduling.test.ts:114-125` covers the ledger predicate alone.

### 2.3 Every place a job status decides tier progress

| Where | Statuses read | What it decides |
| --- | --- | --- |
| `ledger.ts:105-107` `active` | `pending`, `in-progress`, `found` | Which jobs the policy may pick; the selection loop runs while one is active (`select.ts:553`). |
| `policy.ts:44-48` | tiers of the active jobs | Rule jobs first; Explain restricts to the lowest active tier. |
| `ledger.ts:157-161` `simplerExhausted` | `exhausted`, `excluded` | The gate under `@1`, `@2` and Analyze; `canClaimSimplerExhausted` (`select.ts:761`). |
| `ledger.ts:167-176` `simplerSettled` | the same, plus `capped` and `interrupted` from `fromTier` | The gate under `explain-fair@3`. |
| `select.ts:558-566` | through the two predicates; rule jobs `interrupted` | The gate itself. |
| `ledger.ts:108-110` `complete` | every job `exhausted` or `excluded` | A stop with no step is `profile-stall` and `complete: true`, otherwise `incomplete-coverage` (`select.ts:469-478`). |
| `select.ts:494-502` `#reopenDisabledJobs` | `disabled` | Back to `pending` at the start of every selection. |
| `select.ts:626-627` | active, `stateWork` at the cap, no checked step waiting | Sets `capped` with reason `tier-work-cap`. |
| `select.ts:531-551` `#reopenSettled` | `capped` from `fromTier` | When a pass ends with no step and no stop reason, the capped jobs restart with a doubled cap (`select.ts:505-513`). |
| `select.ts:755-760` | `interrupted` at any tier; `capped` below the step's tier | `budgetLimited` on the step. |
| `state/events.ts:52-71` `invalidate`, `ledger.ts:181-206` `advance` | keeps `exhausted` and `excluded` rows whose watches the accepted step did not touch | Everything else returns to `pending` on the new state; `stateWork` and `capRounds` reset. |
| `human.ts:60-73` `stopStatus` | `complete` and the reason of the stop | `stalled-within-profile`, `incomplete` or `contradiction`. |
| `classic-run.ts:133-162` `coverageOf` | each row's status and work | The `exhausted`, `capped` and `notStarted` lists; `highestTierTried`. |
| `ledger.ts:121-125` `rows` | `pending` or `in-progress` with `capRounds > 0` | The row of a reopened capped job keeps the reason `tier-work-cap`. |
| `classic-run.ts:173-187` `stopReasonOf` | `capped`, or reason `tier-work-cap` | `tier-cap` ahead of `profile-stall` and `work-limit`. |

Discovery writes statuses in four places: `#startDiscovery` (`excluded` when `eligible()` says so, otherwise `in-progress`, `select.ts:346-365`), the discovery events (`select.ts:379-395`), a discovery that ends without a terminal event (`interrupted`, `select.ts:299-300`), and a checker resource failure (`interrupted`, and the selection stops with that code, `select.ts:333-336`). The cap (`select.ts:627`), the two reopen paths (`select.ts:500`, `548`) and `ledger.advance` (`ledger.ts:187-189`) write the rest; their effects are rows of the table above.

### 2.4 What `incomplete-cheaper-tier` becomes downstream

In Explain, the selection yields a `logical-stop` with `complete: false` and that reason, then disposes itself (`select.ts:469-478`). In Analyze with steps already buffered, it publishes one of them instead, marked `budgetLimited` because the reason is set (`select.ts:461-467`, `756`); S2 exercises Explain only. `humanSteps` maps it to `human: "incomplete"` and rewrites the reason to `logical-budget` (`human.ts:44-46`, `60-73`, `164-173`). `stopReasonOf` then reports `tier-cap` if any row is capped and `work-limit` otherwise (`classic-run.ts:181-186`). The Solve screen therefore says the logic was stopped by the work limit, whatever interrupted the lower job (a workspace or proof-size limit, for example). This is existing behaviour and does not depend on technique sets; §8 and §9 item 8 carry it.

### 2.5 The probe finding, re-read

The proposal's §2 reports that filtering the technique list in a probe gave `incomplete-cheaper-tier` for some sets, and §3 concludes that the tier rule "has no defined meaning for a set with gaps". By §2.2, a missing row cannot cause that stop. What can, under `explain-fair@1` (the Explain default on `master` when the probe ran; the proposal does not name the policy), is an **enabled** lower job that ends `interrupted`:

- The proposal's own table lists per-digit templates (C33, tier 5) as interrupted by a fixed bound on that state. `techniques/templates.ts:529-532` turns that bound into an `interrupted` event.
- The M2.6 progress record (T05) notes `c22` and `c28` reaching the workspace byte limit, which is also an interruption.
- A filtered set that held C33 together with any tier-6 family would stop at the first tier-6 pick.

**This is an inference.** The probe scripts are outside the repository and the note does not record which families each filtered set held. Under `explain-fair@3` an `interrupted` job from tier 3 up counts as settled, so the same sets would climb and mark the later steps `budgetLimited`. §7 check 1 re-runs it.

## 3. Findings that shape the design

| Finding | Consequence |
| --- | --- |
| The ledger predicates quantify over the assembled jobs only (§2.1, §2.2). | A family removed before assembly leaves no row, and the gate needs no new case. |
| A profile is already built by removing rows before assembly (the `unique-only` filter). | Removal is the existing idiom, and `stalled-within-profile` already means "no step in the assembled set". |
| `excluded` and `disabled` have fixed meanings. `excluded` is a proved inapplicability with a reason and watches (`select.ts:348-352` rejects one without them). `disabled` exists for `missing-unique-authority` only, is reopened at every selection and never counts as coverage ([scheduling](../solver/scheduling.md): "disabled or interrupted work is never complete coverage"). | Neither can also mean "the user switched this off" without changing what it says in the existing cases. |
| `canClaimSimplerExhausted` is produced at `select.ts:761` and read only by a test (`policies-v3.test.ts:83-89`). `humanSteps` forwards `budgetLimited` and the ledger, not the claim (`human.ts:126-132`). No copy in `web/src` says "simplest". | No user-visible text over-claims today. The rule for restricted sets can be fixed before any text depends on it. |
| The canonical key omits optional fields that do not apply (`policyParameters`, `tierCap`: `work.ts:165-175`) and encodes arrays in the order given (`work.ts:232-233`). | An optional field keeps the default key byte-identical; the list must be sorted before it is encoded. |
| `RunKey` is a closed record of 13 fields and `validRun` requires exactly those (`snapshot.ts:21-35`, `evidence.ts:156-198`, `transport/protocol.ts:24-38`). | The set travels inside `optionsKey`, not in a new `RunKey` field. |
| The probe's stop is explained by an interrupted enabled job (§2.5, inferred). | Gaps and interruptions are separate questions, and M2.6 already answered the second from tier 3 up. |

## 4. Candidate semantics for a switched-off family

- **A, kept as `excluded`.** The row stays in the ledger and its `eligible()` returns `excluded` with a reason such as `not-selected`.
- **B, removed before assembly.** `assembleTechniqueJobs` filters the profile's descriptors by the enabled set.
- **C, kept with a new status.** A status `not-selected`: never active, settled for the gate, never exhausted.

| Quantity | A: `excluded` | B: removed | C: new status |
| --- | --- | --- | --- |
| Gate: `simplerExhausted`, `simplerSettled` | True for the row; `excluded` passes both. Gate code unchanged. | No row, so both hold vacuously. Gate code unchanged. | `simplerSettled` must accept the status under every policy, so `@1`, `@2` and Analyze need a new predicate at `select.ts:559-561`. |
| `incomplete-cheaper-tier` from a gap | Never. | Never. | Never, once the gate accepts the status. |
| `canClaimSimplerExhausted` | True past a switched-off family, the same value as for a family proved inapplicable. The flag stops telling "proved" from "not asked". | True when every enabled lower job is exhausted or excluded. The claim is "within the set", by construction. | False past a switched-off lower family. The flag keeps a catalogue-wide meaning. |
| `budgetLimited` | Unchanged; it reads `interrupted` and `capped`. | Unchanged. | Unchanged, unless the status is added to it, which would mix "budget" with "choice". |
| Reopen rules | Not reopened by `#reopenSettled`. With the `all` watch that the existing exclusions use, `invalidate` returns the row to `pending` after every accepted step (`state/events.ts:28-29`, `56-60`), so on every state where the selection reaches its tier it is picked, re-excluded and given a rotation ticket (`select.ts:567`, `ledger.ts:136-138`), which shifts the every-fourth-ticket cadence of `policy.ts:55-56` for the enabled jobs. A watch that no step affects would avoid this, at the cost of a second kind of exclusion. | Nothing to reopen. | `invalidate` and `ledger.advance` must learn to keep the status; today only `exhausted` and `excluded` survive (`state/events.ts:58`). |
| `complete`, stop reason | `complete` holds, so `profile-stall`. | `complete` over the enabled rows, so `profile-stall`. | `complete` must accept the status. |
| Coverage lists | The row lands in `exhausted`, "nothing more to offer" (`classic-run.ts:149-150`). A switched-off family would be reported as exhausted unless `coverageOf` inspects the reason. | The lists partition the enabled rows. Switched-off families are a set difference, computed where the result is built. | A fourth list, read from the ledger. |
| Default set | No descriptor is wrapped: identical. | No filter is applied: identical. | Identical in behaviour, but the gate, `complete`, `invalidate` and the status union are edited on the path every run takes. |
| Code touched | registry (a wrapper), `coverageOf` | registry (a filter), `classic-run` (the set difference) | `techniques/types.ts`, `ledger.ts`, `select.ts`, `state/events.ts`, `classic-run.ts`, and every test that enumerates statuses |

**Recommendation: B.**

1. It is what a profile already is. `stalled-within-profile` keeps its meaning, and no status gains a second one.
2. The gate, the ledger, `invalidate` and the status union are not edited. The code every existing trace runs through is untouched, so byte-identity for the default set (D094) holds by construction and not only by regression test.
3. The one thing B cannot say inside the scheduler, the catalogue-wide claim, is a pure function of the set and the step's tier. It is computed where the result is built (§5.2), which is also where display names live.
4. C's extra precision is available from B at no scheduler cost. A mislabels coverage and blurs `excluded`.
5. It keeps the rule D103 set for capped jobs when it revised D063: `explain-fair@3` "claims tier exhaustion only when proved" and otherwise says so. A capped family is said through `budgetLimited`; a switched-off family is said through the set-limited mark of §5.2.

The cost of B: `canClaimSimplerExhausted` on the selection event becomes relative to the run's set. It has no consumer today. §5.2 fixes its definition and S2 documents it on the event type (`select.ts:51`).

## 5. Design

### 5.1 The tier rule with a set

**The run's registry is the profile's descriptors filtered to the enabled set, in the profile's order. Every scheduling rule then applies unchanged to that registry.** Spelled out:

- A job at tier *t* is served when every **enabled** job below *t* is exhausted or excluded, or, under `explain-fair@3` and from tier 3, capped or interrupted. A switched-off family is not a job and is never waited for.
- **`incomplete-cheaper-tier` is never produced by a gap.** It keeps exactly its current meaning: an enabled job of a lower tier, or a rule job, stopped without settling (the table in §2.2). A restricted run can still end this way, for the same cause and with the same report as a full run.
- **Capped jobs are unchanged**, which answers the proposal's paired question once. A lower family that is capped is settled and budget-limited. A lower family that is switched off is absent and set-limited (§5.2). Neither blocks a climb. Each removes the catalogue-wide claim from the steps above it, and the two are reported separately.
- `stalled-within-profile` and `profile-stall` mean that every enabled job is exhausted or excluded on the final state: no step with the selected techniques.
- Rule jobs (tier −1, shown as "Basic elimination") are not families and cannot be switched off.
- The empty set is valid. The registry holds rule jobs only and the run ends `stalled-within-profile` once they are exhausted (read from `select.ts:505-513` and `469-478`; §7 check 3).
- Analyze uses the same filter; its gate concerns interrupted rule jobs only. Rollout is already limited to Analyze on `classic-expanded@1` (`work.ts:213-214`), and its continuations always use C01–C05, whatever the run's set (`scheduling/rollout.ts:94-96`). A set that switches off any of them would therefore be bypassed by rollout, so `rollout: true` together with a restricted set is rejected (`rollout-requires-full-set`). Engine Analyze mode and rollout stay outside the UI (D099, D101), so S2 exercises the set in Explain.
- `profileReadiness` still checks the whole profile.

| Quantity | Value for a restricted set |
| --- | --- |
| `simplerExhausted(t)` | Every enabled job below *t* is exhausted or excluded. |
| `simplerSettled(t, 3)` | The same, plus capped and interrupted enabled jobs from tier 3. |
| `canClaimSimplerExhausted` | `simplerExhausted` at the step's tier: nothing simpler in the selected set. |
| `budgetLimited` | As today: the selection was cut, an enabled job is interrupted, or an enabled lower job is capped. |
| Reopen rule | Capped enabled jobs from tier 3 restart with a doubled cap, as today. |
| Coverage lists | `exhausted`, `capped` and `notStarted` partition the enabled rows; switched-off rows are reported beside them (§5.5). |
| Stop reason | As today. `profile-stall` reads "no step with the selected techniques". |

### 5.2 What a step and a stall may claim

Let `lowestTierOff` be the lowest tier among the switched-off rows. A step is **set-limited** when its tier is above `lowestTierOff`: some switched-off family is simpler than the step.

| Claim | Full set | Restricted set |
| --- | --- | --- |
| The step is valid. | Yes; it is checked independently of how it was found. | The same. The checker never sees the set. |
| Count and solution. | From the exact phase on the original clues (D049, D103). | The same. The set never reaches the exact phase. |
| No technique of a lower tier has a step on this state (`canClaimSimplerExhausted` true and `budgetLimited` false). | For the whole profile. | Only among the selected techniques. For the whole profile only when the step is not set-limited. |
| This is the simplest possible explanation. | Never claimed. D055 states a preference ("favors simpler checked proofs"), and inside a tier the first job to find a step wins (`select.ts:580-587`). | Never. A set-limited step says that a switched-off technique may give a simpler step. |
| The stall. | No technique of the profile applies. | No step with the selected techniques. Never "the puzzle needs harder techniques" and never "this cannot be solved by logic". |
| Difficulty (`difficulty@0`: highest tier, steps per tier). | Informative. | Informative and relative to the set. A restricted run can use a higher tier than the full run would, or stop lower. It is not shown as the puzzle's difficulty. |
| A solved run as a complete logical path. | Yes. | Yes. A restricted run that stalls says nothing about whether the full profile solves the puzzle. |

Three consequences for the presets of §5.4:

- A **prefix set** (every row up to a tier, such as "Up to subsets") has no set-limited step, because every switched-off family is above every enabled one. Only its stall wording changes.
- "Singles only" switches off C03, which shares tier 0 with the singles. The tier-level claim looks only at lower tiers, so its steps are not set-limited either.
- A **gap set** such as "No fish" switches off rows at tiers 2, 4 and 6. Every step above tier 2 is set-limited.

`budgetLimited` and set-limited stay separate. A step can be both, and the existing note for `budgetLimited` ("a simpler technique stopped at its limit") is wrong for a choice.

### 5.3 Options key and `RunKey`

New optional field `SchedulingOptions.techniques?: readonly string[]`: the enabled coverage ids.

Canonical form, enforced in `schedulingOptions()`, which every key passes through (`canonicalOptionsKey` calls it, `work.ts:229-230`):

1. Each element is the coverage id (`CoverageEntry.id`) of a row of the run's profile. An id that is not a row of the profile is rejected (`unknown-technique`). A duplicate, or a value that is not an array of strings, is rejected (`invalid-technique-set`). `work.ts` imports only `PROFILES` today, from a module kept free of the catalogue (`work.ts:1`, `techniques/profiles.ts:1-5`), so the row ids per profile belong in that kind of module, pinned against the manifest by a test, not in an import of the 8,000-line manifest.
2. The list is sorted ascending by code unit (`compareText`, `ledger.ts:52-54`). This is not always the profile's order: `variants-conditional@1` lists C, then U, then K rows (`registry.ts:171-177`), and the sort gives C, K, U.
3. If the sorted list equals the profile's row ids **sorted the same way**, the field is **omitted**. `undefined` and the full list are the same options. Comparing against the rows in registry order would keep the field for the full set on `variants-conditional@1` and change that profile's default key.
4. The empty list is kept.
5. With `rollout: true` the field is rejected (§5.1).

Coverage ids are used, not technique versions (`c06@1`), because they are the proposal's unit of choice and the versions are already fixed by the profile id, which is in the key. The key lists enabled ids because that is what the registry filter consumes; within one profile, enabled and switched-off lists carry the same information.

`canonicalOptionsKey` sorts object keys recursively and keeps array order. A restricted run's key gains one property, between `rollout` and `tierCap`:

```text
{"limits":{…},"mode":"explain","phaseTimeMs":60000,"phaseWorkUnits":7200000,"policy":"explain-fair@3","profile":"classic-expanded@1","rollout":false,"techniques":["C01","C02"],"tierCap":{"fromTier":3,"unitsPerJobPerState":100000}}
```

`RunKey` gets no new field. `RunKey.profile` stays the base profile id and `RunKey.optionsKey` carries the set. Two runs with different sets differ in `optionsKey`, so `sameRun` (`evidence.ts:194-198`) keeps their evidence apart and the receiver, which compares whole keys, drops a message of the other run (`transport/receiver.ts:27`). A preset name never enters the key: a custom set equal to a preset is the same run.

**Why the default set stays byte-identical.**

1. *Key.* For the full set the frozen options object has no `techniques` property (rule 3). `JSON.stringify` writes nothing for an absent property, and no other property is computed differently. The same mechanism already keeps `policyParameters` out of the `@1` keys and `tierCap` out of every key but `explain-fair@3`'s (`work.ts:165-175`; pinned for `@1` by `policies.test.ts:91-93`).
2. *`RunKey`.* The same 13 fields with the same values.
3. *Trace.* Without the property, `assembleTechniqueJobs` applies no filter and returns the same frozen list in the same order. Under recommendation B the ledger, the policy and the selection are not edited, so the same inputs reach the same code. The golden traces record technique ids and effects per step, plus `human`, `count` and `steps` (`golden-traces.test.ts`), and none of those can move.
4. *Result.* A default run's events gain no field (§5.5).

This is an argument from reading. §6 table 1 pins it by test.

One constraint for S2: `classic-run.ts:401-423` builds the options once and passes the same object to the selection (`:473`) and to the key (`:423`). The registry filter must read `techniques` from that normalised object, never from the raw input, so the key and the registry cannot disagree.

### 5.4 Presets

A preset is a named rule that resolves, for a given profile, to a set of rows. Its name exists for the selector and for settings; it is never part of a run's identity.

- **Id.** `name@n`, like every versioned id in the engine (`evidence.ts:171`). A change of membership on any profile is a new version. A change of label is not.
- **Definition.** A rule over the profile's rows (a tier bound, or listed ids), so one preset has a meaning on every profile. Its expansion on `classic-expanded@1` is pinned by a test as an explicit list (§6 table 2), so a tier change in the manifest cannot silently change a preset.
- **One table**, free of runtime imports as `techniques/profiles.ts` is, read by settings validation, the selector and the engine tests.

Recommended table. The labels are the proposal's (§4.1); the membership is a product choice (§9 item 3).

| Id | Label | Rule | On `classic-expanded@1` | Shape |
| --- | --- | --- | --- | --- |
| `all@1` | All | every row | 33 rows; the field is omitted from the key | full |
| `singles@1` | Singles only | C01, C02 | `C01`, `C02` | no set-limited step |
| `up-to-subsets@1` | Up to subsets | tier ≤ 1 | `C01`–`C05` | prefix |
| `up-to-wings-fish@1` | Up to wings and fish | tier ≤ 2 | `C01`–`C06`, `C10`, `C11`, `C13` | prefix |
| `no-fish@1` | No fish | all but C06, C07, C08, C09, C24 | 28 rows | gaps at tiers 2, 4 and 6 |

"Up to wings and fish" holds the basic fish only; finned and larger fish are tier 4.

### 5.5 Run input, worker request and result

Three layers, so that one place owns each rule:

- **Identity** (`schedulingOptions`): `techniques`, the enabled ids, strict (§5.3).
- **Resolution**, beside the preset table: `resolveTechniqueSet(profile, selection)`, where a selection is a preset id or a list of switched-off ids, returns the enabled ids for that profile. It is lenient in one respect only: a switched-off id that is a catalogue row but not a row of this profile (a U row under `classic-expanded@1`) is ignored, since that row is not in the run anyway.
- **Run input and worker request**: `ClassicSolveInput` and the `solve-classic` request gain the optional selection. `solveProblem` resolves it next to `profileFor` (`classic-run.ts:396`).

An unknown preset id, or an id that is not a catalogue row, ends the run with an `error` result whose code is the identity layer's: `unknown-technique` for an id, `invalid-technique-set` for a malformed selection or an unknown preset. It never falls back to the full set: a result computed with every technique must not appear under a restricted label. An invalid `timeLimitMs` does fall back to the default today (`workers/solver.worker.ts:41-48`), which is harmless for a limit and not for a set. Worker messages are untrusted (`solver.worker.ts:32`), so the selection is shape-checked before use.

Result fields, present **only** for a restricted set:

```ts
// on the "result" event
readonly techniqueSet?: {
  /** The enabled coverage ids, as in the options key. */
  readonly enabled: readonly string[];
  /** Display names of the profile's rows outside the set. */
  readonly notSelected: readonly string[];
  /** Lowest catalogue tier among them. */
  readonly lowestTierNotSelected: number;
  /** Accepted steps above that tier (set-limited, §5.2). */
  readonly setLimitedSteps: number;
};
// on a "step" event
readonly setLimited?: true;
```

`coverage.exhausted`, `capped` and `notStarted` then partition the enabled rows (`coverageOf` already receives `registry.techniques`, `classic-run.ts:553-557`), and together with `notSelected` they hold exactly the profile's rows. Both new values are computed in `classic-run.ts` from the set and `techniqueTiers`; the scheduler does not know them.

Constraints on the copy, which S3 owns: a stall under a restricted set reads "no step with the selected techniques" where `ui/solver-copy.ts:47` says "no technique applies" today, and a set-limited step gets a note beside the existing budget note (`solver-copy.ts:74-76`), for example "A simpler step may exist: a simpler technique is switched off."

### 5.6 Settings and backup (`master`)

Today `Settings` holds five solver fields, each a closed choice or a boolean (`domain/model.ts:150-155`, `domain/settings.ts:62-66`). `normalizeSettings` gives a missing field its default and rejects an explicit invalid value (`settings.ts:88-107`). It runs on every library load and commit as well as on backup import (`storage/repository.ts:44`, `63`; `domain/backup.ts:223-225`), so a stored value the running build rejects makes the whole library unreadable.

| New field | Value | Default | Validation |
| --- | --- | --- | --- |
| `solverTechniquePreset` | a current preset id, or `"custom"` | `"all@1"` | a closed choice in `CHOICES`, checked after retired ids are mapped |
| `solverTechniquesOff` | the coverage ids switched off in the custom set | `[]` | an array of catalogue ids, strictly ascending, as `digits()` requires of notes (`backup.ts:73-77`) |

- `solverTechniquesOff` is used only when the preset is `"custom"`. It is kept when a preset is chosen, so the custom set is not lost.
- It stores switched-off ids, not enabled ids: a row the list does not name is on. A family added to the catalogue later, and the K rows once the Solve screen runs variants, are then on in a custom set until the user switches them off. The options key still carries enabled ids, resolved against the run's profile. This is a product choice (§9 item 4).
- `normalizeSettings` handles the array beside `shortcuts` (`settings.ts:108-117`), because its generic loop accepts only choices and booleans (`settings.ts:105`).
- A **retired preset id** is mapped to the current version of the same name before the choice check, never rejected, because a rejection would make the stored library unreadable (§9 item 5).
- **Migration and versions.** *Superseded on approval: D105 bumps `formatVersion` and the backup `version` to 3 (versions 1 and 2 still load with the defaults); the rest of this paragraph is the note as proposed.* No stored record changes shape. A library or backup without the two fields takes the defaults, which is the full set and so today's behaviour. `formatVersion` and the backup envelope `version` stay 2; the rule in the code is that missing fields belong to older libraries (`settings.ts:88-91`). An older build that opens a newer library ignores the two fields, since it copies known keys only (`settings.ts:100`), and drops them at its next commit; the user is back on "All". This paragraph, plus the cases in §6 table 5, is the version note the proposal's §6 asks of S2.
- `solverView` is removed by S4, not by S2.

## 6. Test plan for S2

Each new test file runs in isolation and none depends on wall time: logical runs use a fake clock and a work limit that ends the run, as `golden-traces.test.ts` and `result-contract.test.ts` do.

**Table 1: identity of the default set**

| # | Case | Expected |
| --- | --- | --- |
| 1.1 | `canonicalOptionsKey(schedulingOptions({ limits, mode, policy }))` for each policy with its mode: `mode: "analyze"` for the three `analyze-fair` policies, both modes for `fixed-scan@1` and `event-fixed@1` (ten keys), against literal strings recorded before S2's first change (§7 check 4) | equal, byte for byte |
| 1.2 | the same options with `techniques` set to the profile's full id list: in order, reversed, shuffled | equal to 1.1; the key does not contain `"techniques"` |
| 1.3 | `golden-traces.test.ts`, unmodified (`@1`, and `@3` once M2.6 T09 records them) | byte-identical |
| 1.4 | `result-contract.test.ts`, `policies-v3.test.ts`, `count-first.test.ts`, unmodified | pass |
| 1.5 | a run with no selection, and a run with `all@1` | identical events; no `techniqueSet`; no `setLimited` |
| 1.6 | `assembleTechniqueJobs` with no set and with the full set | the same descriptor objects in the same order |

**Table 2: key and validation for restricted sets**

| # | Case | Expected |
| --- | --- | --- |
| 2.1 | each preset resolved on `classic-expanded@1` | the pinned id list of §5.4 |
| 2.2 | `["C02","C01"]` and `["C01","C02"]` | one key, containing `"techniques":["C01","C02"]` |
| 2.3 | two different sets | different keys; `sameRun` is false for their `RunKey`s |
| 2.4 | a custom selection equal to a preset | the preset's key |
| 2.5 | `["C01","C01"]`, `"C01"`, `[1]` | rejected with `invalid-technique-set` |
| 2.5b | `["X99"]`, and `["U01"]` under `classic-expanded@1` | rejected with `unknown-technique` |
| 2.6 | `[]` | accepted; the key contains `"techniques":[]` |
| 2.7 | `rollout: true` with a restricted set | rejected |
| 2.8 | the key under `explain-fair@3` | `techniques` sits between `rollout` and `tierCap` (a literal) |
| 2.9 | a switched-off `U01` resolved on `classic-expanded@1` | ignored by the resolver; the full set results |

**Table 3: each set terminates with a status consistent with its set.** Cases: `easy`, `hidden-singles`, `seventeen`, `escargot`, `inkala-2012` and `golden-nugget` from the evaluation corpus (`tests/solver/bench/eval-corpus.json`), plus the proposal's §2 puzzle. Sets: the five presets, the empty set, and two custom gap sets (`C01, C02, C22`, which leaves tiers 1–5 empty; and every row but tier 3). Policy `explain-fair@3`, with one pass of the presets under `explain-fair@1`. For every (set, case), all of the following hold:

| # | Assertion |
| --- | --- |
| 3.1 | The run emits a `result` within the work limit, and `stopReason` is consistent with `human` by the existing table (`result-contract.test.ts:83`). |
| 3.2 | Every step's technique is a row of the set or a rule job. |
| 3.3 | No row of the final ledger names a switched-off technique. The three coverage lists and `notSelected` are disjoint and together hold exactly the profile's rows. |
| 3.4 | `stalled-within-profile` implies that every enabled row is `exhausted` or `excluded` in the final ledger. |
| 3.5 | At the selection level, as `policies-v3.test.ts` drives it: a stop with reason `incomplete-cheaper-tier` occurs only when an enabled lower job or a rule job is `interrupted` or `disabled`. |
| 3.6 | At the selection level: `canClaimSimplerExhausted` holds exactly when every enabled lower job is exhausted or excluded. |
| 3.7 | A step carries `setLimited` exactly when its tier is above `lowestTierNotSelected`, and `setLimitedSteps` equals their count. The prefix presets and `singles@1` have none. |
| 3.8 | Two runs of the same (set, case) emit identical events. |

Named outcomes. They follow from the reading and the corpus labels; S2 records the actual values once and pins them.

| Set and case | Expected |
| --- | --- |
| `singles@1` on `easy`, `hidden-singles`, `seventeen` | `solved` (the corpus labels them `singles: naked` or `hidden`) |
| the empty set on any unique case | `stalled-within-profile`, rule steps only, `highestTierTried` −1 (unless rule propagation alone fills the grid, which was not checked) |
| `up-to-subsets@1` on `escargot` | `stalled-within-profile` with `profile-stall`, never `tier-cap` (no enabled row at tier 3 or above) |
| `no-fish@1` on `escargot` and on the §2 puzzle | no step by `c06@1`–`c09@1` or `c24@1`; the status is checked by 3.1 only |
| `C01, C02, C22` on `escargot` | tier 6 is served; no `incomplete-cheaper-tier` |

**Table 4: count and checker results are identical across sets**

| # | Case | Expected |
| --- | --- | --- |
| 4.1 | all 131 corpus cases under `all@1`, `singles@1`, `no-fish@1` and the empty set | `count` and `solution` identical across the sets and equal to the corpus label |
| 4.2 | the same runs | `exactSteps` starts once per run (the spy of `count-first.test.ts`) |
| 4.3 | every step of every restricted run on the unique cases | no placement contradicts the corpus solution and no elimination removes its digit |
| 4.4 | every solved restricted run | `logicalValues` equals the corpus solution |

The 121 cases with zero or several solutions end at the precount, so table 4 costs little more than ten logical runs per set.

**Table 5: settings, backup and worker**

| # | Case | Expected |
| --- | --- | --- |
| 5.1 | a library and a backup without the two fields | loads with `all@1` and `[]` |
| 5.2 | export and parse with a custom set | both fields preserved |
| 5.3 | `solverTechniquesOff` unsorted, duplicated, with an unknown id, or not an array | rejected ("Invalid backup data.") |
| 5.4 | an unknown preset id; a retired one, once one exists | rejected; mapped to the current version |
| 5.5 | a worker request with a malformed selection | an `error` terminal; no run with the full set |

## 7. Checks to run before S2 starts

None of these was run for this note. Each is a short probe kept outside the repository and run alone, with the power state recorded next to any timing.

1. **Re-run the probe's filtered sets** on the proposal's §2 puzzle, under `explain-fair@1` and `explain-fair@3`, and record the final ledger. Expected from §2.5: under `@1`, `incomplete-cheaper-tier` appears exactly when an enabled lower job is `interrupted`; under `@3` it does not appear for a job at tier 3 or above. If it appears while every enabled lower row is exhausted or excluded, §2.2 is wrong and this note is revised before S2.
2. **A gap with no interruption.** The set `C01, C02, C22` on `easy` and on `escargot` under `@3`: Escargot reaches tier 6 with no `incomplete-cheaper-tier`.
3. **The empty set** ends `stalled-within-profile` with rule steps only, and `FairPolicy`, `SchedulingLedger` and `coverageOf` accept an empty technique list.
4. **Record the default identity.** The ten default keys of table 1 case 1.1 (each policy with its mode) and a passing golden-trace run on the M2.6 merge commit, before any S2 edit. These are the literals of table 1.
5. **Estimator under the `@2` policies** with a filtered registry. Read: the estimator looks a family up by its own technique id and takes its features from the view (`scheduling/estimator.ts:88-90`), so nothing depends on which other rows are present. Confirm with one `explain-fair@2` run of a restricted set.
6. **Detectors that use another family's code.** Read: Kraken (C24) takes fish geometry from `techniques/fish.ts` through a function call (`krakenFishShapes`), not through the fish jobs, and no file under `techniques/` other than the registry names the ledger or the registry. Confirm by a run that C24 produces the same proposals on a state with C06–C09 switched off as with them on.
7. **Interruptions below tier 3 under `@3`.** Whether any corpus run ends with an `interrupted` row at tiers 0–2 or on a rule job. Such a run ends `incomplete-cheaper-tier` today, restricted or not (§2.4).

## 8. Risks and open items

- **The reading may be wrong.** §2.5 is an inference and §5.1 is derived from three excerpts. Check 1 is the gate. If it fails, the fallback is the one the proposal names: selection limited to trailing families ("up to tier *n*"), which loses "No fish".
- **`canClaimSimplerExhausted` changes scope without changing name.** It becomes relative to the set. It has no consumer today; any later one (the header of S4, hints in M6) must combine it with `setLimited`.
- **A restricted run can read as a statement about the puzzle.** The stall wording and the difficulty figures carry this (§5.2), as the proposal's §6 already notes.
- **Display names are variant names.** `techniqueNames` shows a row by its first alias (`classic-run.ts:38-48`): `c04@1` is "Naked Pair" and `c06@1` is "X-Wing". That suits a step list and not a selector that switches whole families. S3 needs one family label per row.
- **A newer value makes an older build's library unreadable.** A preset id or a catalogue id that a later build writes (`no-fish@2`, a future `C34`) is an explicit invalid value to an earlier build, which rejects the whole library (§5.6). The existing closed choices, such as `solverTimeLimitS`, have the same property today. Recorded, not solved here; a lenient reading of these two fields would depart from the rule at `settings.ts:88-91` (§9 item 9).
- **An interrupted lower job is reported as a work limit** (§2.4). Independent of sets, and by reading a restricted set makes it neither more nor less likely. See §9 item 8.
- **M2.6 is not merged.** T09–T11 remain. If the merge review changes the gate, `simplerSettled` or the result contract, §2 and §6 need a second reading.
- **Variant and conditional profiles** follow the same rule but stay untested until the Solve screen runs them. S2's tests cover `classic-expanded@1`. The conditional operation (U rows, `disabled` without unique authority) was not traced; `classic-run.ts:396` never selects it.
- **Not verified, in one list:** nothing was executed; the contents of the probe's filtered sets and the policy it ran; the detectors' internals beyond the excerpts cited; the conditional operation; the `@3` golden traces, which do not exist until T09.

## 9. Decisions for the user

Each item has a recommended default. None is decided.

1. **Semantics of a switched-off family.** Recommended: removed before assembly (B, §4), so a gap never produces `incomplete-cheaper-tier`. Alternatives: kept as `excluded` (A); a new status (C); trailing sets only, if check 1 contradicts the reading.
2. **How a set-limited step is shown.** Recommended: a note on the step and a count in the header. Alternatives: one line in the header only; nothing per step.
3. **Preset list and membership.** Recommended: the five of §5.4, with "No fish" as C06–C09 and C24, and "Singles only" as C01 and C02. Alternatives: "No fish" also switches off C10 (Turbot Fish, Skyscraper, Two-String Kite, Empty Rectangle; the proposal's probe removed six fish jobs, and which six is not recorded); "No fish" keeps Kraken Fish; "Singles only" is the whole of tier 0, with locked candidates.
4. **What a custom set stores.** Recommended: the switched-off ids, so a family added later is on. Alternative: the enabled ids, so a family added later is off, which fits "the techniques I know" better and "switch off a slow family" worse.
5. **When a preset's membership changes in a later version.** Recommended: a stored choice follows the name to the new version. Alternative: it is frozen as a custom set with the old membership.
6. **The empty set.** Recommended: the engine accepts it and the selector allows it in a custom set, where it shows what rule propagation alone does. Alternative: the selector requires at least one family.
7. **Persisted or per session.** The proposal stores the set in settings, and so in backups. Recommended: as proposed. Alternative: memory-only, as solver results are (D047).
8. **Reporting a stop caused by an interrupted lower job** (§2.4). Recommended: give it a stop reason of its own in a small task after M2.6, outside S2. Alternative: leave it reported as a work limit.
9. **A preset or catalogue id the running build does not know** (§8). Recommended: reject it, as every other settings field does today. Alternative: read the two new fields leniently (an unknown preset becomes `all@1`, an unknown switched-off id is dropped), so a library written by a newer build still opens.

## 10. Entries to apply on approval

No `D` number is assigned. This note adds no decision entry of its own; it refines the entries in the proposal's §7. If both are approved:

- **Decision entry** (the proposal's new `D<n>`): add "A switched-off family is removed from the run's registry before assembly. The enabled set is the optional `techniques` field of the canonical options key, absent for the full set, and `RunKey` gains no field. `stalled-within-profile` then means no step with the selected techniques, and `incomplete-cheaper-tier` keeps its meaning. Source: the technique set semantics note."
- **Proposal S2 row**: its acceptance refers to §6 of this note for the tables.
- **README index**: a link to this note beside the proposal's line under "Proposed, not approved".
- **`docs/solver/scheduling.md`**, "Identity and policy": gains the `techniques` option when S2 lands. That edit belongs to S2's documentation, not to the approval.
