# M2 cleanup resume handoff

Recorded 2026-09-15 at the user's request to pause the cleanup/hardening phase.

## Current task

Final cleanup verification and documentation reconciliation. No product behavior,
solver limit, proof rule, technique coverage, Java/Maven file, or persistent
application state was changed.

## Completed cleanup commits

- `8182042` `test: stabilize CPU-bound solver harness`
- `7032311` `test: serialize browser harness on constrained hosts`
- `ffd0bcb` `refactor: remove unused solver copy helper`
- `08bc9cc` `refactor: clarify worker and controller boundaries`
- `46f962b` `refactor: remove unused solver imports`
- `b0dcf91` `test: remove unused solver test bindings`
- `ffd1348` `refactor: clarify generalized solver parameters`

The user explicitly authorized harness-only timeout adjustments. The two harness
commits retain solver limits and product behavior: Vitest runs CPU-bound files
serially with a 120-second harness allowance, and Playwright uses one worker on
this constrained host.

## Evidence obtained

- Baseline before harness stabilization: typecheck and build passed; `npm test`
  had 1,623 passes and 121 failures, predominantly five-second CPU-bound fixture
  timeouts; development and production browser runs had host-timeout failures.
- After the harness-only commits, a complete unit run passed 1,744/1,744 in
  3,081.05 seconds. Development E2E passed 27/27 and production E2E passed
  11/11. Typecheck, build and whitespace checks passed.
- Cleanup-focused checks passed: Solve screen 1/1; controller 2/2; real worker
  1/1; run/transport 5/5; human/protocol/transport 6/6; C28 targeted 1/1.
  Normal typecheck, strict unused-local/parameter TypeScript check, and
  `git diff --check` passed after the code cleanup.
- Static inventory found no `TODO`/`FIXME`, `console.log`, `debugger`,
  `@ts-ignore`, or `@ts-expect-error` in the active source/test/configuration
  scope. Dynamic imports and worker entries were traced to their associated
  tests or the real Vite worker.

## Interrupted verification

The mandatory post-cleanup `npm test` was launched twice. The first direct run
lost its terminal result in the execution interface. The second native-Vitest
JSON run was intentionally terminated at the user's request before completion.
Neither is evidence of success or failure. No test source or result was changed
to obtain approval.

## Next single step

Run the complete post-cleanup verification suite from `web/`, starting with
`npm run typecheck` and then `npm test`; do not treat a timeout as approval.
After it finishes, run build, both E2E suites and `git diff --check`, then
update the stale M2 status records (`docs/m2-implementation-progress.md`,
`docs/m2-solver-verification.md`, `docs/README.md`, and `README.md`) only with
the resulting evidence. Preserve historical pause/handoff text and keep rollout
disabled and defaults unvalidated unless new benchmark evidence exists.
