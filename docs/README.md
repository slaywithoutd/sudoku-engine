# Sudoku platform: resume here

Last updated: 2026-09-14.

**Latest feature:** Settings → Appearance now offers Light/Dark plus Blue, Green, Pink, Purple and Gray pastel themes. All ten combinations apply throughout the application and persist in IndexedDB. Legacy libraries default to light green; backup appearance restores only with settings opt-in. Fresh verification: 64 application tests, 23 browser tests, typecheck and build passed. See [appearance verification](appearance-verification.md) and D058. No appearance implementation work remains.

**Earlier visual adjustment:** cell squircles now sit 5% inside each cell, making the shape visibly separate from the grid. The full rectangular cell remains clickable. Fresh checks: eight board/desktop browser tests, typecheck, build and a corner-click/input smoke check passed. See the [inset follow-up](ui-refinement-2026-09-12.md#cell-highlight-inset-follow-up).

**Latest UI update:** Sudoku Engine now uses English throughout, squircle buttons/cell highlights, larger digits, fixed 3 × 3 notes and repeat-value erasing. Thick grid strokes cover thin strokes. Fresh verification passed: 59 unit/storage/controller tests, 22 browser tests, typecheck and build. See the [refinement verification record](ui-refinement-2026-09-12.md) and [earlier sidebar update](ui-sidebar-update-2026-09-12.md). No work remains for these UI requests. D053 supersedes earlier Portuguese UI and corner-note presentation requirements, including language references in the separate M2 design workstream.

## Current state

**The approved first release (M1a + M1b) is implemented and verified.** The active application is in `web/`: TypeScript + Vite, plain TypeScript views, native IndexedDB, and no server dependency. Existing Spring/Java files are unchanged legacy references.

Implementation is on local branch `release/first-release`, based on planning commit `7c9512b`. Work was committed task by task. All ten tasks in the [implementation plan](superpowers/plans/2026-09-12-first-release.md) are complete. See the [release verification record](release-verification.md) for implementation commit, acceptance coverage, fixes, evidence and limitations.

**M2 implementation is authorized and underway under D065/D066.** The approved design is `0e98c2b`; implementation lives in `.worktrees/m2-engine` on `feat/m2-engine`. T01-T18 and all bounded C01-C33/U01-U05 families have passed independent implementation review. The conditional batch is implemented in `a2f7a53`, with bootstrap race fix `5a19be1` independently reviewed. Its 129 covering tests passed, followed by 19 resource checks and 21 fix checks; typecheck and build passed. The earlier full run had 1,656 passes and 33 test timeouts. Exact history and remaining acceptance gates are recorded in [implementation progress](m2-implementation-progress.md).

All 38 catalogue rows now have independently verified per-alias evidence; the pre-T19 catalogue readiness gate is closed. Scheduling, worker/UI integration, final whole-suite acceptance and benchmarks remain required. Authentic conditional OR/template source integration is covered at the engine level; the solver is not yet available in the application, and proposed defaults remain unvalidated.

Read the [screen/evidence specification](superpowers/specs/2026-09-12-m2-classic-solver-design.md), [concrete engine contracts](superpowers/specs/2026-09-12-m2-engine-contracts.md), [38-row bounded coverage matrix](superpowers/specs/2026-09-12-m2-technique-coverage.md) and [27-task implementation plan](superpowers/plans/2026-09-12-m2-classic-solver.md). The [researched rationale](superpowers/specs/2026-09-12-m2-engine-expansion-design.md) retains primary sources. D054-D057 confirm expanded direction; D059-D064 record completed planning and proposed technical choices. The obsolete six-technique/ten-task documents have been replaced. Planning preserved research `24e0d25` and newer application work; the original design and release branches remain preserved.

The sidebar update was committed separately as `09887f4` on `docs/m2-solver-design`. The current refinements retain the sidebar and `BoardOptions.controlsContainer` integration points. Reinspect the current implementation before M2; the latest verification below covers these M1 refinements, not a solver.

## Run it

From the repository root:

```powershell
cd web
npm ci
npm run dev
```

Open exactly **http://localhost:5173**. The [root README](../README.md) explains prerequisites, controls, backups and test commands. Node 24.19.0 / npm 11.17.0 and the exact planned dependency pins were exercised successfully.

## Verification results

- `npm ci`: passed; 45 packages installed, audit reported zero vulnerabilities.
- `npm run typecheck`: passed.
- `npm test`: **64 passed**, seven unit/storage/controller/route test files.
- `npm run build`: passed; production assets emitted to `web/dist/`.
- `npm run test:e2e`: **23 passed**, eight Chromium browser suites; latest complete run took 17.0 seconds.
- Real same-context refresh/reopen, true browser restart with an isolated temporary profile, and stale-tab conflict recovery passed.
- Home, creator, player and Settings screenshots inspected at 1280×800 and 1920×1080; nine corner notes, selection, fixed clues and conflicts checked. Creator/player board controls fit the 800-pixel viewport.
- Independent reviews found three issues: inherited record-key collisions, concurrent Retry status and focused name autosave. All were reproduced and fixed with regressions. Final review had no remaining critical/important findings.
- `git diff --check` passed. Spring paths, generated dependencies/builds and test profiles were excluded from commits.

## Implemented behavior

- English Home, personal library with Drafts/Puzzles, classic creator/player and Settings. Solver and community Explore are marked as future features. Legacy Portuguese libraries/backups remain readable; existing user-authored names are preserved.
- Manual/81-cell string creation, autosaved conflicting drafts, conflict-blocked Finish, immutable playable definitions, edit-copy, rename and confirmed deletion.
- Locked/selectable givens, wrapping arrows, physical numpad/Shift input, notes in fixed 3 × 3 positions, hidden note retention, layered erase, repeat-value erasing, undo/redo/reset and saved selection/tool.
- Immediate in-memory edits with serialized atomic saves of the entire library and histories. Separate draft/play history, no silent history cap, error indicators and live-work export/retry.
- Versioned JSON backups, whole-graph validation, history replay validation, linked copies for collisions, preview freshness checks, settings opt-in and atomic restore.
- Optional play conflicts off by default, mandatory creation conflicts, dismissible valid-board completion without solver claims.

## Known limits

Desktop Chromium is the verified browser. Other browsers and assistive technologies have not received manual compatibility certification. Persistence uses one aggregate transaction and full history validation; histories are retained without a cap, and very large libraries have not been benchmarked. Quota/abort/open failures are simulated at adapter/browser boundaries; real quota eviction and power-loss durability are not guaranteed. Data remains browser/profile/origin-local; use JSON backups for recovery and transfer.

## Next checkpoint

There is no remaining M1 implementation task. **Execute and verify the approved M2 plan; track each batch in the implementation record.** The plan includes subsets, fish, wings, coloring, chains/loops, ALS, forcing/nets/generalized families, specialized patterns, templates and separately gated uniqueness techniques. It specifies normalized multi-constraint capabilities, proof/fact provenance, invalidation, deterministic fair Explain/Analyze scheduling, independent counting and bounded worker transport with separate chunk ACK and atomic step acceptance. The implementation record distinguishes completed foundations from the remaining technique and runtime gates; the expanded application profile is not available yet.

Both product questions remain answered: Explain is the default mode, and uniqueness-dependent paths are separate and never qualify as Perfect. No new product question blocks the proposal. Technical bounds/interfaces/tasks are now concrete. Key recommendations are memory-only input/results/options, optional Save Clues, separate conditional analysis, a 70% human-phase ceiling within the total budget, configurable work/proof caps and a proposed 10-second default (1–120 seconds). Cost tables, phase share, practical resource defaults and rollout value have explicit production/held-out benchmark gates; rollout is initially off. No universal logical completeness, validated default or speedup is claimed.

The earlier design session changed Markdown only; the approved implementation now adds code and tests in the isolated worktree. See [M2 planning verification](m2-design-verification.md) for requirement/interface coverage, source checks, links, whitespace and documentation-only evidence. M1 test results above remain recorded application results, not newly executed solver tests. Gameplay hints still wait until variant solving (M5); construction assistance, variants, community and AI remain outside M2.

The 38-question interview and approved architecture/first-release review are complete; do not restart them. Preserve D001–D045 and the D046 approval history; D065 records the subsequent authorization to implement. Any future change to an approved behavior must be recorded with rationale.

## Reference map

Start M2 review with the [revised specification](superpowers/specs/2026-09-12-m2-classic-solver-design.md), [engine contracts](superpowers/specs/2026-09-12-m2-engine-contracts.md), [bounded coverage matrix](superpowers/specs/2026-09-12-m2-technique-coverage.md) and [complete plan](superpowers/plans/2026-09-12-m2-classic-solver.md). The [research rationale](superpowers/specs/2026-09-12-m2-engine-expansion-design.md) links primary sources beside supported claims.

1. [First-release implementation plan](superpowers/plans/2026-09-12-first-release.md)
2. [Approved first-release behavior](superpowers/specs/2026-09-12-first-release-design.md)
3. [Platform architecture](superpowers/specs/2026-09-12-platform-design.md)
4. [Roadmap and later design checkpoints](roadmap.md)
5. [Decision log](decisions.md)
6. [Product vision](product-vision.md)
7. [Interview history](design-tree.md)
8. [Original application baseline](current-application.md)
9. [Reference research](references/reference-research.md), [architecture research](references/architecture-research.md), [toolchain evidence](references/toolchain.md)
10. [Historical planning verification](planning-verification.md) and [actual release verification](release-verification.md)

11. [M2 implementation evidence](m2-implementation-progress.md), [engine coding guide](solver/architecture.md), [foundation reasoning](solver/techniques/foundation.md), [short-pattern/wing reasoning](solver/techniques/wings-and-short-patterns.md), [fish reasoning](solver/techniques/fish.md), [chain/coloring reasoning](solver/techniques/chains-and-coloring.md), [ALS reasoning](solver/techniques/als.md) and [set/count reasoning](solver/techniques/set-arguments.md), [forcing](solver/techniques/forcing.md), [generalized chains](solver/techniques/generalized-chains.md), [Fireworks](solver/techniques/fireworks.md), [SK Loops](solver/techniques/sk-loops.md), [Exocet](solver/techniques/exocet.md) and [Tridagon guardians](solver/techniques/tridagon.md)
