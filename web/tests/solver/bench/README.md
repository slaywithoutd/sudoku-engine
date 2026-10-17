# Solver benchmark corpus and calibration bench

`corpus.json` (schema 2) keeps calibration and held-out cases in separate
arrays. Every case records its family, normalized 81-digit puzzle, variant
constraints (`cage@1`, `order@1`, `difference@1`, `arrow@1`; classic houses
are implied), given count, oracle count, source group, license, generator
seed and the sha256 of its normalized content. The partition is a pure
function of that hash (`corpus-schema.ts`: one in four is held out), so a case
cannot move partitions without a new corpus hash; `corpusHash` is the sha256
of the sorted case hashes and `generator` the hash of `generate.ts`.

Every `corpus.json` case is repository-generated (`generate.ts`: a random complete grid
under valid symmetries, constraints read off it, givens thinned while the
independent oracles still prove uniqueness). The public hard-classic list of
spec §3.9 is not ingested: no license was verified, so no third-party puzzle
is in `corpus.json` (see `docs/history/m25-corpus.md`; the M2.6 evaluation
corpus below is the exception).

Files, all test-only and free of production imports except where noted:

| File | Role |
| --- | --- |
| `generate.ts` | 9x9 generators for classic, killer, thermometer, kropki, arrow, mixed |
| `corpus-schema.ts` | Entry shape, hashes, partition rule, targets, `assembleCorpus` |
| `sample.ts` | Sampling harness over the Explain trajectory (imports the engine) |
| `train.ts` | Ridge fit to the fixed-point estimator model |
| `ablate.ts` | Metrics A-F of spec §3.12 over held-out traces |
| `eval-corpus.ts` | M2.6 evaluation corpus builder (classic only, no engine import) |

Runners live in `tests/unit/solver/build-corpus.test.ts`, `bench-sample.test.ts`
and `bench-ablate.test.ts`; each validates the committed artefacts in the
normal suite and rebuilds them only under its environment flag (`CORPUS`,
`SAMPLES`, `ABLATE`), sharded so several Node processes can share the work.

The M2 benchmark harness note still holds: the 5 cold/30 warm trials, 4x CPU
throttle, memory/transport/worker/cancellation matrix and raw browser
performance capture were not run; the 10-second / 70 % human profile defaults
remain proposed and rollout remains off.

## M2.6 evaluation corpus

`eval-corpus.json` (schema 1, spec M2.6 §5 T01) is the classic 9x9 set every
M2.6 task measures the exact count against. `eval-corpus.ts` rebuilds it
(`EVAL_CORPUS=write npx vitest run tests/unit/solver/exact-reference.test.ts`);
each case records its 81-digit puzzle, given count, source, the count label
(`0`, `1`, `2+`) and unique solution from the independent bitmask DFS
`../reference-dfs.ts`, whether naked or naked plus hidden singles solve it,
and the generator seed where there is one.

- **Named**: the repository easy `PUZZLE`, a 17-clue puzzle, AI Escargot,
  Inkala 2012, Golden Nugget, the anti-brute-force grid, Norvig `hard1` and the
  empty grid. These are published puzzles with attributed sources, included as
  test data under the approved M2.6 spec (D103); unlike `corpus.json` above,
  their licence was not verified.
- **Derived**: a hidden-singles grid (seed transformed and thinned while
  naked plus hidden singles still solve it, naked singles alone do not), the
  17-clue puzzle minus its last given, and Escargot poisoned with a wrong
  digit that conflicts with no given.
- **Seeded**: 60 random grids (a transformed `SOLUTION` thinned to 22-36
  givens) and 60 poisoned grids (26-40 givens plus one wrong, non-conflicting
  digit), mulberry32 seeds `0x6d261000+i` and `0x6d262000+i`. Thinning
  rarely leaves a unique grid and the wrong digit is often still consistent
  with some solution: random splits 0/1/59 and poisoned 37/2/21 over counts
  `0`/`1`/`2+`, so the unique-solution comparison rests mostly on the named
  cases.

`tests/unit/solver/exact-reference.test.ts` checks that the engine count and
solution equal the reference on every case. Cases marked `heavy` (Norvig
`hard1`, minutes on the baseline engine) run only with `M26_HEAVY=1`;
`M26_BASELINE_RECORD=<file>` appends nodes and milliseconds per case for
`docs/history/m26-baseline.md`.
