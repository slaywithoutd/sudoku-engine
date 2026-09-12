# UI refinement verification

Date: 2026-09-12. Status: implemented and verified. Decision: [D053](decisions.md#d053--english-interface-fixed-note-positions-and-repeat-value-erasing).

## Completed requests

- [x] Thick grid separators always paint above thin lines, including intersections.
- [x] Squircle curves on buttons and cell highlights; the grid remains straight and frameless.
- [x] Larger board and keypad digits.
- [x] English application copy, accessible labels, dialogs, status and validation/recovery errors.
- [x] Fixed 3 × 3 note positions within each cell, with gaps for absent candidates.
- [x] Repeating an editable value erases it, retains notes and supports undo/redo. Fixed clues remain protected. Held numeric keys do not repeatedly toggle.
- [x] Existing libraries/backups with `pt-BR` remain readable and normalize to English settings without renaming records or rewriting histories.

## Verification

- `npm run typecheck`: passed.
- `npm test`: **59 passed** in seven unit/storage/controller/route files. New reducer and locale-compatibility tests were observed failing before implementation and passing afterward.
- `npm run build`: passed, 24 modules; production output generated in `web/dist/`.
- `npm run test:e2e`: **22 passed**, seven Chromium suites; final full run took 25.5 seconds. New tests check repeat-value erasing, retained notes/history, held keys and stable 3 × 3 note geometry after candidates are removed. Desktop acceptance also exercises pointer toggling and English document language.
- Existing browser acceptance passed for autosave, true restart, stale-tab recovery, fixed clues, completion, backup import/export and simulated save failures. One old Portuguese stale-tab test selector was updated to the English recovery message before the final passing run.
- Screenshots inspected: Home and Settings at 1280 × 800, creator conflicts at 1280 × 800, and player at 1280 × 800 and 1920 × 1080. Board dimensions remain 752 and 1032 pixels respectively; numbers and notes fit, controls remain reachable, and grid intersections retain the thick stroke color.
- Chromium 153 reports support for `corner-shape: squircle`. Cell and keypad curves use 50% corner radii with that shape; other buttons use smooth squircle corners. Other browsers retain ordinary rounded-corner fallbacks if unsupported.
- Independent read-only code review reported no actionable correctness, data-preservation or accessibility findings.
- The development server at `http://localhost:5173` returned HTTP 200. Tests used isolated profiles on port 5174.

No implementation work remains for this request. The existing M2 design documents and legacy Spring files remain separate; no solver, hints, variants, community or AI functionality was added. The original first-release plan remains fully checked; this follow-up supersedes only the behavior documented in D053.

## Cell highlight inset follow-up

The user requested a slightly smaller squircle so the shape is visibly intentional. Cell backgrounds and focus/selection rings now render on a decorative layer inset by 5% on each side. Hover and conflict states use the same contour. The full cell remains clickable, and digits/notes retain their positions.

Fresh verification for this CSS-only follow-up: all eight board and desktop visual tests passed (10.1 seconds), typecheck and production build passed, and an isolated Chromium smoke check selected a cell one pixel from its corner and entered a value successfully. Creator/player screenshots at 1280 × 800 were inspected for the gap, focus ring, nine notes and conflicts; desktop acceptance also passed at 1920 × 1080. The earlier full 59-unit/22-browser results above belong to the preceding refinement. No remaining work for this follow-up.
