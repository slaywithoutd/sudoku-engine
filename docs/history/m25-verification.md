# M2.5 engine verification

Updated: 2026-10-16. This record covers T17 of the [M2.5 plan](../plans/2026-09-18-m25-engine.md) on `feat/m25-engine` and is the acceptance evidence for merging it into `master` (D100, D101).

## Result

The whole-suite gate passes at `06b9364` (T16) plus documentation-only commits: zero failed tests and zero timeouts under the project configuration, typecheck clean, lint with zero errors. The coverage-test failure the plan expected is already gone. At D097's old 5-second limit, four slow tests time out, and none of them fails an assertion (see below). M2.5 is ready to merge. Its limits are the ones already recorded: both `@2` policies ship disabled (D101), Analyze is unmeasured, and D063's browser benchmark matrix is still the separate gate for time and rollout defaults.

## Environment

Windows 11 Pro 10.0.26200, Node v24.19.0, npm 11.17.0, dependencies from `npm ci` in `web/`. Every command ran from `web/`, one at a time, with nothing else heavy running on the machine.

## Command record

| Check | Result | Interpretation |
| --- | --- | --- |
| `npm test` | 82 files passed; 1,876 tests passed, 6 skipped, 0 failed, 0 timed out; 1,041.55 s (17:58:50–18:16:12 -03:00); exit 0 | Whole-suite gate passed. |
| `npm run typecheck` | `tsc --noEmit && tsc -p tsconfig.worker.json --noEmit`, exit 0, 6 s | Both TypeScript configurations compile. |
| `npm run lint` | 0 errors, 3,301 warnings, exit 0, 44 s | Lint gate passed; ESLint exits 0 and the warnings are style rules such as `id-length`, `max-lines-per-function` and `no-non-null-assertion`. |
| `npx vitest run tests/unit/solver --testTimeout=5000` | 72 files, one at a time (`fileParallelism: false`); 1,785 passed, 6 skipped, 4 failed, all four `Test timed out in 5000ms`; 810.68 s | D097 re-run: the solver folder at D097's 5-second limit, see below. |
| each of the four, alone, `npx vitest run <file> -t "<name>"` at the 120 s project default | three passed, one timed out | On battery power; see below. |

The tests ran from the working tree at `bd2e1b4` plus this record; `bd2e1b4` (closing-review fixes) and this commit change documentation only. The 6 skips are environment-gated bench builders that only run when their variable is set: `build-corpus.test.ts` (`CORPUS`), `bench-sample.test.ts` (`SAMPLES`) and `bench-ablate.test.ts` (`ABLATE`). Their outputs, the corpus, model-1 and the ablation, were produced and recorded at T13–T15 ([corpus](m25-corpus.md), [ablation](m25-ablation.md)).

## Known failures carried into T17

- **`coverage.test.ts › preserves exact UTF8 matrix bounds for every catalogue row`.** The plan lists it as a known failure on `master`. It was already fixed before M2.5 branched: `afc1b1b` (2026-09-17) points the test at `docs/history/superpowers/specs/2026-09-12-m2-technique-coverage.md`, where `9e09c98` had moved the coverage matrix. The file is present on this branch and on `master`, and the test passes alone (6 of 6 in `coverage.test.ts`) and in the full run. No change was needed.
- **The four D097 timeouts.** D097 records "1,740/1,744 unit tests with four timeouts"; [m2-solver-verification](m2-solver-verification.md) calls them "four 5-second timeouts in solver/resource fixtures". Neither names the tests. The same day, `8182042` set `fileParallelism: false` and a 120-second default `testTimeout` in `vite.config.ts`, and the next full run passed 1,745 of 1,745 (`f156963`). Since the names are lost, T17 re-ran every solver test file, one file at a time, with D097's 5-second default restored on the command line (per-test allowances written in the tests still apply). Exactly four tests timed out:

  | Test | Time at the 5 s limit | Alone, 120 s default (on battery) |
  | --- | --- | --- |
  | `classic-run.test.ts` › explains and independently verifies a unique puzzle | 5.99 s | passed, 7.41 s |
  | `exact-variants.test.ts` › a 9x9 killer with no givens reaches a count within the node budget | 15.73 s | passed, 42.39 s |
  | `set-arguments.test.ts` › c21@1 closes owned resources across all termination paths | 7.57 s | passed, 22.96 s |
  | `variants-composition.test.ts` › 300 generated mixed problems … | 38.14 s | timed out at 120 s (124.8 s alone, 123.9 s with its file) |

  Two of them are M2.5 tests (T06, T10) and could not be among D097's four; whether `classic-run` and `set-arguments` were is unknown. All four are wall-time only: each passed in the full run under the project's 120 s default, and no assertion failed at either limit. Twenty-one other tests take more than 5 s but carry their own allowance.

  **Battery power.** The single-test re-runs ran after the laptop had switched to battery (`Win32_Battery.BatteryStatus` 1, Balanced plan). On battery `foundation.test.ts` took 133.60 s, against 48.85 s alone on mains power earlier the same afternoon (a 2.7× slowdown). The covers test then hit its own 120 s allowance and failed. The full run, typecheck, lint and the 5-second folder run all finished before the switch, and their timings match the earlier runs. At mains speed, the 300-problem composition test needs about 38 s, under a third of the 120 s default. On battery it needs about 125 s, over the limit, so it has no margin for a throttled machine. That is a harness-allowance question, not a correctness one. It was left unchanged and is recorded as a follow-up: an explicit measured allowance, as M2 did for its long BUG and ALS cases.

## Known documentation gap

D101 and [m25-ablation](m25-ablation.md) link to `docs/specs/2026-09-22-m26-engine-hardening.md`, the M2.6 draft. That draft is not committed on this branch or on `master`, so both links are dangling until it is. They were left as written because committing the M2.6 draft is outside M2.5.

## Closing-block review (T16–T17)

An independent reviewer that had not seen the implementation reasoning reviewed the T16 documentation diff (`06b9364`) against the code, tests and decisions and returned **PASS** with seven Low findings. Six were wording fixes, applied in `bd2e1b4` (`fix(solver): closing review`):

1. `architecture.md`: the geometry grep covers a fixed list of rule, linear and killer files, not every new production file.
2. `architecture.md`, `killer.md`: `profileFor` selects a variant profile when a constraint other than `all-different@1` is present, so a diagonal-only board keeps `classic-expanded@1`.
3. `architecture.md`: model-1 records the corpus and trainer hashes; load-time validation covers the feature schema and table shape, and the digest is pinned in tests.
4. `architecture.md`, `scheduling.md`: the decay formula carries its floor, `max(1, hit >> …)`.
5. `scheduling.md`: tiers 0–2 stay byte-identical to `@1` at the default `scoreFromTier` (any value ≥ 3).
6. `scheduling.md` and the spec status line: Analyze was not measured; it is not disabled because A, B and D failed.

The seventh, a missing T16 row in the progress record, is closed by the T16 and T17 rows added with this record.

A second independent reviewer then checked the T17 changes (this record, the progress rows, the roadmap and README lines) against the plan and the raw command output. The result was **FAIL**, with two Medium and four Low findings, all fixed in this commit:

- **M1.** The first D097 re-run covered two hand-picked files and claimed they matched the description. It is replaced by the full solver-folder run at 5 seconds above.
- **M2.** The review outcome pointed back and forth between this record and the progress record. It is now written here and summarized in the T17 row.
- **L1.** The quoted timeout phrase is now credited to m2-solver-verification, not D097.
- **L2.** `feat/m25-engine` is moved to the T17 commit before merging.
- **L3, L4.** Hashes replace commit messages, except in the T17 row. A commit cannot carry its own hash, so that row names the commit that adds this record.

No further review round ran after these fixes.

## Merge

`feat/m25-engine` merges into `master` with a merge commit that references D100 (design approval) and D101 (the `@2` default decision). The merge is not done as part of this record; it waits for the user's go-ahead.
