# M2.7 implementation progress

Record kept during the milestone. Spec: [proposal](../specs/2026-10-22-technique-selection-and-solve-views.md) and [S1 note](../specs/2026-11-10-technique-set-semantics.md), approved under D105. Branch `feat/m27-technique-selection`, one reviewed commit per task.

| Task | State | Commit | Evidence |
| --- | --- | --- | --- |
| Approval | done | `251be06`, merge `77856f7` | D105, roadmap row, README line; `docs/technique-set-semantics` merged and its worktree removed. |
| S1 §7 checks | done | (this record) | Below: all seven agree with the note's reading. |
| S2 engine, settings, backup | done | `4773fce`, review fix (next commit) | S1 §6 tables 1–5; below. |
| S3 selector | done | `e7af297`, review fix `efebe52` | `tests/e2e/solver-techniques.spec.ts`; below. |
| S4 one Solve view | done | `eddae59`, review fix (next commit) | `tests/e2e/solver-view.spec.ts`; below. |
| S5 corpus stall case | done | (next commit) | `tests/unit/solver/stall-case.test.ts`; below. |
| Stop reason for an interrupted lower job | done | (next commit) | `tests/unit/solver/stop-reason.test.ts`; below. |

## S1 §7 checks (2026-11-12, mains)

Run on `master` at `77856f7` (engine identical to the M2.6 merge `846267e`) before any S2 edit was loaded, by throwaway vitest probes kept in the session scratchpad: the registry was filtered by mocking `assembleTechniqueJobs`, and each selection's raw `logical-stop` reason and final ledger were recorded by wrapping `StepSelection.select`. Every run was cut by work units (7.2M unless stated) with the time limit out of reach, so the outcomes do not depend on the machine. Power: mains (`BatteryStatus` 2). Times are one run each, informative only.

**Finding (made during S5):** the proposal's §2 puzzle, `1....7.9..3..2...8..96..5....53..9...1..8...26....4...3......1..4......7..7...3..`, is AI Escargot, character for character the corpus case `escargot`. The proposal took it for "a second instance of the same stall"; it is the same puzzle. Checks 1 and 7 below therefore ran the same grid under different sets.

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

## S3 (2026-11-12)

Selector in the Solver settings section (Settings screen and the Solve screen's options): the five presets and Custom, the custom set as one checkbox per family grouped by tier with Switch all on/off. A default ("All") run sends the same worker request as before. Acceptance: `npx playwright test tests/e2e/solver-techniques.spec.ts`, 2 passed: No fish on the proposal's §2 puzzle (Escargot) keeps the count line and changes the coverage shown (33 families partitioned under All; 28 plus the five fish families "not selected" under No fish, none of which has a step); a custom set is edited, survives a reload, is kept when a preset is chosen, and the empty set runs.

Review (independent subagent): no bug. Fixed in `efebe52`, applied after the S4 commit: request shape and custom-set edits moved to `ui/technique-selection.ts` and unit-tested (ids of rows the screen does not show are kept); an empty set's stall names no tier; one note sentence when a step is both budget- and set-limited; "Solved with the selected techniques" for a restricted run; the e2e checks the coverage partition and the real fish names. Kept: the selector offers the 33 classic rows (the Solve screen runs `classic-expanded@1`); Custom with nothing off sends `{off: []}`, which the engine reads as the full set.

## S4 (2026-11-12)

The Analyze/Explain switch and the `solverView` setting are gone; the step list is the only view and the summary is a `<details>` header above it, collapsed to one row. Acceptance: `npx playwright test tests/e2e/solver-view.spec.ts`, 3 passed: no toggle; the header carries count verification, logic status, highest tier used, steps per tier, coverage counts and lists; the step list equals the engine's own steps on `easy`, `hidden-singles` and `seventeen`; a gap set's header counts its set-limited steps.

Found while doing S4: the step list kept the live steps array as its cache key, so steps arriving during a run were never listed once the list had rendered mid-run ("Step 1 of 78" with one item). Latent before S4 in the Explain view; fixed in `eddae59`.

Review (independent subagent): fixed in the review commit: the Show solution toggle is created once (keeps focus, `aria-pressed` carries the state), sits under the step card, and shows the grid where the logic stopped when there is no solution; each run's header starts collapsed; the step list appends during a run instead of rebuilding; "Highest tier used" only with steps; phrasing content in `<summary>`; the error text in the collapsed row; stale Analyze/Explain wording in help, home, README and roadmap. Found by screenshots: the nowrap header row widened the whole side panel past the viewport (fixed with `min-width: 0`), and the six preset buttons wrapped unevenly (now an even grid).

Power and speed: the laptop went onto battery during S4 and, back on mains, stayed in its slow state (CPU at 1.6 GHz; the engine alone ran Escargot's 1.8M-unit budget in 24–33 s, against about 9 s earlier in the day; `master`'s code measured the same, with the identical result). The solver-screen test "Escargot at the 15 s preset … reports where logic stalled" then hits the 15 s time safety stop ("stopped at tier 4 by the time limit") instead of the tier cap. It passed on mains in the fast state at S3 (`e7af297`) and is re-run in the final gate.

## S5 (2026-11-12)

The proposal's §2 puzzle is AI Escargot, already the evaluation corpus case `escargot` (count `1`, its solution checked against the reference DFS and the Algorithm X oracle by `exact-reference.test.ts`). Adding it again would run every corpus-driven test on it twice and change the 131-case count that several records cite, so no case is added: `tests/unit/solver/stall-case.test.ts` pins that the proposal's string is `escargot` and the only corpus case with that grid, that the oracle finds exactly one solution equal to the stored one, and that the classic run ends `incomplete` or `stalled-within-profile` with count `unique` and that solution, asserting no solving technique. The duplicate "stall" case was removed from table 3 of `technique-sets.test.ts` and its pinned outcomes. `npx vitest run tests/unit/solver/stall-case.test.ts tests/unit/solver/technique-sets.test.ts`: 3 and 37 passed (mains, slow state).

Deviation from the proposal's S5 row ("add the §2 puzzle to the evaluation corpus"): the puzzle was already there under another name; its acceptance (count unique, stored solution matching the Algorithm X oracle) is met by the existing case and pinned by the new test.

## Stop reason for an interrupted lower job (D105 item 8, 2026-11-12)

`humanSteps` keeps the selection's `incomplete-cheaper-tier` instead of rewriting it to `logical-budget`, and `stopReasonOf` reports it as the new `StopReason` `lower-interrupted`, after `time-limit` and ahead of `tier-cap` (the interruption is what ended the phase). The Solve screen says "Logic: stopped at tier n: a technique or basic rule was interrupted by its resource limit, so higher tiers were not tried" (wording after review). Acceptance: `npx vitest run tests/unit/solver/stop-reason.test.ts tests/unit/solver/result-contract.test.ts tests/unit/solver/human.test.ts tests/unit/solver/run.test.ts tests/unit/solver-copy.test.ts tests/unit/solver/golden-traces.test.ts`: 31 passed (268 s, mains, slow state). The end-to-end case is S1 check 1: Escargot under `explain-fair@1` with C01–C03, C22–C28 and C33 stops with C33 interrupted and now reports `lower-interrupted`; under `@3` it climbs to tier 6. Golden traces are unchanged (they record `human`, which stays `incomplete`).

Review (independent subagent): no bug in the engine path. Fixed: the first copy said "a simpler technique was interrupted", which contradicted the real case (the interrupted job, C33, is at tier 5, the tier named); it now claims neither "simpler" nor which job, and says "a basic rule was interrupted" when no technique was served. The doc comment and architecture line mention `disabled` under conditional profiles and the old "work limit or tier cap" report. The tests assert C33 capped at tier 5, the composed line, and `tier-cap` under `@3`. Table 3's pinned outcomes still hold with the new reason (37 passed). The S1 note §2.4 describes the rewrite as it was before this task and is kept as written.
