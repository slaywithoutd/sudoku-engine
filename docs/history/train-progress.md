# Training puzzles implementation progress

Record kept during the milestone. Spec: [training puzzles](../specs/2026-11-10-training-puzzles.md), approved under D106. Branch `feat/train`, one reviewed commit per task.

| Task | State | Commit | Evidence |
| --- | --- | --- | --- |
| Approval | done | `b3d81c3`, merge `92d5d89` | D106, roadmap row, README line; `docs/training-puzzles` merged. |
| T1 pack | done | see git log (`feat(train): T1`) | 500 positions; 502 independent checks pass; full rebuild byte-identical (`TRAIN_PACK=check`, 956 s). Review fixes are in the task commit: they changed the pack, which had to be rebuilt. |
| T2 domain and storage | pending | | |
| T3 run screen | pending | | |
| T4 hub and statistics | pending | | |
| T5 explanation | pending | | |
| T6 timed run | optional | | |

## T1 pack (2026-11-13)

Power: mains (`BatteryStatus` 2), CPU 1.6 GHz (slow state).

- First harvest probe with the full technique set and a 40M-unit budget ran at well over 2 s per seed: hard generated puzzles spent the budget in tier >= 3 searches. The builder now runs Explain with the M2.7 `up-to-wings-fish@1` set (tiers 0-2) and a 4M-unit budget; a tier <= 2 step is never set-limited under that set, so the "no simpler step" label is unchanged. About 0.7 s per seed.
- Probe over the first 125 seeds: about 29 technique positions per 100 seeds (C04, C11, C10 common, C06 rare, no C05 or C13).
- Full build (`TRAIN_PACK=write`, 861 s): 500 positions from 863 seeds and 373 source puzzles (at most 3 each). Scan 200 (cap); C04 subsets 116, C11 wings 107, C10 single-digit patterns 65, C06 fish 12. Tiers 0/1/2: 200/116/184. 331,142 bytes, sha256 `f51d3cf3…20b4`.
- `npx vitest run tests/unit/training-pack.test.ts`: 502 passed (3.2 s).
- Independent review: no acceptance bug; one medium finding: 184 of 300 technique positions (every C06, C10 and C11 entry) had no pattern cells, because the engine's presentation-only `patternCells` read only `cell`/`cells` keys. Fixed in `src/solver/classic-run.ts`: it also reads the wing (`pivot`, `wings`, `endpoints`, `bridge`), short-path (`vertices`) and fish fields (`fins`, and the base houses' cells that hold the fish digit in the candidates before the step); chain vertices are still walked as objects. Presentation only: the Solve screen now also highlights these patterns' cells. Pinned by `tests/unit/solver/pattern-cells.test.ts`. Also from the review: the builder asserts that a step's `values` are the board before plus its placements; the checker holds its own tier table, requires pattern cells on technique positions and follows imports transitively; a puzzle no longer keeps a slot for a scan position once scans are at their cap.
- Rebuild (`TRAIN_PACK=write`, 738 s): 500 positions from 849 seeds and 368 source puzzles (at most 3 each). Scan 200; C04 120 (cap); C11 106; C10 63; C06 11. Tiers 0/1/2: 200/120/180. Every technique position has pattern cells. 333,076 bytes, sha256 `f1a3a48e…1d80`. Checks: 502 + 40 passed.
- Byte identity: `TRAIN_PACK=check npx vitest run tests/unit/training-pack-build.test.ts` rebuilt the whole pack and compared it with the committed file: 3 passed (956 s), sha256 unchanged. Mains, 1.6 GHz.
