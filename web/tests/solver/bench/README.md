# Solver benchmark corpus and calibration bench

`corpus.json` (schema 2) keeps calibration and held-out cases in separate
arrays. Every case records its family, normalized 81-digit puzzle, variant
constraints (`cage@1`, `order@1`, `difference@1`, `arrow@1`; classic houses
are implied), given count, oracle count, source group, license, generator
seed and the sha256 of its normalized content. The partition is a pure
function of that hash (`corpus-schema.ts`: one in four is held out), so a case
cannot move partitions without a new corpus hash; `corpusHash` is the sha256
of the sorted case hashes and `generator` the hash of `generate.ts`.

Every case is repository-generated (`generate.ts`: a random complete grid
under valid symmetries, constraints read off it, givens thinned while the
independent oracles still prove uniqueness). The public hard-classic list of
spec §3.9 is not ingested: no license was verified, so no third-party puzzle
is in the repository (see `docs/history/m25-corpus.md`).

Files, all test-only and free of production imports except where noted:

| File | Role |
| --- | --- |
| `generate.ts` | 9x9 generators for classic, killer, thermometer, kropki, arrow, mixed |
| `corpus-schema.ts` | Entry shape, hashes, partition rule, targets, `assembleCorpus` |
| `sample.ts` | Sampling harness over the Explain trajectory (imports the engine) |
| `train.ts` | Ridge fit to the fixed-point estimator model |
| `ablate.ts` | Metrics A-F of spec §3.12 over held-out traces |

Runners live in `tests/unit/solver/build-corpus.test.ts`, `bench-sample.test.ts`
and `bench-ablate.test.ts`; each validates the committed artefacts in the
normal suite and rebuilds them only under its environment flag (`CORPUS`,
`SAMPLES`, `ABLATE`), sharded so several Node processes can share the work.

The M2 benchmark harness note still holds: the 5 cold/30 warm trials, 4x CPU
throttle, memory/transport/worker/cancellation matrix and raw browser
performance capture were not run; the 10-second / 70 % human profile defaults
remain proposed and rollout remains off.
