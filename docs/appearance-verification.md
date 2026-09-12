# Appearance verification

Date: 2026-09-12. Status: implemented and verified. Decision: [D058](decisions.md#d058--light-and-dark-modes-with-five-pastel-themes).

## Completed behavior

- [x] Light and Dark modes, each usable with Blue, Green, Pink, Purple or Gray pastel themes.
- [x] Immediate whole-application updates from accessible Settings radio groups, including keyboard selection and visible focus/selected states.
- [x] Shared semantic colors for page/sidebar/panels, board numbers/notes/grid, inset highlights, buttons, fields, dialogs and errors.
- [x] Mode and theme saved through the existing IndexedDB controller and restored on reload; switching modes retains the chosen theme.
- [x] Legacy libraries and backups default missing fields to light green, while malformed explicit settings are rejected.
- [x] Backup roundtrip retains appearance; importing preserves local appearance unless settings restore is selected.

## Evidence

- `npm run typecheck`: passed.
- `npm test`: **64 passed** in seven files. New tests cover defaults, invalid appearance values, roundtrip and settings restore opt-in; observed failing before implementation and passing afterward.
- `npm run build`: passed, 24 modules; output in `web/dist/`.
- `npm run test:e2e`: **23 passed** in eight Chromium suites, final full run 17.0 seconds. The new appearance test exercises every mode/theme combination, reload persistence, unchanged notes/value, native radio arrow navigation, and dark Settings/dialog screenshots.
- Browser-computed text contrast meets the test threshold of 4.5:1 for normal text, muted panel text, editable board values and selected-cell notes in all ten combinations. This is targeted contrast coverage, not a complete accessibility certification.
- Screenshots inspected for representative blue, green, pink, purple and gray appearances, dark Settings and dark Rename dialog. An additional isolated-browser smoke check exercised dark pink creator conflicts and focus styling. Existing desktop board acceptance passed at 1280 × 800 and 1920 × 1080.
- Independent read-only code review reported no important actionable findings in persistence, validation, settings opt-in, accessibility or CSS coverage.
- `git diff --check`: passed. The active localhost:5173 development server served the isolated visual smoke check; automated tests used port 5174 and isolated profiles.

No remaining work for this feature. Existing M1 task checkboxes remain complete. The concurrent M2 research/design commit `24e0d25` was preserved separately. Cross-browser and assistive-technology certification remain outside the verified Chromium scope.
