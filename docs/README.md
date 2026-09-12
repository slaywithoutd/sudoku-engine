# Sudoku platform: resume here

Last updated: 2026-09-12.

## Current state

**The approved first release (M1a + M1b) is implemented and verified.** The active application is in `web/`: TypeScript + Vite, plain TypeScript views, native IndexedDB, and no server dependency. Existing Spring/Java files are unchanged legacy references.

Implementation is on local branch `release/first-release`, based on planning commit `7c9512b`. Work was committed task by task. All ten tasks in the [implementation plan](superpowers/plans/2026-09-12-first-release.md) are complete. See the [release verification record](release-verification.md) for implementation commit, acceptance coverage, fixes, evidence and limitations.

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
- `npm test`: **54 passed**, seven unit/storage/controller/route test files.
- `npm run build`: passed; production assets emitted to `web/dist/`.
- `npm run test:e2e`: **20 passed**, seven Chromium browser suites; latest complete run took 13.5 seconds.
- Real same-context refresh/reopen, true browser restart with an isolated temporary profile, and stale-tab conflict recovery passed.
- Home, creator, player and Settings screenshots inspected at 1280×800 and 1920×1080; nine corner notes, selection, fixed clues and conflicts checked. Creator/player board controls fit the 800-pixel viewport.
- Independent reviews found three issues: inherited record-key collisions, concurrent Retry status and focused name autosave. All were reproduced and fixed with regressions. Final review had no remaining critical/important findings.
- `git diff --check` passed. Spring paths, generated dependencies/builds and test profiles were excluded from commits.

## Implemented behavior

- Portuguese Home, personal library with Drafts/Puzzles, classic creator/player and Settings. Solver and community Explore are marked as future features.
- Manual/81-cell string creation, autosaved conflicting drafts, conflict-blocked Finish, immutable playable definitions, edit-copy, rename and confirmed deletion.
- Locked/selectable givens, wrapping arrows, physical numpad/Shift input, sorted corner notes, hidden note retention, layered erase, undo/redo/reset and saved selection/tool.
- Immediate in-memory edits with serialized atomic saves of the entire library and histories. Separate draft/play history, no silent history cap, error indicators and live-work export/retry.
- Versioned JSON backups, whole-graph validation, history replay validation, linked copies for collisions, preview freshness checks, settings opt-in and atomic restore.
- Optional play conflicts off by default, mandatory creation conflicts, dismissible valid-board completion without solver claims.

## Known limits

Desktop Chromium is the verified browser. Other browsers and assistive technologies have not received manual compatibility certification. Persistence uses one aggregate transaction and full history validation; histories are retained without a cap, and very large libraries have not been benchmarked. Quota/abort/open failures are simulated at adapter/browser boundaries; real quota eviction and power-loss durability are not guaranteed. Data remains browser/profile/origin-local; use JSON backups for recovery and transfer.

## Next checkpoint

There is no remaining M1 implementation task. **M2 is the next design checkpoint**, not authorization to implement a solver in this release. Define technique ordering, deduction-step schema, exact/count evidence, worker protocol, cancellation and measured limits before its implementation. Gameplay hints wait until variant solving (M5) is complete. Variants, construction assistance, community and AI remain outside M1.

The 38-question interview and approved architecture/first-release review are complete; do not restart them. Preserve D001–D044 and the implementation clarification D045. Any future change to an approved behavior must be recorded with rationale.

## Reference map

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
