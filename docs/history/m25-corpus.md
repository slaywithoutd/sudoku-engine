# M2.5 corpus record

Plan task T13 (spec §3.9). Built 2026-09-18 with `CORPUS=build` shards of
`tests/unit/solver/build-corpus.test.ts` and merged with `CORPUS=assemble`;
the resulting `web/tests/solver/bench/corpus.json` is schema 2.

## Sources and licenses

Every case is generated in-repository (`license: repository-generated`) by
`web/tests/solver/bench/generate.ts` from a deterministic seed: a random
complete grid (the exact-cover oracle's first witness under digit permutation,
band/stack and line shuffles and transposition), constraints read off that
grid, then givens removed in random order while the independent oracle
(`tests/solver/oracle.ts` for classic, `oracle-variants.ts` otherwise) still
proves uniqueness. No production solver code participates in generation.

The spec's second source — ≥ 1,000 public hard classic puzzles with a
verified license (candidate: Royle's 17-clue collection) — is **not
ingested**. Its license text was not verified in this milestone and the plan
requires the license path to be recorded before any public case enters the
repository; the ingestion script remains future work and the spec item stays
DEFERRED. Consequence, recorded for the calibration report: random generation
rarely reaches tiers ≥ 5, so those families are expected to remain on
declared constants (spec §3.9 fitting threshold).

## Generator conventions

- Killer: full cage coverage (sizes 2-4, no repeated digit inside a cage),
  givens thinned to zero when uniqueness allows.
- Thermometer: six thermometers of 3-6 cells as `order@1` pairs.
- Kropki: even seeds carry the negative constraint (`neither` dots on every
  undotted adjacent pair, few givens); odd seeds keep ~60 % of the dots.
- Arrow: 5-7 arrows, circle first, arms of ≥ 2 cells.
- Mixed: 8 cages, 2 thermometers, 2 arrows and ~20 % of the white/black dots.
- Random subsets below ~55 givens are rarely unique, so the variant
  generators start from a 55-65 % keep rate and thin from there.

## Counts

See the table in the build log of `docs/history/m25-implementation-progress.md`
(T13 row) and the validation test `counts meet the spec §3.9 generated
targets in every family`, which pins the targets 300/150/100/100/100/100 and
requires every family to have held-out cases.
