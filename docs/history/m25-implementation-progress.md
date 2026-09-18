# M2.5 implementation progress

Branch `feat/m25-engine`, worked in the isolated worktree `.claude/worktrees/m25-engine` from 2026-09-18 after a branch collision in the shared checkout (a third session created `feat/merged-selection-outline` there while T03 was being committed; the stray commit was removed from that branch and T03 was recommitted cleanly). Plan: [2026-09-18-m25-engine](../plans/2026-09-18-m25-engine.md). Review is per block, as approved.

| Task | Commit | Tests run | Review |
| --- | --- | --- | --- |
| T01 sum vocabulary and capability | `7842c81` | sums, assembly, events, composition, exact, candidates, proof-roots, foundation, protocol, transport, run, controller, differential, human, scheduling, implications, als-index; tsc both configs | Block 1 review PASS (`47a5148` fixes: structural conclusion comparison, single `:sum` id enforced at assembly, bounded totals, root-bound tests) |
| T02 linear-sum@1 / linear-combine@1 | `ca6658d` | linear, sums, composition, proof-graph, assembly, foundation; tsc both configs | Block 1 review PASS; see above |
| T03 variant oracle and small generator | `1b447b6` | oracle-variants (10 tests, 800 tiny + 800 restricted + 40 generated instances vs brute force); tsc | Block 2 review PASS; findings M1 (arrow mapping never exercised) and L1 (no satisfiable-instance guard) folded into the recommit; L2 (`exhausted` false when count equals the limit) and L3 (circle-first arrow shape) recorded as documented conventions |
