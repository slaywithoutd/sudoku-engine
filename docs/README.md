# Documentation index

Updated: 2026-09-17.

## Current state

M1 (classic creation, play, personal library, settings and backups), M2 (the human-technique solver with Analyze/Explain) and the UX overhaul of 2026-09-16 are all merged on `master` as of 2026-09-17. There is one application, in `web/`: TypeScript, Vite, plain DOM views and native IndexedDB, with no runtime dependencies and no server.

What the app does today:

- **Play**: board-first screen with an honest timer, pause cover, corner and center notes, six cell colors with color-blind patterns, multi-selection, Fill notes from constraints only, full undo/redo, cell copy/paste and "mark correct digits" backed by the unique solution found in a worker.
- **Create and import**: autosaved drafts, Finish locks the clues, import from 81-character strings, decorated grids, `.sdk`/`.ss`/`.sdm`/`.txt` collections and JSON game exports, with a live preview and precise errors.
- **Solve**: 33 primary technique families plus five uniqueness-conditional ones, independently checked proofs, a separate exact solution count, Analyze (summary) and Explain (step by step with board highlights), running in a Web Worker with cancellation. Rollout of the engine's Analyze mode stays off and its resource defaults are not yet benchmarked (D063, D099).
- **Library, settings and data**: local IndexedDB storage, versioned JSON backups, light/dark and five pastel themes, accessibility options, configurable shortcuts, collapsible sidebar and fullscreen.

## Run and test

See the [root README](../README.md): `cd web && npm ci && npm run dev`, then open http://localhost:5173. The same page lists every verification script.

## Product and decisions

- [Product vision](product-vision.md) — scope, audience and long-term direction.
- [Decision log](decisions.md) — every confirmed or superseded decision (D001–D099), chronological.
- [Roadmap](roadmap.md) — delivery sequence M1–M6, later branches and the quality contract.
- [UX overhaul, 2026-09-16](ux-overhaul-2026-09-16.md) — the design principles and decisions behind the current interface.
- [Reference research](history/references/reference-research.md), [architecture research](history/references/architecture-research.md) and [toolchain evidence](history/references/toolchain.md).

## Solver engine

- [Engine architecture and coding guide](solver/architecture.md)
- [Scheduling](solver/scheduling.md) and its [verification record](history/scheduling-verification.md)
- Technique reasoning: [foundation](solver/techniques/foundation.md), [wings and short patterns](solver/techniques/wings-and-short-patterns.md), [fish](solver/techniques/fish.md), [chains and coloring](solver/techniques/chains-and-coloring.md), [ALS](solver/techniques/als.md), [set arguments](solver/techniques/set-arguments.md), [forcing](solver/techniques/forcing.md), [generalized chains](solver/techniques/generalized-chains.md), [Fireworks](solver/techniques/fireworks.md), [SK loops](solver/techniques/sk-loops.md), [Exocet](solver/techniques/exocet.md), [Tridagon](solver/techniques/tridagon.md), [templates](solver/techniques/templates.md) and [uniqueness](solver/techniques/uniqueness.md).

## History

Records kept as written at the time; each starts with a note saying so.

- Planning: [interview history](history/design-tree.md), [planning verification](history/planning-verification.md), [platform design](history/superpowers/specs/2026-09-12-platform-design.md), [reference research](history/references/reference-research.md), [architecture research](history/references/architecture-research.md), [toolchain evidence](history/references/toolchain.md).
- First release: [behavior specification](history/superpowers/specs/2026-09-12-first-release-design.md), [implementation plan](history/superpowers/plans/2026-09-12-first-release.md), [release verification](history/release-verification.md).
- Interface iterations: [sidebar update](history/ui-sidebar-update-2026-09-12.md), [UI refinement](history/ui-refinement-2026-09-12.md), [appearance verification](history/appearance-verification.md).
- M2 solver: [design specification](history/superpowers/specs/2026-09-12-m2-classic-solver-design.md), [engine contracts](history/superpowers/specs/2026-09-12-m2-engine-contracts.md), [technique coverage matrix](history/superpowers/specs/2026-09-12-m2-technique-coverage.md), [expansion rationale](history/superpowers/specs/2026-09-12-m2-engine-expansion-design.md), [implementation plan](history/superpowers/plans/2026-09-12-m2-classic-solver.md), [design verification](history/m2-design-verification.md), [implementation progress](history/m2-implementation-progress.md), [scheduling verification](history/scheduling-verification.md), [solver verification](history/m2-solver-verification.md), [benchmark record](history/m2-solver-benchmarks.md).
