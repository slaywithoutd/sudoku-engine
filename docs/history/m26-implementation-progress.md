# M2.6 implementation progress

Branch `feat/m26-hardening`, worktree `.claude/worktrees/gifted-feistel-d36469`, from 2026-10-16. Spec: [M2.6 engine hardening](../specs/2026-09-22-m26-engine-hardening.md), approved under D103. One reviewed commit per task, each followed by an independent review (`fix(solver): <task> review`). Every timing names its power state: the laptop (Intel Core i5-1345U, Windows 11, Node v24.19.0) runs about 2.7x slower on battery.

| Task | Commit | Acceptance evidence | Review |
| --- | --- | --- | --- |
| T01 evaluation corpus, reference DFS, baseline | `c51de80` | `exact-reference.test.ts`: engine = reference on 131 cases; baseline in [m26-baseline](m26-baseline.md) (battery) | `2883163` (assembly zero, full regeneration check, Node version, README scope); merged to `master` at `ffbd872` |
| T02 exact propagation (`original-dfs@2`) | `feat(solver): M2.6 T02` | see below; `npm test` 83 files, 2,010 passed, 6 skipped, 0 failed (2,379 s, mains then battery); typecheck clean | pending |

## T02

Exact search: bulk naked and hidden singles, locked candidates over every pair of full all-different houses that share two or more cells, module prune hooks in the same loop, child frames inherit the parent's fixed-point masks, one work event per node, the `seen` set dropped, `EXACT_METHOD = "original-dfs@2"`.

- T01 green with `norvig-hard1` included (no heavy case left): 133 tests, about 10 s, mains.
- `norvig-hard1` 2.95 s (target < 5 s), every other case < 20 ms (< 1 s), Escargot 14–16 ms; mains, two passes ([m26-baseline](m26-baseline.md) T02 row).
- `exact-variants.test.ts` green, plus a new property test: the exact fixed point never removes a value used by a known solution, on 40 generated mixed problems and the unique corpus grids; a deliberately unsound locked-candidate rule fails it.
- `exact.test.ts`: the accounting test is re-pinned (one work event per node; the empty root counts 163 units = 1 + 81 masks + 27 houses + 54 box/line pairs) because `@2` reports a node's operations in one event instead of one unit per cell scan.
- **Open:** "node counts ≤ baseline on every case" fails on five multi-solution grids by 1–3 nodes (all 48 exhaustive cases are at or below baseline). Raised for a decision; T02 proceeds with the spec's MRV and lowest-index ties until then.
