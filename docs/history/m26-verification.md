# M2.6 engine hardening verification

Updated: 2026-11-11. This record covers T11 of the [M2.6 spec](../specs/2026-09-22-m26-engine-hardening.md) on `feat/m26-hardening` and is the acceptance evidence for merging it into `master` (D103). Progress and per-task evidence: [implementation progress](m26-implementation-progress.md); benchmark: [m26-benchmark](m26-benchmark.md); ablation: [m25-ablation](m25-ablation.md), section "M2.6 refresh".

## Result

The whole-suite gate passes at `def640f`: zero failed tests and zero timeouts in vitest under the project configuration, typecheck clean, lint with zero errors, and the Playwright suite (Chromium) with zero failures. The first suite run, at `082e5a4`, had one real failure, caused by a review fix made in this closing block and fixed in `def640f` (below). The four D097 tests pass alone. M2.6 is ready to merge, with the misses and limits already recorded in D103: the §6 time targets for the easy puzzle and the Escargot count are met only in the laptop's fast state, a tier-5/6 step is found on Golden Nugget only (accepted), and the benchmark matrix is Chromium only.

## Environment

Windows 11 Pro 10.0.26200, Intel Core i5-1345U, Node v24.19.0, npm 11.17.0, Playwright 1.63.0 (bundled Chromium). Every command ran from `web/`, one at a time, with nothing else heavy running. **Power: on mains for every run** (`Win32_Battery.BatteryStatus` 2, read before and after each run).

## Command record

| Check | Commit | Result | Duration |
| --- | --- | --- | --- |
| `npm test` (first run) | `082e5a4` | 88 files: 87 passed, 1 failed; 2,176 passed, 10 skipped, **1 failed**; exit 1 | 1,808.6 s (02:56–03:26 -03:00) |
| `npx vitest run tests/unit/solver/bench-sample.test.ts` | `def640f` (sample.ts restored) | 4 passed, 2 skipped | 16.8 s |
| `npm run typecheck` | `def640f` | `tsc --noEmit && tsc -p tsconfig.worker.json --noEmit`, exit 0 | 4 s |
| `npm run lint` | `def640f` | 0 errors, 3,342 warnings, exit 0 | 48 s |
| `npm test` (gate) | `def640f` | **88 files passed; 2,177 passed, 10 skipped, 0 failed, 0 timed out**; exit 0 | 1,183.1 s (03:28–03:48 -03:00) |
| `npm run test:e2e` | `def640f` | **52 passed, 1 skipped, 0 failed**; exit 0 | 2.0 min (03:48–03:51) |
| the four D097 tests, each alone (`npx vitest run <file> -t "<name>"`, 120 s default) | `def640f` | 4 of 4 passed | 7.1 s, 6.0 s, 16.9 s, 24.6 s |
| `M26_DETERMINISM=1 npx vitest run tests/unit/solver/count-first.test.ts -t "three runs"` | `07db66f` (production code identical to `def640f`; only `policies-v3.test.ts` differs) | 131 of 131 cases identical over three runs at 60 s | 399.9 s |

The lint warnings are style rules (`id-length`, `max-lines-per-function`, `no-non-null-assertion` and similar); M2.5 closed with 3,301.

The 10 vitest skips are environment-gated: the ablation run and report (`ABLATE`, 2), the sample build and train (`SAMPLES`, 2), the corpus build and assemble (`CORPUS`, 2), the 60 s determinism check (`M26_DETERMINISM`, 1, run separately above) and the three wall-clock tier checks in `policies-v3.test.ts` (3, timing evidence is in T05 and the benchmark). The Playwright skip is `solver-m26-benchmark.spec.ts`, gated by `M26_BENCH` (T08's benchmark).

Playwright covers the specs T07 lists: `solver-screen.spec.ts` 7 of 7 passed, including Norvig `hard1` at the 15 s preset showing "Multiple solutions" (2.6 s), Escargot at the 15 s preset verified unique in under a second with the stall line (5.2 s), and conflicting clues running to "No solution" (2.0 s); `solver-worker.spec.ts` and `solver-benchmark.spec.ts` passed; the other app specs were run as well (52 in all).

## Failures and dispositions

- **`bench-sample.test.ts › model-1 is well formed and carries its identity`, real, fixed.** `fix(solver): b9dfaf2 review` (`c12ef34`) also changed `sampleCase` in `tests/solver/bench/sample.ts` so that it would retain effect-free steps. That file is hashed into model-1's trainer identity (D094: one policy version, one weight table), so the pinned `trainerHash` no longer matched. Not pre-existing and not load-dependent: it fails deterministically on any machine. `def640f` restores `sample.ts` to its `b9dfaf2` content (the sampler runs `explain-fair@1`, which has produced no effect-free step on the corpus); the test passes alone and in the gate run. A future sampler under an `@3` policy needs the retain branch together with a new model identity.
- No other failure, flake or timeout in any run.

D097's four 5-second timeouts are the tests M2.5 identified ([m25-verification](m25-verification.md)): `classic-run.test.ts` › explains and independently verifies a unique puzzle, `exact-variants.test.ts` › a 9x9 killer with no givens reaches a count within the node budget, `set-arguments.test.ts` › c21@1 closes owned resources across all termination paths, and `variants-composition.test.ts` › 300 generated mixed problems. All pass alone at the project's 120 s default and in the gate run. The composition test, which timed out alone on battery in M2.5 (124.8 s), takes 24.6 s here on mains.

## §6 targets

Timing targets were measured in T02–T08, not re-measured in T11; their numbers and power states are in the [benchmark](m26-benchmark.md) and the progress record and summarized in D103. Power state is the laptop's on mains in all of them; none was confirmed on battery.

| Target | Result | Power state, evidence |
| --- | --- | --- |
| Exact count < 1 s on every corpus case; `hard1` < 5 s | **met** (≤ 642 ms; `hard1` 1.6–2.6 s Chromium, 2.1–2.8 s vitest) | mains, both laptop states; T02, T08 |
| Escargot count < 50 ms | **met in the fast state** (34–46 ms), **missed in the slow state** (64–185 ms) | mains; T08 |
| 0 disagreements vs reference DFS and Algorithm X oracle | **met**: 131 of 131 against each (`exact-reference.test.ts`, in the gate run) | power-independent |
| Easy puzzle, Explain < 1 s | **met in the fast state** (0.5–0.6 s), **missed in the slow state** (0.9–9.3 s) | mains; T08 |
| 17-clue puzzle, Explain < 3 s | **met** except one slow-state run of four (4.2 s) | mains; T08 |
| Escargot, Inkala 2012, Golden Nugget reach tier ≥ 5 at 15 s | **met** | mains; T05, T08 |
| ≥ 1 tier-5/6 step each | **missed on Escargot and Inkala 2012** (Golden Nugget only), accepted by the user as a known limit of the chain/forcing detectors | mains; T05, T08 |
| Engine Analyze ≥ 1 step on every unique case | **met** (27–90 steps) | T05, T08 |
| Determinism, 3 runs at 60 s | **met**: 131 of 131 identical on the final defaults (this record, mains) and both Chromium runs (T08) | mains; not measured on battery |
| UI: `hard1` "Multiple solutions" at 15 s; stop reason and coverage | **met** (Playwright, this record) | mains |

## Closing-block reviews

Independent reviewers that had not seen the implementation reasoning reviewed `b9dfaf2`, T09 (`0c620da`) and T10 (`07db66f`):

- `b9dfaf2`: no defect. Production code supplies `accept` only in `classic-run.ts` and `run.ts`; replay and the conditional profile already retain effect-free steps; `@1`/`@2` traces cannot change. Low findings: two test helpers committed every step (fixed in `c12ef34`, one of them reverted in `def640f`, above); tier caps reset on a same-revision advance, as spec §4.4 states; an effect-free step counts toward the difficulty tier and shows "No change" (recorded, not changed).
- T09/T10: one High finding (a review claim written before the review ran) and four Medium (the 3-run determinism check had not been re-run on the final defaults; the `@1`/`@2` trace claim was broader than the evidence; the ablation run count; the pending `master` merge), plus seven Low wording findings. All fixed in `34b3696` (`fix(solver): T09 review`) and `4bd2fe0` (`docs: T10 review`); the determinism check was run (above), and `master` was merged in `082e5a4`. No further review round ran.

## Open items

- §6 time targets for the easy puzzle and the Escargot count are missed in the laptop's slow state; nothing was measured on battery.
- The D063 browser matrix is Chromium only; Firefox and WebKit are not installed.
- Tier-5/6 steps on Escargot and Inkala 2012: the detector-performance proposal (`docs/detector-performance`, not approved) addresses it.
- At 15 s, a grid whose exact count costs more than 1.44M units runs the logical phase before its count is known (T08).
- Against the M2.5 §3.12 gate, `explain-fair@3` fails D and F (ablation refresh); its default status rests on D103.
- The two behaviours recorded from the `b9dfaf2` review (cap reset on a proof-only step; effect-free steps in the difficulty tier and their "No change" card).

## Merge

`feat/m26-hardening` merges into `master` with `git merge --no-ff` and a message that references D103, on the user's go-ahead given for this session (2026-11-11). Nothing is pushed.
