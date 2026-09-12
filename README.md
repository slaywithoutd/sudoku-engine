# Sudoku Engine

A personal classic Sudoku platform: create drafts, finish puzzles and continue playing in your browser. The English interface uses a sidebar and a large, frameless board.

## Run locally

Verified prerequisites: **Node.js 24.19.0 and npm 11.17.0**. The application uses TypeScript, Vite and IndexedDB; Java is not required. From this repository in PowerShell:

```powershell
cd web
npm ci
npm run dev
```

Open exactly **http://localhost:5173**. Keep the terminal open; `Ctrl+C` stops the server. The port is fixed: Vite reports an error if it is occupied.

Data belongs to the browser, profile and origin you use. Another browser, `127.0.0.1` or a different port has a separate library. There is no cross-device sync.

## Create and play

- **Create** opens an autosaved draft, including drafts with conflicts. **Paste puzzle** accepts 81 cells: `1–9` for clues and `0` or `.` for empty cells; whitespace is ignored. Importing creates another draft.
- **Finish** requires no visible conflicts and creates a puzzle with fixed clues. Solvability and uniqueness are not checked. Empty boards can be finished.
- **Library** supports opening, continuing, renaming, editing a copy and confirmed deletion. Each puzzle has one current play session. Editing a copy preserves the original progress.
- **Settings** offers optional conflict highlighting during play. The creator always shows conflicts.

| Control | Action |
| --- | --- |
| Click / arrow keys | Select a cell; arrows wrap within the same row or column. |
| `1–9` / numpad / number buttons | Enter a value. Enter the same value again to erase it and reveal retained notes. Fixed clues cannot be edited. |
| `Shift` + number or number button | Toggle a note during play. Digits have fixed positions in a 3 × 3 grid. |
| **Notes** | Toggle the persistent notes tool. Notes only edit empty cells. |
| `0`, `Delete`, `Backspace` / **Erase** | Clear the value and reveal retained notes; if empty, clear its notes. |
| `Ctrl+Z` / **Undo** | Undo the last edit. Selection and navigation are outside history. |
| `Ctrl+Y`, `Ctrl+Shift+Z` / **Redo** | Redo an undone edit. |
| **Reset** | Clear editable values and notes in one undoable action. |

Notes are manual and never removed automatically from neighboring cells. Values hide notes without deleting them. Separate draft/play histories survive reopening. Holding a number key does not repeatedly toggle its value or note.

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
```

Browser tests use **http://127.0.0.1:5174**, isolated profiles and `web/test-results/`; they do not use the personal library at `localhost:5173`. The restart test relaunches Chromium with its own temporary profile. Screenshots and failure traces are ignored by Git. Save-failure tests simulate adapter errors, not real quota eviction or power-loss durability.

Production assets are generated in `web/dist/`. There are no runtime UI/storage dependencies, external validation services or external fonts. Squircle shapes use native CSS `corner-shape`, verified in Chromium; browsers without support retain rounded corners.

## Scope and continuation

This release includes classic creation/play, a personal library, settings and backups. Solver, hints, variants, community and AI belong to later stages; **Solve** and **Explore** are marked as upcoming.

Spring/Java files in `src/`, `pom.xml` and the Maven wrappers remain legacy references. The active application is in `web/`.

See the [current progress and verification](docs/README.md), [approved first-release specification](docs/superpowers/specs/2026-09-12-first-release-design.md) and [roadmap](docs/roadmap.md).
