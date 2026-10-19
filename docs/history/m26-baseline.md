# M2.6 exact-count baseline

Spec [M2.6 engine hardening](../specs/2026-09-22-m26-engine-hardening.md) §5 T01, under D103.
This is the **baseline row**: the exact count of the engine as merged at `bc0bb49`
(`EXACT_METHOD = "original-dfs@1"`), measured on `feat/m26-hardening` before any
engine change. T02 and later tasks compare against these numbers.

## How it was measured

- Corpus: `web/tests/solver/bench/eval-corpus.json`, 131 classic 9x9 cases
  (provenance in `web/tests/solver/bench/README.md`).
- Harness: `web/tests/unit/solver/exact-reference.test.ts`. Each case runs the
  shipped classic path (`normalizeClassic`, `assemble(productionRules())`,
  `exactSteps` until `exhausted` or `cap-reached` at two witnesses) and the
  independent bitmask DFS `web/tests/solver/reference-dfs.ts` (limit 2), and
  checks count and solution. `M26_BASELINE_RECORD=<file>` writes one JSON line
  per case; milliseconds are wall time around each search in the same process.
- Machine: Intel Core i5-1345U, Windows 11, Node v24.19.0, npm 11.17.0, vitest 5.0.0, **on
  battery** (the M2.5 T17 run measured this laptop at about 2.7x slower on
  battery than on mains). One vitest process, nothing else running.
- Commands, from `web/`:

  ```text
  M26_BASELINE_RECORD=<file> npx vitest run tests/unit/solver/exact-reference.test.ts
  M26_HEAVY=1 M26_BASELINE_RECORD=<file> npx vitest run tests/unit/solver/exact-reference.test.ts -t norvig-hard1
  ```

## Result

Engine and reference agree on count and solution on all 131 cases (0
disagreements). Count labels: 10 unique, 38 with no solution, 83 with at
least two; the seeded grids are mostly `2+` (random) or refuted at the first
node (poisoned), so the unique-solution comparison rests mostly on the named
cases. Node, backtrack and depth counts were identical on every run;
only times vary.

- The default run (130 cases, `norvig-hard1` skipped) took 7.7–8.3 s for the
  file. Engine median 12.9–20.2 ms per case, p90 25.8–32 ms; slowest Golden
  Nugget (470 nodes, 652–718 ms), Inkala 2012 (321 nodes, 416–439 ms) and
  Escargot (143 nodes, 213–239 ms).
- `norvig-hard1` (17 givens, at least two solutions): **658,727 nodes, 786 s**
  (≈ 1.19 ms per node). The reference needs 1,526,541 nodes in 1.8 s. The node
  count equals the 2026-09-21 evaluation's 658k; its 367 s was on mains. The
  spec's "5.3 M nodes" for its reference DFS came from the evaluation's probe
  script, which is not in the repository, so the gap is not reconciled here;
  this reference counts one node per search state entered and propagates
  naked singles inside each node.
- Against the spec §6 targets: `hard1` needs < 5 s (now 786 s), Escargot < 50 ms
  (now 213–239 ms) and every other case < 1 s (all are, Golden Nugget closest).
- The first pass of each measurement was disturbed (default run 117 s with
  ~2 s on one-node cases; `hard1` 1,184 s with the reference at 14.0 s instead
  of 1.8 s) and is not used. The tables use the two undisturbed default passes
  (runs 2 and 3) and the second `hard1` pass.

## Test allowances

`norvig-hard1` is marked `heavy` in the corpus and runs only with `M26_HEAVY=1`,
under a 3,600 s per-test allowance (about 4.6x the undisturbed and 3x the
disturbed measurement). Every other case runs in the default suite under the
120 s project default; the slowest took 23.3 s in the disturbed pass. T02's
target (`hard1` < 5 s) should let it leave the heavy gate.

## Per case

| Case | Count | Givens | Engine nodes | Backtracks | Depth | Engine ms (run 2 / run 3) | Reference nodes | Reference ms (run 2 / run 3) |
| --- | :-: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| easy | 1 | 30 | 1 | 0 | 0 | 28.5 / 32.1 | 1 | 0.6 / 1.4 |
| hidden-singles | 1 | 26 | 1 | 0 | 0 | 41.2 / 34.1 | 13 | 0.7 / 0.7 |
| seventeen | 1 | 17 | 1 | 0 | 0 | 37 / 24.6 | 1,919 | 20.9 / 7.9 |
| escargot | 1 | 23 | 143 | 71 | 8 | 238.8 / 213.1 | 231 | 1.2 / 0.7 |
| inkala-2012 | 1 | 21 | 321 | 160 | 14 | 415.7 / 439.1 | 3,599 | 68.6 / 8 |
| golden-nugget | 1 | 21 | 470 | 236 | 12 | 718.2 / 652 | 2,752 | 7.9 / 6.2 |
| anti-brute-force | 1 | 17 | 1 | 0 | 0 | 16.5 / 25.8 | 18,618 | 26.6 / 37.2 |
| norvig-hard1 | 2+ | 17 | 658,727 | 330,881 | 29 | 785,676.1 / – | 1,526,541 | 1,772.2 / – |
| empty | 2+ | 0 | 49 | 0 | 47 | 32 / 32.8 | 49 | 1 / 1.5 |
| seventeen-minus-one | 2+ | 16 | 14 | 0 | 12 | 38.4 / 40.9 | 2,403 | 13.3 / 10.8 |
| escargot-poisoned | 0 | 24 | 13 | 7 | 5 | 55.4 / 30.4 | 39 | 0.4 / 0.2 |
| random-00 | 2+ | 28 | 9 | 0 | 7 | 25.6 / 19.5 | 126 | 0.3 / 0.3 |
| random-01 | 2+ | 27 | 9 | 0 | 7 | 34.8 / 19.1 | 12 | 0.1 / 0.1 |
| random-02 | 2+ | 31 | 5 | 0 | 3 | 17.6 / 23.9 | 5 | 0.3 / 0 |
| random-03 | 2+ | 33 | 6 | 0 | 4 | 18.8 / 23.5 | 7 | 0 / 0.1 |
| random-04 | 2+ | 33 | 5 | 0 | 3 | 22.5 / 14.4 | 5 | 0.1 / 0.1 |
| random-05 | 2+ | 36 | 4 | 0 | 2 | 16.4 / 14 | 11 | 0.1 / 0 |
| random-06 | 2+ | 35 | 4 | 0 | 2 | 19.1 / 12.7 | 5 | 0.1 / 0 |
| random-07 | 2+ | 30 | 6 | 0 | 4 | 20.3 / 14.7 | 6 | 0.1 / 0.1 |
| random-08 | 2+ | 29 | 7 | 0 | 5 | 22.3 / 16.7 | 10 | 0 / 0 |
| random-09 | 2+ | 32 | 7 | 0 | 5 | 14.3 / 14 | 9 | 0 / 0.1 |
| random-10 | 2+ | 24 | 13 | 0 | 11 | 24.8 / 14.2 | 19 | 0.1 / 0.1 |
| random-11 | 2+ | 23 | 22 | 0 | 20 | 28.3 / 30.7 | 27 | 0.1 / 0.1 |
| random-12 | 2+ | 34 | 7 | 0 | 5 | 20.5 / 11.9 | 23 | 0.1 / 0.2 |
| random-13 | 2+ | 23 | 16 | 0 | 14 | 23.9 / 20.1 | 32 | 0.1 / 0.1 |
| random-14 | 2+ | 29 | 11 | 0 | 9 | 29.9 / 19.3 | 21 | 0.1 / 0 |
| random-15 | 2+ | 29 | 6 | 0 | 4 | 17 / 11.5 | 11 | 0.1 / 0 |
| random-16 | 2+ | 32 | 8 | 0 | 6 | 19.8 / 16.4 | 9 | 0 / 0 |
| random-17 | 2+ | 22 | 21 | 0 | 19 | 35.1 / 24.3 | 22 | 0.1 / 0.1 |
| random-18 | 2+ | 36 | 3 | 0 | 1 | 16.6 / 10.9 | 3 | 0 / 0 |
| random-19 | 2+ | 23 | 17 | 0 | 15 | 25.6 / 56.5 | 19 | 0.1 / 0.1 |
| random-20 | 2+ | 28 | 5 | 0 | 3 | 18.5 / 15.6 | 6 | 0 / 0 |
| random-21 | 2+ | 27 | 13 | 1 | 10 | 28.8 / 25.7 | 15 | 0.1 / 0.1 |
| random-22 | 2+ | 30 | 9 | 0 | 7 | 26.7 / 24.4 | 9 | 0.1 / 0.1 |
| random-23 | 2+ | 27 | 9 | 0 | 7 | 33.4 / 18.8 | 12 | 0.1 / 0.1 |
| random-24 | 2+ | 31 | 11 | 1 | 8 | 23.6 / 17.8 | 37 | 0.1 / 0.1 |
| random-25 | 2+ | 31 | 8 | 0 | 6 | 18.8 / 13.8 | 12 | 0 / 0 |
| random-26 | 2+ | 31 | 6 | 0 | 4 | 23.7 / 15.5 | 6 | 0.1 / 0 |
| random-27 | 2+ | 34 | 5 | 0 | 3 | 25.5 / 13.2 | 7 | 0.1 / 0 |
| random-28 | 2+ | 26 | 9 | 0 | 7 | 31.1 / 19.6 | 9 | 0.1 / 0.1 |
| random-29 | 2+ | 34 | 5 | 0 | 3 | 18.3 / 19.6 | 5 | 0 / 0.1 |
| random-30 | 2+ | 27 | 7 | 0 | 5 | 16.7 / 15.1 | 8 | 0.1 / 0.1 |
| random-31 | 2+ | 30 | 5 | 0 | 3 | 17.8 / 15.4 | 5 | 0.1 / 0 |
| random-32 | 2+ | 32 | 6 | 0 | 4 | 16.5 / 17.8 | 8 | 0 / 0.1 |
| random-33 | 2+ | 22 | 12 | 0 | 10 | 20.7 / 41.9 | 14 | 0.1 / 0.1 |
| random-34 | 2+ | 29 | 10 | 0 | 8 | 22.9 / 17.2 | 16 | 0.1 / 0.1 |
| random-35 | 2+ | 35 | 4 | 0 | 2 | 21.2 / 11.6 | 5 | 0.3 / 0 |
| random-36 | 2+ | 28 | 7 | 0 | 5 | 21.6 / 16.7 | 24 | 0.1 / 0 |
| random-37 | 2+ | 27 | 9 | 0 | 7 | 24.8 / 16.7 | 9 | 0.1 / 0 |
| random-38 | 2+ | 23 | 12 | 0 | 10 | 27.8 / 26 | 13 | 0.1 / 0 |
| random-39 | 2+ | 30 | 8 | 0 | 6 | 22.8 / 12.8 | 16 | 0.1 / 0.1 |
| random-40 | 2+ | 30 | 7 | 0 | 5 | 19.2 / 8.9 | 8 | 0.1 / 0 |
| random-41 | 2+ | 26 | 7 | 0 | 5 | 29.2 / 12.5 | 34 | 0.1 / 0.1 |
| random-42 | 2+ | 27 | 15 | 0 | 13 | 27 / 12.1 | 20 | 0.1 / 0 |
| random-43 | 2+ | 22 | 17 | 0 | 15 | 36.8 / 14.6 | 25 | 0.1 / 0 |
| random-44 | 2+ | 33 | 6 | 0 | 4 | 26.8 / 12.3 | 11 | 0.1 / 0 |
| random-45 | 2+ | 25 | 13 | 1 | 10 | 30.7 / 12.9 | 16 | 0.1 / 0 |
| random-46 | 2+ | 22 | 14 | 1 | 11 | 27.2 / 15.3 | 54 | 0.2 / 0.1 |
| random-47 | 2+ | 27 | 10 | 0 | 8 | 28.1 / 11.4 | 16 | 0.1 / 0 |
| random-48 | 2+ | 36 | 5 | 0 | 3 | 15 / 7.5 | 5 | 0 / 0 |
| random-49 | 2+ | 25 | 15 | 1 | 12 | 32.4 / 16.7 | 20 | 0.1 / 0.1 |
| random-50 | 2+ | 34 | 3 | 0 | 1 | 17.4 / 11.5 | 11 | 0 / 0 |
| random-51 | 2+ | 26 | 11 | 0 | 9 | 19.7 / 15.9 | 10 | 0.1 / 0 |
| random-52 | 2+ | 23 | 14 | 0 | 12 | 29.8 / 17.5 | 17 | 0.1 / 0.1 |
| random-53 | 2+ | 27 | 9 | 0 | 7 | 24.4 / 14.6 | 19 | 0.1 / 0 |
| random-54 | 2+ | 29 | 11 | 0 | 9 | 23.4 / 11.5 | 17 | 0.1 / 0 |
| random-55 | 2+ | 23 | 19 | 0 | 17 | 24.5 / 11.3 | 20 | 0.1 / 0.1 |
| random-56 | 2+ | 30 | 10 | 1 | 7 | 20.2 / 8.8 | 11 | 0.1 / 0.1 |
| random-57 | 1 | 31 | 1 | 0 | 0 | 15.9 / 8.3 | 1 | 0 / 0 |
| random-58 | 2+ | 23 | 20 | 0 | 18 | 26.4 / 12.5 | 23 | 0.1 / 0.1 |
| random-59 | 2+ | 26 | 11 | 0 | 9 | 22 / 11.9 | 30 | 0.1 / 0.1 |
| poisoned-00 | 0 | 41 | 1 | 1 | 0 | 11.8 / 8.6 | 1 | 0 / 0 |
| poisoned-01 | 2+ | 29 | 6 | 0 | 4 | 25.1 / 15.1 | 14 | 0.1 / 0 |
| poisoned-02 | 0 | 33 | 1 | 1 | 0 | 13.8 / 7.7 | 1 | 0 / 0 |
| poisoned-03 | 2+ | 29 | 7 | 0 | 5 | 26.6 / 10.8 | 10 | 0.1 / 0 |
| poisoned-04 | 0 | 34 | 1 | 1 | 0 | 12.8 / 3.9 | 1 | 0 / 0 |
| poisoned-05 | 0 | 35 | 1 | 1 | 0 | 21.7 / 6.2 | 1 | 0 / 0 |
| poisoned-06 | 0 | 33 | 1 | 1 | 0 | 12.6 / 4 | 1 | 0 / 0 |
| poisoned-07 | 0 | 29 | 1 | 1 | 0 | 17.4 / 6 | 207 | 0.5 / 0.2 |
| poisoned-08 | 2+ | 32 | 6 | 0 | 4 | 24.5 / 16.4 | 9 | 0.1 / 0.1 |
| poisoned-09 | 0 | 37 | 1 | 1 | 0 | 12 / 5 | 1 | 0 / 0 |
| poisoned-10 | 2+ | 28 | 5 | 0 | 3 | 23.9 / 13.2 | 6 | 0 / 0 |
| poisoned-11 | 0 | 36 | 1 | 1 | 0 | 8 / 7.1 | 1 | 0 / 0 |
| poisoned-12 | 0 | 41 | 1 | 1 | 0 | 7.7 / 7.1 | 1 | 0 / 0 |
| poisoned-13 | 2+ | 28 | 10 | 2 | 5 | 32 / 11.8 | 65 | 0.2 / 0.1 |
| poisoned-14 | 0 | 34 | 1 | 1 | 0 | 8.5 / 6 | 1 | 0 / 0 |
| poisoned-15 | 0 | 40 | 1 | 1 | 0 | 9 / 5.1 | 1 | 0 / 0 |
| poisoned-16 | 2+ | 34 | 7 | 1 | 4 | 25.8 / 13.5 | 9 | 0 / 0 |
| poisoned-17 | 0 | 41 | 1 | 1 | 0 | 8.9 / 5.3 | 1 | 0 / 0 |
| poisoned-18 | 0 | 33 | 1 | 1 | 0 | 11.3 / 8 | 7 | 0 / 0 |
| poisoned-19 | 2+ | 28 | 11 | 0 | 9 | 23.8 / 15.1 | 11 | 0.1 / 0.1 |
| poisoned-20 | 2+ | 30 | 6 | 0 | 4 | 27.4 / 14.5 | 24 | 0.1 / 0.1 |
| poisoned-21 | 2+ | 33 | 3 | 0 | 1 | 16.9 / 9.2 | 3 | 0.1 / 0 |
| poisoned-22 | 2+ | 30 | 6 | 0 | 4 | 25.7 / 17.9 | 14 | 0.1 / 0.1 |
| poisoned-23 | 0 | 32 | 1 | 1 | 0 | 10 / 8.1 | 1 | 0 / 0 |
| poisoned-24 | 0 | 29 | 1 | 1 | 0 | 12.9 / 9.9 | 1 | 0 / 0 |
| poisoned-25 | 0 | 37 | 1 | 1 | 0 | 16.1 / 6.4 | 1 | 0 / 0 |
| poisoned-26 | 2+ | 37 | 4 | 0 | 2 | 18.2 / 10.6 | 4 | 0 / 0 |
| poisoned-27 | 0 | 38 | 1 | 1 | 0 | 7.3 / 5.1 | 1 | 0 / 0 |
| poisoned-28 | 0 | 27 | 1 | 1 | 0 | 7.7 / 6.7 | 1 | 0 / 0 |
| poisoned-29 | 2+ | 31 | 5 | 0 | 3 | 17.5 / 12.6 | 8 | 0.1 / 0 |
| poisoned-30 | 0 | 40 | 1 | 1 | 0 | 9.4 / 5 | 1 | 0 / 0 |
| poisoned-31 | 0 | 39 | 1 | 1 | 0 | 9.2 / 7.6 | 1 | 0 / 0 |
| poisoned-32 | 2+ | 28 | 8 | 0 | 6 | 25.2 / 11.9 | 12 | 0.1 / 0.1 |
| poisoned-33 | 0 | 38 | 1 | 1 | 0 | 16.6 / 8.2 | 1 | 0 / 0 |
| poisoned-34 | 2+ | 31 | 8 | 0 | 6 | 23.7 / 22.1 | 49 | 0.1 / 0.1 |
| poisoned-35 | 2+ | 30 | 5 | 0 | 3 | 19.2 / 12.8 | 5 | 0.1 / 0 |
| poisoned-36 | 0 | 38 | 1 | 1 | 0 | 11.2 / 6.2 | 1 | 0 / 0 |
| poisoned-37 | 2+ | 29 | 12 | 0 | 10 | 22.4 / 15.1 | 12 | 0.1 / 0.1 |
| poisoned-38 | 2+ | 34 | 4 | 0 | 2 | 16.2 / 13.1 | 4 | 0 / 0 |
| poisoned-39 | 0 | 37 | 1 | 1 | 0 | 9.4 / 10.1 | 1 | 0 / 0 |
| poisoned-40 | 0 | 37 | 1 | 1 | 0 | 8.8 / 10.3 | 1 | 0 / 0 |
| poisoned-41 | 2+ | 30 | 3 | 0 | 1 | 22.8 / 14.5 | 18 | 0.1 / 0.1 |
| poisoned-42 | 1 | 35 | 1 | 0 | 0 | 13.2 / 7.8 | 1 | 0 / 0 |
| poisoned-43 | 1 | 34 | 1 | 0 | 0 | 16.8 / 9.9 | 5 | 0 / 0 |
| poisoned-44 | 0 | 29 | 1 | 1 | 0 | 10 / 5.2 | 3 | 0 / 0 |
| poisoned-45 | 0 | 38 | 1 | 1 | 0 | 12.1 / 7.5 | 1 | 0 / 0 |
| poisoned-46 | 0 | 41 | 1 | 1 | 0 | 13.4 / 5.6 | 1 | 0 / 0 |
| poisoned-47 | 0 | 40 | 1 | 1 | 0 | 11 / 5.2 | 1 | 0 / 0 |
| poisoned-48 | 0 | 34 | 1 | 1 | 0 | 12.2 / 9.5 | 1 | 0 / 0 |
| poisoned-49 | 0 | 37 | 1 | 1 | 0 | 10.1 / 5.7 | 1 | 0 / 0 |
| poisoned-50 | 2+ | 29 | 6 | 0 | 4 | 21 / 24.6 | 6 | 0.1 / 0 |
| poisoned-51 | 0 | 27 | 1 | 1 | 0 | 9.6 / 6.9 | 9 | 0.1 / 0 |
| poisoned-52 | 0 | 29 | 1 | 1 | 0 | 13.1 / 7.2 | 3 | 0 / 0 |
| poisoned-53 | 0 | 33 | 1 | 1 | 0 | 9.6 / 5.4 | 1 | 0 / 0 |
| poisoned-54 | 0 | 27 | 1 | 1 | 0 | 9.4 / 8.7 | 3 | 0 / 0 |
| poisoned-55 | 2+ | 34 | 7 | 1 | 3 | 20.1 / 16.8 | 10 | 0 / 0.1 |
| poisoned-56 | 0 | 31 | 1 | 1 | 0 | 7.4 / 9.2 | 1 | 0 / 0 |
| poisoned-57 | 0 | 36 | 1 | 1 | 0 | 10 / 5.9 | 1 | 0 / 0 |
| poisoned-58 | 2+ | 38 | 3 | 0 | 1 | 13.7 / 14.3 | 3 | 0 / 0 |
| poisoned-59 | 0 | 39 | 1 | 1 | 0 | 5.3 / 11.3 | 1 | 0 / 0 |
