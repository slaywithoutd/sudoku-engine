# M2.7 implementation progress

Record kept during the milestone. Spec: [proposal](../specs/2026-10-22-technique-selection-and-solve-views.md) and [S1 note](../specs/2026-11-10-technique-set-semantics.md), approved under D105. Branch `feat/m27-technique-selection`, one reviewed commit per task.

| Task | State | Commit | Evidence |
| --- | --- | --- | --- |
| Approval | done | `251be06`, merge `77856f7` | D105, roadmap row, README line; `docs/technique-set-semantics` merged and its worktree removed. |
| S1 §7 checks | done | (this record) | Below: all seven agree with the note's reading. |
| S2 engine, settings, backup | done | `4773fce`, review fix (next commit) | S1 §6 tables 1–5; below. |
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

## S2 (2026-11-12, mains)

Engine, settings and backup as the S1 note §5 (D105). Acceptance, each command from `web/`:

- `npx vitest run tests/unit/solver/technique-sets.test.ts`: tables 1 (ten default keys byte-identical to literals recorded from `master`; full set in any order omitted from the key; identical descriptors; a run with no selection and with `all@1` emit identical events), 2 (pinned preset lists, key canonicalisation, error codes, the `techniques` field between `rollout` and `tierCap`), 3 (nine sets × seven cases under `explain-fair@3`, the five presets under `explain-fair@1`, assertions 3.1–3.4, 3.7 and 3.8 each, every outcome pinned in `tests/solver/fixtures/technique-set-outcomes.json`; 3.5 and 3.6 at the selection level), 5.5. 37 passed.
- `npx vitest run tests/unit/solver/technique-sets-corpus.test.ts`: table 4 on all 131 corpus cases under `all@1`, `singles@1`, `no-fish@1` and the empty set: identical count and solution equal to the label, one exact phase per run, no step contradicts the solution, solved runs end on it. 131 passed.
- `npx vitest run tests/unit/backup.test.ts tests/unit/solver/solve-request.test.ts`: table 5.1–5.4 and the worker request.
- Unchanged and passing: `golden-traces`, `result-contract`, `policies-v3`, `count-first`, `policies`, `classic-run`, `scheduling`, `protocol`, `solver-copy`, `library`, `tests/storage` (81 passed, 4 env-gated skips, 707 s).

Budgets in table 3: the singles cases need about 650k logical units even on the full set (Easy: 78 steps), so they run at 1.2M; the hard cases at 600k, enough for the count, the basic eliminations (≈ 200k) and a climb to the enabled tiers. Within those budgets no hard case takes a technique step above tier 0, so a set-limited step needs a gap at tier 0: "no hidden single" (C02 off) gives 6 on `seventeen`.

Review (independent subagent): no bug found. Fixed: the worker request now uses one field name (`techniqueSelection`) end to end and rejects any unknown key (`invalid-solve-request`), so a misspelt selection cannot run the full set (`workers/solve-request.ts`, unit-tested); `assembleRunJobs` takes the profile and the set from the normalised options; table 3 runs every assertion under both policies with the outcomes pinned; 3.5 now requires the interrupted job to be below the blocked tier; the corpus test is one test per case with `all@1` explicit; the architecture and scheduling docs and the note's §5.6 point at the D105 version bump. Not changed: `sameRun` stays private (two different `optionsKey`s make it false by its definition, `evidence.ts:194`); `Settings.solverTechniquePreset` stays `string` so a later preset needs no type change.

Open risk, accepted by D105: the build writes `formatVersion` 3 on its first commit even if the user never touches technique sets, so after a rollback an older build refuses the library with "Unsupported data version." until the newer build is restored.
