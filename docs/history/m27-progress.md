# M2.7 implementation progress

Record kept during the milestone. Spec: [proposal](../specs/2026-10-22-technique-selection-and-solve-views.md) and [S1 note](../specs/2026-11-10-technique-set-semantics.md), approved under D105. Branch `feat/m27-technique-selection`, one reviewed commit per task.

| Task | State | Commit | Evidence |
| --- | --- | --- | --- |
| Approval | done | `251be06`, merge `77856f7` | D105, roadmap row, README line; `docs/technique-set-semantics` merged and its worktree removed. |
| S1 §7 checks | done | (this record) | Below: all seven agree with the note's reading. |
| S2 engine, settings, backup | pending | | |
| S3 selector | pending | | |
| S4 one Solve view | pending | | |
| S5 corpus stall case | pending | | |
| Stop reason for an interrupted lower job | pending | | |

## S1 §7 checks (2026-11-12, mains)

Run on `master` at `77856f7` (engine identical to the M2.6 merge `846267e`) before any S2 edit was loaded, by throwaway vitest probes kept in the session scratchpad: the registry was filtered by mocking `assembleTechniqueJobs`, and each selection's raw `logical-stop` reason and final ledger were recorded by wrapping `StepSelection.select`. Every run was cut by work units (7.2M unless stated) with the time limit out of reach, so the outcomes do not depend on the machine. Power: mains (`BatteryStatus` 2). Times are one run each, informative only.

**Check 1 — the probe's filtered sets on the proposal's §2 puzzle.** The proposal does not record its sets; five were run, chosen to hold the families the proposal names.

| Set | `explain-fair@1` raw stop | Interrupted or disabled rows | `explain-fair@3` raw stop | Interrupted or disabled rows |
| --- | --- | --- | --- | --- |
| C01–C03, C22–C28, C33 | `incomplete-cheaper-tier` (1.6 s) | `c33@1` (tier 5), `work-limit` | `work-limit`, stop reason `tier-cap`, a tier-6 step | none |
| C01, C02, C22–C28 | `work-limit` | none | `work-limit` (`tier-cap`) | none |
| C01–C05, C07, C16, C24 | `incomplete-coverage` | `c24@1` (tier 6, the top tier) | `incomplete-coverage` | `c24@1` (tier 6) |
| No fish (all but C06–C09, C24) | `work-limit` | none | `work-limit` (`tier-cap`) | none |
| C01, C02, C33, C24 | `incomplete-cheaper-tier` (1.4 s) | `c33@1` (tier 5) | `incomplete-coverage` | `c33@1`, `c24@1` |

As §2.5 inferred: under `@1`, `incomplete-cheaper-tier` appears exactly when an enabled lower job (C33, interrupted by its fixed tuple bound) is `interrupted` and a tier-6 job is picked above it; under `@3` it never appears, because C33 is at tier 5 ≥ 3 and counts as settled. It never appeared with every enabled lower row exhausted or excluded. No step of any run used a switched-off family. §2.2 stands; no revision of the note is needed.

**Check 2 — a gap with no interruption.** `C01, C02, C22` under `@3`: Easy is solved (78 steps); Escargot serves C22 (tier 6, interrupted only by the run's own work limit), raw stop `incomplete-coverage`, no `incomplete-cheaper-tier`.

**Check 3 — the empty set.** Easy and Escargot under `@3` end `stalled-within-profile` / `profile-stall` with rule steps only (27 and 26 "Basic elimination" steps), highest tier −1. `FairPolicy`, `SchedulingLedger` and `coverageOf` accept the empty technique list.

**Check 4 — default identity.** The ten default keys of table 1 case 1.1 (each policy with its mode, `CLASSIC_SOLVE_LIMITS`) were computed from an archive of `master`'s `web/src/solver` and are the literals in `tests/unit/solver/technique-sets.test.ts`. The `@1` golden traces passed in the M2.6 and merged-outline gates on this engine; they are re-run unmodified with S2.

**Check 5 — the estimator under `@2`.** No fish under `explain-fair@2` on Escargot (3M units) runs to its work limit with no error; 27 steps, none by a switched-off family.

**Check 6 — detectors that use another family's code.** By reading, no file under `techniques/` other than the registry names the registry or the ledger, and a detector receives only `(view, context)`. By run: on the three production Kraken fixtures (`C24-kraken-basic`, `-franken`, `-mutant`), the `c24@1` descriptor's first 20 proposals are identical before and after the `c06@1`–`c09@1` detectors run on the same view in the same process. On the initial states of Escargot and the §2 puzzle, Kraken found no proposal within 3M units either time.

**Check 7 — interruptions below tier 3 under `@3`.** The ten unique corpus cases on the full set: the seven easy ones are solved; Escargot, Inkala 2012 and Golden Nugget end on `tier-cap` with `c33@1` (tier 5) interrupted, and the last two also `c28@1` (tier 6, `workspace-byte-limit`). No run had an interrupted row at tiers 0–2 or on a rule job, so none ends `incomplete-cheaper-tier` today.
