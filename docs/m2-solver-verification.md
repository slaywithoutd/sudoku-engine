# M2 solver verification

Updated: 2026-09-15. This record covers the isolated `feat/m2-engine` worktree and is not a release approval.

## Result

M2 is not release-complete. T19–T26 have task commits, but the final unit gate has four timeouts and benchmark calibration is incomplete. The application must continue to treat Solve as unavailable until the missing implementation and acceptance evidence is completed.

## Evidence reviewed

- T19 review fixes: `ccca518`; focused scheduling tests passed for carried terminal dependencies, the 4,096-unit Analyze window and proof-only rollout filtering. The HypotheticalSession concern was classified as not a demonstrated subcount and was not changed.
- T20–T24 commits: `b2daaaa`, `9fee076`, `5b6ed48`, `7fcdf3f`, `22a2b58`. Focused tests, typecheck and task-level diff checks passed. These establish bounded interfaces and browser scaffolding, but do not satisfy every approved end-to-end contract in the plan.
- T25: `5f0aa33`. Development browser acceptance passed (`27 passed`); production browser acceptance passed (`11 passed`). The full unit run produced `1,740 passed` and `4 failed` tests, all four being 5-second timeouts in solver/resource fixtures. A timeout is inconclusive and is not counted as approval.
- T26: `3e65f42`. The calibration and held-out corpus is separated and the benchmark schema/dry-run passed (`2 passed`). The required five cold/30 warm trials, 4× throttling, memory, transport, worker and cancellation measurements were not run. Defaults remain unvalidated and rollout remains off.

## Coverage and release interpretation

The approved catalogue contains 33 primary rows (C01–C33) and five conditional rows (U01–U05). Independently reviewed catalogue evidence for every row and alias remains recorded at the pre-T19 closure (`18c103c`) and in the coverage documents. T25 added differential and release-gate fixtures, but the failed full unit gate means this is evidence of catalogue coverage, not evidence of a releasable, fully integrated M2.

Still unproven for release: complete task-plan implementation, full proof transport/acceptance semantics, real solver execution through the production worker/controller/UI path, all cancellation and reload races, whole-suite correctness without timeouts, and calibrated resource defaults. No row is silently removed to improve results; conditional rows remain separate and cannot qualify a result as Perfect.

## Final command record

| Check | Result | Interpretation |
| --- | --- | --- |
| `npm run typecheck` | passed | TypeScript contracts compile. |
| `npm test` | 1,740 passed, 4 timed out | Incomplete; timeout is not approval. |
| `npm run build` | passed | Production bundle builds. |
| `npm run test:e2e` | 27 passed | Development browser gate passed. |
| `npm run test:e2e:production` | 11 passed | Production smoke gate passed; dev-only harness suites are excluded. |
| `npm run bench:solver` | 2 passed | Schema/dry-run only; no calibration claim. |
| `git diff --check` | passed | No whitespace errors in reviewed changes. |

## Required follow-up

Resolve or explicitly classify the four unit-test timeouts, complete the missing T20–T24 contract paths, run the full benchmark matrix, and rerun final acceptance gates. Until then, keep rollout disabled and do not mark M2 complete. Gameplay hints and variants remain outside M2.
