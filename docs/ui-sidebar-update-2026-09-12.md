# Sudoku Engine layout update

Date: 2026-09-12. Status: implemented and verified.

## User-approved design

The user requested a sidebar instead of a navbar so the square Sudoku board can use more of the viewport height. The application name is **Sudoku Engine**. The board uses continuous internal lines with rounded ends and no outer frame.

The implementation places navigation and save status in a fixed left sidebar. Creator/player controls sit beside the board on desktop, allowing the board to use the viewport height minus 48 pixels of spacing. At smaller widths the controls stack below the board; the narrow sidebar retains accessible labels. Internal grid lines are drawn in a single decorative SVG overlay, with thicker box separators and round line caps. Individual cells have no borders. Selection and conflict highlights remain visible.

This is a presentation change within M1. Storage schemas, gameplay rules and the legacy Spring files are unchanged. Solver implementation remains outside this change.

## Verification

- `npm run typecheck`: passed.
- `npm test`: 54 tests passed in seven files.
- `npm run build`: passed.
- `npm run test:e2e`: all 20 Chromium tests passed; final full run took 18.6 seconds.
- `git diff --check`: passed.
- Screenshots inspected for Home, creator, player and Settings at 1280 x 800 and 1920 x 1080. The board measures 752 and 1032 pixels respectively, stays square and fits vertically. No outer frame or horizontal overflow was observed at these sizes.
- Browser regressions cover sidebar branding, board sizing, external numeric controls, Shift notes and keyboard input/undo while an external control owns focus. Existing save/retry/recovery tests also passed. Their test-only failure controls were moved away from the fixed sidebar.
- Independent code review found no important interaction, accessibility or state regression. Broader assistive-technology and non-Chromium compatibility have not been manually certified.

The development server at `http://localhost:5173` responded successfully after these changes. No implementation work remains for this layout request. Concurrent M2 design documents were preserved separately.
