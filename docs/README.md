# Sudoku platform: resume here

Last updated: 2026-09-12.

**Latest feature:** Settings → Appearance now offers Light/Dark plus Blue, Green, Pink, Purple and Gray pastel themes. All ten combinations apply throughout the application and persist in IndexedDB. Legacy libraries default to light green; backup appearance restores only with settings opt-in. Fresh verification: 64 application tests, 23 browser tests, typecheck and build passed. See [appearance verification](appearance-verification.md) and D058. No appearance implementation work remains.

**Earlier visual adjustment:** cell squircles now sit 5% inside each cell, making the shape visibly separate from the grid. The full rectangular cell remains clickable. Fresh checks: eight board/desktop browser tests, typecheck, build and a corner-click/input smoke check passed. See the [inset follow-up](ui-refinement-2026-09-12.md#cell-highlight-inset-follow-up).

**Latest UI update:** Sudoku Engine now uses English throughout, squircle buttons/cell highlights, larger digits, fixed 3 × 3 notes and repeat-value erasing. Thick grid strokes cover thin strokes. Fresh verification passed: 59 unit/storage/controller tests, 22 browser tests, typecheck and build. See the [refinement verification record](ui-refinement-2026-09-12.md) and [earlier sidebar update](ui-sidebar-update-2026-09-12.md). No work remains for these UI requests. D053 supersedes earlier Portuguese UI and corner-note presentation requirements, including language references in the separate M2 design workstream.

## Current state

**The approved first release (M1a + M1b) is implemented and verified.** The active application is in `web/`: TypeScript + Vite, plain TypeScript views, native IndexedDB, and no server dependency. Existing Spring/Java files are unchanged legacy references.

Implementation is on local branch `release/first-release`, based on planning commit `7c9512b`. Work was committed task by task. All ten tasks in the [implementation plan](superpowers/plans/2026-09-12-first-release.md) are complete. See the [release verification record](release-verification.md) for implementation commit, acceptance coverage, fixes, evidence and limitations.

**M2 is undergoing an expanded engine design review; the solver is not implemented.** Start with the [researched engine proposal and technique catalogue](superpowers/specs/2026-09-12-m2-engine-expansion-design.md). The user requested broad logical coverage and scoring, and confirmed Explain/Analyze modes (Explain default) plus Perfect paths derived from clues/rules alone. See D054–D057. The [initial solver specification](superpowers/specs/2026-09-12-m2-classic-solver-design.md) and [initial ten-task plan](superpowers/plans/2026-09-12-m2-classic-solver.md) remain as the baseline but require revision before execution. Work remains on `docs/m2-solver-design`; the release branch is preserved.

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

There is no remaining M1 implementation task. **Review the expanded M2 engine proposal, then revise the detailed plan before authorizing implementation.** The new catalogue includes subsets, fish, wings, coloring, chains/loops, ALS, forcing/net/generalized proof families, specialized patterns, templates and separately gated uniqueness techniques. It proposes event-driven technique selection and scoring of proven deductions, a shared multi-constraint fact/proof interface, and bounded proof transport. These capabilities are researched/proposed, not implemented.

Both product questions from the research pass are answered: Explain is the default mode, and uniqueness-dependent paths are shown separately and never qualify as Perfect. Remaining technical design work is exact advanced-family proof/coverage bounds, concrete shared interfaces, detailed plan revision and benchmark calibration of scheduler/proof/time budgets. Initial temporary input/results, optional Save Clues, independent original-clue counting and configurable 1–120 seconds with a proposed 10-second default remain recommendations; the expanded workload needs fresh benchmarks. No “all deductions” completeness or speedup has been established.

The design session changes Markdown only. Its review checks cover requirement/interface consistency, source attribution, local document links and whitespace; M1 test results above remain the recorded release results, not newly executed solver tests. Gameplay hints still wait until variant solving (M5); construction assistance, variants, community and AI remain outside M2.

The 38-question interview and approved architecture/first-release review are complete; do not restart them. Preserve D001–D045 and the M2 design-only boundary in D046. Any future change to an approved behavior must be recorded with rationale.

## Reference map

Start M2 review with the [expanded engine proposal and researched catalogue](superpowers/specs/2026-09-12-m2-engine-expansion-design.md), then the [initial specification](superpowers/specs/2026-09-12-m2-classic-solver-design.md) and [plan requiring revision](superpowers/plans/2026-09-12-m2-classic-solver.md). Primary-source references are linked beside their supported claims.

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
