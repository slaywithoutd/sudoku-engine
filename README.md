# Sudoku Engine

A personal classic Sudoku platform: create, play and solve puzzles in your browser. The interface is board-first and assumes you already know Sudoku.

## Run locally

Verified prerequisites: **Node.js 24.19.0 and npm 11.17.0**. The application uses TypeScript, Vite and IndexedDB; Java is not required. From this repository in PowerShell:

```powershell
cd web
npm ci
npm run dev
```

Open exactly **http://localhost:5173**. Keep the terminal open; `Ctrl+C` stops the server. The port is fixed: Vite reports an error if it is occupied.

Data belongs to the browser, profile and origin you use. Another browser, `127.0.0.1` or a different port has a separate library. There is no cross-device sync.

## Create, play and solve

- **Create** opens an autosaved draft named `Puzzle N`, including drafts with conflicts. **Import** accepts pasted text or files: 81 cells (`1–9`, `0` or `.`), decorated 9-line grids, `.sdk`/`.ss`/`.sdm`/`.txt` collections and game exports (`.json`), with a live preview and precise errors. Collections can be imported as drafts at once.
- **Finish** requires no visible conflicts and locks the clues; boards with fewer than 17 clues ask for confirmation.
- **Play** shows the board first, with a timer, pause (which covers the board), quick game settings, fullscreen and a menu for checking, copy/paste, copying the puzzle, exporting the game, saving an image, opening the solver, editing a copy and restarting.
- **Solve** uses the same editing surface as Create. **Analyze** shows the result, solution count and technique statistics; **Explain** steps through each deduction on the board. The Library's **Solve** action and the solver's library picker load saved puzzles; nothing is stored unless you choose **Save as draft**.
- **Settings** groups Appearance, Accessibility (text and digit size, color-blind palette, color patterns, stronger digits, high contrast, reduced motion), Board, Keypad, Notes & warnings, Timer, Completion, Keyboard shortcuts, Solver and Data & backup. **Help** holds every gameplay explanation.

Notes come in two layers: corner notes (`Shift` + number) fill the corners, then the edges; center notes (`Ctrl` + number) sit in the middle. Six cell colors are available with the Color tool. **Fill notes** writes candidates from row, column and box constraints only. Erase clears the digit, then notes, then the color. Every edit is undoable, and clicking the selected cell, clicking outside the board or pressing `Esc` clears the selection. Shortcuts are configurable; defaults are `Z`/`X`/`C`/`V` for tools, `P` pause, `F` fullscreen, `Ctrl+C`/`Ctrl+V` copy and paste a cell.

The timer counts only active play: paused games, hidden tabs and other focused windows are excluded, and it keeps counting while hidden. It can start immediately or on the first move.

## Save and recover

**Saved** means the local transaction completed. If **Not saved** appears, your work remains in memory: use **Export work** and/or **Retry saving**. If another tab saved a newer version, export the conflicting tab's work before reloading it, then import the backup to preserve both versions.

Use **Settings → Export backup** to download the complete library, notes, histories and settings as JSON. **Import backup** validates the entire file and shows a preview before applying it. Identical records are skipped; conflicting records become linked copies. Current settings remain unless you choose to restore them. Confirmed deletions require an earlier backup for recovery.

Existing Portuguese-release libraries and backups remain readable and are normalized to English settings. User-authored names and histories are preserved. Keep backups of puzzles you want to retain: clearing browser data or losing a profile can remove local storage, and there is no recovery server.

## Verify

Run in `web/`:

```powershell
npm ci
npx playwright install chromium
npm run typecheck
npm test
npm run build
npm run test:e2e
npm run test:e2e:production
```

Browser tests use **http://127.0.0.1:5174**, isolated profiles and `web/test-results/`; they do not use the personal library at `localhost:5173`. The restart test relaunches Chromium with its own temporary profile. Screenshots and failure traces are ignored by Git. Save-failure tests simulate adapter errors, not real quota eviction or power-loss durability.

Production assets are generated in `web/dist/`. There are no runtime UI/storage dependencies, external validation services or external fonts. Squircle shapes use native CSS `corner-shape`, verified in Chromium; browsers without support retain rounded corners.

## Scope and continuation

This release includes classic creation/play, a personal library, settings and backups. The M2 Solve work is present only in the isolated review branch and is not release-enabled; solver, hints, variants, community and AI remain later-stage or incomplete features. Fresh cleanup verification in that branch passed typecheck, 1,745 unit tests, build and both browser suites, but benchmark calibration and numerical resource-default validation remain outstanding, so rollout stays disabled. **Solve** and **Explore** are not part of this release.

Spring/Java files in `src/`, `pom.xml` and the Maven wrappers remain legacy references. The active application is in `web/`.

See the [current progress and verification](docs/README.md), [approved first-release specification](docs/superpowers/specs/2026-09-12-first-release-design.md) and [roadmap](docs/roadmap.md).
