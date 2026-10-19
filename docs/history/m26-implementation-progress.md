# M2.6 implementation progress

Branch `feat/m26-hardening`, worktree `.claude/worktrees/gifted-feistel-d36469`, from 2026-10-16. Spec: [M2.6 engine hardening](../specs/2026-09-22-m26-engine-hardening.md), approved under D103. One reviewed commit per task, each followed by an independent review (`fix(solver): <task> review`). Every timing names its power state: the laptop (Intel Core i5-1345U, Windows 11, Node v24.19.0) runs about 2.7x slower on battery.

| Task | Commit | Acceptance evidence | Review |
| --- | --- | --- | --- |
| T01 evaluation corpus, reference DFS, baseline | `c51de80` | `exact-reference.test.ts`: engine = reference on 131 cases; baseline in [m26-baseline](m26-baseline.md) (battery) | `2883163` (assembly zero, full regeneration check, Node version, README scope); merged to `master` at `ffbd872` |
| T02 exact propagation (`original-dfs@2`) | `5b0ee1b` | see below; `npm test` 83 files, 2,010 passed, 6 skipped, 0 failed (2,379 s, mains then battery); typecheck clean | `fix(solver): T02 review`: no soundness defect (reviewer's 600-problem 4x4/6x6 variant differential matched the oracle); units now count only what §4.1 lists, reservation bounded by full-house pairs, per-node unit bound asserted, 6x6 in the property test |
| T03 count-first pipeline | pending | see below; `npm test` 84 files, 2,013 passed, 7 skipped, 0 failed (2,229 s, mains); typecheck clean | pending |

## T02

Exact search: bulk naked and hidden singles, locked candidates over every pair of full all-different houses that share two or more cells, module prune hooks in the same loop, child frames inherit the parent's fixed-point masks, one work event per node, the `seen` set dropped, `EXACT_METHOD = "original-dfs@2"`.

- T01 green with `norvig-hard1` included (no heavy case left): 133 tests, about 10 s, mains.
- `norvig-hard1` 2.95 s on mains, 7.1–7.5 s on battery (target < 5 s, met on mains), every other case < 20 ms (< 1 s), Escargot 14–16 ms; mains, two passes ([m26-baseline](m26-baseline.md) T02 row).
- `exact-variants.test.ts` green, plus a new property test: the exact fixed point never removes a value used by a known solution, on 40 generated mixed problems and the unique corpus grids; a deliberately unsound locked-candidate rule fails it.
- `exact.test.ts`: the accounting test is re-pinned (one work event per node; the empty root counts 82 units = 1 + 81 masks; every node at most 1 + 81 + 81 + 27) because `@2` reports a node's operations in one event instead of one unit per cell scan.
- **Open:** "node counts ≤ baseline on every case" fails on five multi-solution grids by 1–3 nodes (all 48 exhaustive cases are at or below baseline). Raised for a decision; T02 proceeds with the spec's MRV and lowest-index ties until then.

## T03

Count first (spec §4.3): `runSolver` drives one exact search with up to 30 % of the work and 30 % of the time (`PRECOUNT_SHARE`), publishes a `precount` event, ends before the logical phase on zero or multiple, reuses a conclusive count (checked against the accepted logical path, never recomputed), and otherwise suspends the same generator and resumes it after the logical phase with the remaining budget. The logical phase gets the remaining work as its deterministic cut and the remaining time as a safety stop; `humanSteps` now reports `work-limit` and `time-limit` instead of folding both into `logical-budget`, and `runSolver` reports its own deadline stop as `time-limit`. `classic-run` drops its separate 10 % precount (`countClassic`, the correctness marks, now uses the same 30 % share). Exact work is published, and the clock read, once per 256 nodes.

Exact speed, needed for the 15 s check on this laptop's slower states: propagation is now incremental (a naked-single queue; only houses and locked pairs touched by a mask change are re-examined; module hooks rerun only after a change). Same fixed point, so node counts are identical on all 131 cases; `hard1` 2.1–2.8 s against 5.6–7.2 s for the T02 code, measured alternately in one process on mains.

- `count-first.test.ts`, mains: `hard1` at the 15 s preset reports `multiple`; every corpus case starts `exactSteps` exactly once (spy) and reports its label's count; an inconclusive precount (share below the reservation) is resumed after the logical phase, not restarted, and ends `multiple`.
- Determinism (`M26_DETERMINISM=1`, 851 s, mains): three runs of every corpus case at 60 s gave identical results and step sequences on all 131 (7 solved, 3 incomplete at 27–28 steps, 83 multiple and 38 zero at the precount).
