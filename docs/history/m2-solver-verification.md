# M2 solver verification

_Historical record, kept as written on 2026-09-15. Branch and worktree names it mentions no longer exist; everything is on `master`._

Updated: 2026-09-15. This record covers the isolated `feat/m2-engine` worktree and is not a release approval.

## Result

M2 is not release-complete. T19–T26 have task commits and the post-cleanup final unit gate passed, but benchmark calibration and remaining release acceptance evidence are incomplete. The application must continue to treat Solve as unavailable until those gates are completed.

## Evidence reviewed

- T19 review fixes: `ccca518`; focused scheduling tests passed for carried terminal dependencies, the 4,096-unit Analyze window and proof-only rollout filtering. The HypotheticalSession concern was classified as not a demonstrated subcount and was not changed.
- T20–T24 commits: `b2daaaa`, `9fee076`, `5b6ed48`, `7fcdf3f`, `22a2b58`. Focused tests, typecheck and task-level diff checks passed. These establish bounded interfaces and browser scaffolding, but do not satisfy every approved end-to-end contract in the plan.
- T25: `5f0aa33`. Development browser acceptance passed (`27 passed`); production browser acceptance passed (`11 passed`). The earlier full unit run produced `1,740 passed` and four 5-second timeouts in solver/resource fixtures; that timeout record remains historical and was not approval.
- T26: `3e65f42`. The calibration and held-out corpus is separated and the benchmark schema/dry-run passed (`2 passed`). The required five cold/30 warm trials, 4× throttling, memory, transport, worker and cancellation measurements were not run. Defaults remain unvalidated and rollout remains off.
- Post-cleanup verification: `npm run typecheck` passed; `npm test` exited 0 with 61 files and 1,745 tests passed in 827.16 seconds; `npm run build` passed in 1.89 seconds; development E2E passed 27/27 in 36.3 seconds; production E2E passed 11/11 in 20.2 seconds; and `git diff --check` passed. This proves the fresh whole-suite gate, not the missing benchmark or release gates.

## Coverage and release interpretation

The approved catalogue contains 33 primary rows (C01–C33) and five conditional rows (U01–U05). Independently reviewed catalogue evidence for every row and alias remains recorded at the pre-T19 closure (`18c103c`) and in the coverage documents. T25 added differential and release-gate fixtures, and the fresh full unit gate is green; neither result is evidence of a releasable, fully integrated M2.

Still unproven for release: complete task-plan implementation, full proof transport/acceptance semantics, real solver execution through the production worker/controller/UI path, all cancellation and reload races, and calibrated resource defaults. No row is silently removed to improve results; conditional rows remain separate and cannot qualify a result as Perfect.

## Final command record

| Check | Result | Interpretation |
| --- | --- | --- |
| `npm run typecheck` | passed | TypeScript contracts compile. |
| `npm test` | 61 files, 1,745 passed in 827.16 seconds | Fresh whole-suite gate passed. |
| `npm run build` | passed in 1.89 seconds | Production bundle builds. |
| `npm run test:e2e` | 27 passed in 36.3 seconds | Development browser gate passed. |
| `npm run test:e2e:production` | 11 passed in 20.2 seconds | Production smoke gate passed; dev-only harness suites are excluded. |
| `npm run bench:solver` | 2 passed | Schema/dry-run only; no calibration claim. |
| `git diff --check` | passed | No whitespace errors in reviewed changes. |

## Required follow-up

Complete the remaining T20–T24 end-to-end contract evidence and the full benchmark matrix, then rerun any final acceptance gates affected by that work. Until then, keep rollout disabled and do not mark M2 complete. Gameplay hints and variants remain outside M2; numerical resource defaults remain unvalidated.
