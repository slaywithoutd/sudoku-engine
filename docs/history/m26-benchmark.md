# M2.6 benchmark and default limits

Spec [M2.6 engine hardening](../specs/2026-09-22-m26-engine-hardening.md) §5 T08 and §6, D063, D103.

## Setup

- Harness: `web/tests/browser/solver-bench.html` runs each request through the real module worker (`startWorker`, `solve-classic`, the Solve screen's own path) and reports what the screen would show, including the step sequence; `web/tests/e2e/solver-m26-benchmark.spec.ts` drives it (`M26_BENCH=1`, `M26_BENCH_PRESETS`, `M26_BENCH_RUNS`, `M26_BENCH_IDS`, `M26_BENCH_MODES`, `M26_BENCH_OUT`) and fails on a worker error. `node web/tests/browser/m26-bench-table.mjs <rows.json>` prints the per-case table; "Same result" compares the step sequence, final grid, status and stop reason of the runs.
- Command (from `web/`): `M26_BENCH=1 M26_BENCH_PRESETS=15000,60000 M26_BENCH_RUNS=2 M26_BENCH_OUT=<file> npx playwright test tests/e2e/solver-m26-benchmark.spec.ts`. Served by the Vite dev server (`npm run test:serve`), not a production build.
- Cases: the evaluation corpus's named and derived cases plus every unique case (14), Explain and Analyze, at the 15 s and 60 s presets, two runs each.
- Browser matrix: **Chromium only** (Playwright's bundled Chromium, dev server). Firefox and WebKit are not installed on the development machine, and installing them is a download that was not authorised in this session, so the slowest browser measured is Chromium. The other browsers are **not measured**.
- Machine: Intel Core i5-1345U, Windows 11, Node v24.19.0, **on mains** for both passes below. The laptop alternates between a fast and a slow state that this session cannot control (about 3x apart, more under load from other programs). The final pass (2026-10-19, 23:42–23:53) ran in the slow state throughout: the CPU read its 1.6 GHz base clock, Easy took 0.9–9.3 s, and the exact count of Escargot 64–185 ms. The first pass (superseded defaults) ran partly in the fast state; its exact-count and singles timings do not depend on the work budget and are the fast-state evidence below.

## Defaults chosen

| Parameter | Spec (provisional) | Chosen | Why |
| --- | --- | --- | --- |
| Work budget | 60M units at every preset | **120 units per ms** of the time limit: 1.8M at 15 s, 7.2M at 60 s, 21.6M at 180 s (`WORK_UNITS_PER_MS`, `classicLimitsFor`) | The logical phase must end on its work cut, not the clock (D103). After a conclusive count it gets nearly the whole budget. The slowest rate measured over a whole 60 s run is 137k units/s (Inkala Explain, slow state: 7.2M units in 52.6 s), so 120 units/ms ends at about 88 % of the time limit there. Escargot, Inkala and Golden Nugget reach tier 5 within 1.8M units, and Golden Nugget's tier-5 step comes at 1.16M (deterministic, fake clock). |
| Precount share | 30 % | **80 %** (`PRECOUNT_SHARE`) | Norvig `hard1` needs 1.27M exact units (about 1.3M with the reservation), the most of any corpus case; 80 % of 1.8M is 1.44M. A conclusive count returns its unused share to the logical phase, so the share binds only on an inconclusive count, which then leaves the logical phase 20 %. Exact units take about a third of the time of logical ones. |
| Tier cap | 2,000,000 units per job per state | **100,000** (unchanged from T05) | Measured in T05: 2M cannot reach tier 5 within 15 s; at 100k all three hard grids serve tier-5/6 jobs within 15 s. |
| UI presets | 15 s, 60 s, 180 s | unchanged | The budget now scales with them. |
| Correctness-mark count | 30 % of the solve limits | **18M units, 18 s** (`COUNT_CLASSIC_LIMITS`) | Its own fixed budget, the value it had before T08, so tying the Solve budget to the preset does not change which grids get correctness marks. |

The first T08 pass chose 200 units per ms and a 45 % share. The T08 review showed that the logical phase gets the whole budget after a conclusive count, so at 150–200k units/s 200 units per ms ends hard grids on the clock (8 of 12 hard-grid runs at 15 s were `time-limit`); the defaults above replace it.

## Results against §6 (Chromium, mains, final pass in the slow state)

- Exact count, every case < 1 s: **met** (at most 642 ms; `hard1` 1.6–2.6 s against < 5 s). Escargot < 50 ms: **met in the fast state only** (34–46 ms, first pass); **missed in the slow state** (64–185 ms).
- Easy (singles-only) Explain < 1 s end to end: **met in the fast state only** (0.5–0.6 s, first pass); **missed in the slow state** (0.9–9.3 s; 1.6–9.3 s at the 15 s preset).
- 17-clue singles Explain < 3 s: met in the fast state (0.6–0.9 s) and at the 60 s preset in the slow state (1.1–1.8 s); **missed once in the slow state** (4.2 s and 2.5 s at 15 s).
- Escargot, Inkala 2012, Golden Nugget at the 15 s preset reach tier ≥ 5: **met** in every run (highest tier tried 5–6); ≥ 1 tier-5/6 step: Golden Nugget only (10.1 and 10.7 s), the accepted known limit of the chain/forcing detectors (T05).
- Engine Analyze: at least one step on every unique corpus case (27–90 steps): **met**.
- Determinism at 60 s: **met** in the slow state: both runs of every case gave the same step sequence, final grid, status and stop reason, and every hard grid ended on its work budget (`tier-cap` or `work-limit`, 18.2–52.6 s). At 15 s Explain ended on work in 5 of 6 hard-grid runs (Inkala's first run reached the time stop at 16.1 s with the same steps), and Analyze, which has no tier cap, reached the time stop on all 6: at the 15 s preset those results depend on the machine's speed, which §6 does not require.
- UI: `hard1` shows "Multiple solutions" at 15 s, and every result shows a stop reason and coverage (T07 Playwright).

The §6 time targets for the easy puzzle and the Escargot count are met only in the laptop's fast state; they are reported as missed in its slow state, not as met.

## Per case (final pass: 120 units/ms, 80 % share)

| Case | Mode | Preset | ms | Count verified ms | Logic | Stop reason | Steps | Highest tier tried | First tier-5/6 step ms | Same result |
| --- | --- | ---: | ---: | ---: | --- | --- | ---: | ---: | ---: | :-: |
| easy | explain | 15 s | 9288 / 1646 | 642 / 75 | solved / solved | solved / solved | 78 | 0 | – / – | yes |
| easy | analyze | 15 s | 6408 / 2237 | 418 / 61 | solved / solved | solved / solved | 78 | 2 | – / – | yes |
| hidden-singles | explain | 15 s | 4924 / 2060 | 288 / 58 | solved / solved | solved / solved | 82 | 0 | – / – | yes |
| hidden-singles | analyze | 15 s | 4941 / 2261 | 270 / 89 | solved / solved | solved / solved | 82 | 2 | – / – | yes |
| seventeen | explain | 15 s | 4152 / 2459 | 272 / 108 | solved / solved | solved / solved | 90 | 0 | – / – | yes |
| seventeen | analyze | 15 s | 2740 / 2683 | 132 / 104 | solved / solved | solved / solved | 90 | 2 | – / – | yes |
| escargot | explain | 15 s | 14134 / 12029 | 129 / 185 | incomplete / incomplete | tier-cap / tier-cap | 28 | 5 | – / – | yes |
| escargot | analyze | 15 s | 15410 / 15641 | 68 / 117 | incomplete / incomplete | time-limit / time-limit | 28 | 6 | – / – | yes |
| inkala-2012 | explain | 15 s | 16056 / 12460 | 208 / 99 | incomplete / incomplete | time-limit / tier-cap | 27 | 5 / 6 | – / – | no |
| inkala-2012 | analyze | 15 s | 15600 / 15651 | 96 / 96 | incomplete / incomplete | time-limit / time-limit | 27 | 6 | – / – | yes |
| golden-nugget | explain | 15 s | 14160 / 14577 | 126 / 95 | incomplete / incomplete | tier-cap / tier-cap | 28 | 5 | 10107 / 10723 | yes |
| golden-nugget | analyze | 15 s | 15499 / 15690 | 95 / 141 | incomplete / incomplete | time-limit / time-limit | 27 | 6 | – / – | yes |
| anti-brute-force | explain | 15 s | 2054 / 2483 | 104 / 202 | solved / solved | solved / solved | 90 | 0 | – / – | yes |
| anti-brute-force | analyze | 15 s | 2520 / 2370 | 75 / 96 | solved / solved | solved / solved | 90 | 2 | – / – | yes |
| norvig-hard1 | explain | 15 s | 2792 / 2729 | 2132 / 2169 | not-started / not-started | not-started / not-started | 0 | -1 | – / – | yes |
| norvig-hard1 | analyze | 15 s | 3049 / 2903 | 2498 / 2248 | not-started / not-started | not-started / not-started | 0 | -1 | – / – | yes |
| empty | explain | 15 s | 498 / 574 | 76 / 74 | not-started / not-started | not-started / not-started | 0 | -1 | – / – | yes |
| empty | analyze | 15 s | 504 / 811 | 74 / 109 | not-started / not-started | not-started / not-started | 0 | -1 | – / – | yes |
| seventeen-minus-one | explain | 15 s | 437 / 526 | 61 / 84 | not-started / not-started | not-started / not-started | 0 | -1 | – / – | yes |
| seventeen-minus-one | analyze | 15 s | 559 / 834 | 74 / 115 | not-started / not-started | not-started / not-started | 0 | -1 | – / – | yes |
| escargot-poisoned | explain | 15 s | 532 / 869 | 47 / 145 | not-started / not-started | not-started / not-started | 0 | -1 | – / – | yes |
| escargot-poisoned | analyze | 15 s | 715 / 398 | 98 / 57 | not-started / not-started | not-started / not-started | 0 | -1 | – / – | yes |
| random-57 | explain | 15 s | 1825 / 2336 | 153 / 127 | solved / solved | solved / solved | 76 | 0 | – / – | yes |
| random-57 | analyze | 15 s | 1750 / 2418 | 94 / 150 | solved / solved | solved / solved | 76 | 2 | – / – | yes |
| poisoned-42 | explain | 15 s | 1984 / 1842 | 127 / 71 | solved / solved | solved / solved | 73 | 0 | – / – | yes |
| poisoned-42 | analyze | 15 s | 1728 / 2039 | 63 / 98 | solved / solved | solved / solved | 73 | 2 | – / – | yes |
| poisoned-43 | explain | 15 s | 1387 / 1842 | 72 / 74 | solved / solved | solved / solved | 74 | 0 | – / – | yes |
| poisoned-43 | analyze | 15 s | 2203 / 2018 | 111 / 68 | solved / solved | solved / solved | 74 | 2 | – / – | yes |
| easy | explain | 60 s | 1659 / 902 | 87 / 59 | solved / solved | solved / solved | 78 | 0 | – / – | yes |
| easy | analyze | 60 s | 1976 / 959 | 84 / 55 | solved / solved | solved / solved | 78 | 2 | – / – | yes |
| hidden-singles | explain | 60 s | 1620 / 937 | 53 / 48 | solved / solved | solved / solved | 82 | 0 | – / – | yes |
| hidden-singles | analyze | 60 s | 1744 / 1558 | 92 / 95 | solved / solved | solved / solved | 82 | 2 | – / – | yes |
| seventeen | explain | 60 s | 1813 / 1145 | 64 / 59 | solved / solved | solved / solved | 90 | 0 | – / – | yes |
| seventeen | analyze | 60 s | 1674 / 1740 | 82 / 89 | solved / solved | solved / solved | 90 | 2 | – / – | yes |
| escargot | explain | 60 s | 29526 / 26414 | 128 / 129 | incomplete / incomplete | tier-cap / tier-cap | 28 | 6 | – / – | yes |
| escargot | analyze | 60 s | 30820 / 42421 | 64 / 93 | incomplete / incomplete | work-limit / work-limit | 28 | 6 | – / – | yes |
| inkala-2012 | explain | 60 s | 52621 / 27900 | 142 / 137 | incomplete / incomplete | tier-cap / tier-cap | 27 | 6 | – / – | yes |
| inkala-2012 | analyze | 60 s | 20469 / 18242 | 48 / 57 | incomplete / incomplete | work-limit / work-limit | 27 | 6 | – / – | yes |
| golden-nugget | explain | 60 s | 23158 / 22678 | 99 / 51 | incomplete / incomplete | tier-cap / tier-cap | 28 | 6 | 5269 / 4166 | yes |
| golden-nugget | analyze | 60 s | 25496 / 22544 | 56 / 61 | incomplete / incomplete | work-limit / work-limit | 28 | 6 | 7803 / 6785 | yes |
| anti-brute-force | explain | 60 s | 1097 / 790 | 75 / 40 | solved / solved | solved / solved | 90 | 0 | – / – | yes |
| anti-brute-force | analyze | 60 s | 1162 / 1013 | 55 / 46 | solved / solved | solved / solved | 90 | 2 | – / – | yes |
| norvig-hard1 | explain | 60 s | 1927 / 3372 | 1582 / 2580 | not-started / not-started | not-started / not-started | 0 | -1 | – / – | yes |
| norvig-hard1 | analyze | 60 s | 3019 / 2405 | 2502 / 1975 | not-started / not-started | not-started / not-started | 0 | -1 | – / – | yes |
| empty | explain | 60 s | 547 / 381 | 84 / 54 | not-started / not-started | not-started / not-started | 0 | -1 | – / – | yes |
| empty | analyze | 60 s | 478 / 441 | 78 / 83 | not-started / not-started | not-started / not-started | 0 | -1 | – / – | yes |
| seventeen-minus-one | explain | 60 s | 479 / 497 | 81 / 82 | not-started / not-started | not-started / not-started | 0 | -1 | – / – | yes |
| seventeen-minus-one | analyze | 60 s | 460 / 453 | 89 / 80 | not-started / not-started | not-started / not-started | 0 | -1 | – / – | yes |
| escargot-poisoned | explain | 60 s | 404 / 374 | 47 / 72 | not-started / not-started | not-started / not-started | 0 | -1 | – / – | yes |
| escargot-poisoned | analyze | 60 s | 414 / 362 | 53 / 48 | not-started / not-started | not-started / not-started | 0 | -1 | – / – | yes |
| random-57 | explain | 60 s | 1114 / 1303 | 55 / 68 | solved / solved | solved / solved | 76 | 0 | – / – | yes |
| random-57 | analyze | 60 s | 1024 / 1220 | 55 / 64 | solved / solved | solved / solved | 76 | 2 | – / – | yes |
| poisoned-42 | explain | 60 s | 872 / 848 | 47 / 54 | solved / solved | solved / solved | 73 | 0 | – / – | yes |
| poisoned-42 | analyze | 60 s | 967 / 813 | 56 / 53 | solved / solved | solved / solved | 73 | 2 | – / – | yes |
| poisoned-43 | explain | 60 s | 906 / 943 | 68 / 60 | solved / solved | solved / solved | 74 | 0 | – / – | yes |
| poisoned-43 | analyze | 60 s | 856 / 940 | 48 / 58 | solved / solved | solved / solved | 74 | 2 | – / – | yes |

## First pass (200 units/ms, 45 % share; superseded)

Recorded before the reopened-cap stop reason was fixed, so some cap-bound stops read `work-limit`; its "Same result" compared steps count, final grid, status and stop reason only.

| Case | Mode | Preset | ms (run 1 / 2) | Count verified ms (1 / 2) | Logic | Stop reason (1 / 2) | Steps | Highest tier tried | First tier-5/6 step ms | Same result |
| --- | --- | ---: | ---: | ---: | --- | --- | ---: | ---: | ---: | :-: |
| easy | explain | 15 s | 616 / 1788 | 36 / 76 | solved | solved / solved | 78 | 0 | – / – | yes |
| easy | analyze | 15 s | 547 / 2117 | 30 / 64 | solved | solved / solved | 78 | 2 | – / – | yes |
| hidden-singles | explain | 15 s | 504 / 2072 | 31 / 81 | solved | solved / solved | 82 | 0 | – / – | yes |
| hidden-singles | analyze | 15 s | 564 / 2116 | 28 / 73 | solved | solved / solved | 82 | 2 | – / – | yes |
| seventeen | explain | 15 s | 583 / 1921 | 36 / 88 | solved | solved / solved | 90 | 0 | – / – | yes |
| seventeen | analyze | 15 s | 946 / 2406 | 57 / 106 | solved | solved / solved | 90 | 2 | – / – | yes |
| escargot | explain | 15 s | 7947 / 15618 | 36 / 138 | incomplete | work-limit / time-limit | 28 | 6 | – / – | steps yes, stop no |
| escargot | analyze | 15 s | 9690 / 15604 | 46 / 123 | incomplete | work-limit / time-limit | 28 | 6 | – / – | steps yes, stop no |
| inkala-2012 | explain | 15 s | 10611 / 15531 | 38 / 58 | incomplete | tier-cap / time-limit | 27 | 6 | – / – | steps yes, stop no |
| inkala-2012 | analyze | 15 s | 15486 / 15495 | 78 / 87 | incomplete | time-limit / time-limit | 27 | 6 | – / – | yes |
| golden-nugget | explain | 15 s | 15514 / 15518 | 93 / 92 | incomplete | time-limit / time-limit | 28 | 5 | 8142 / 7481 | yes |
| golden-nugget | analyze | 15 s | 15594 / 9718 | 132 / 129 | incomplete | time-limit / work-limit | 27 | 6 | – / 5698 | no |
| anti-brute-force | explain | 15 s | 2219 / 536 | 73 / 26 | solved | solved / solved | 90 | 0 | – / – | yes |
| anti-brute-force | analyze | 15 s | 2370 / 611 | 82 / 28 | solved | solved / solved | 90 | 2 | – / – | yes |
| norvig-hard1 | explain | 15 s | 2801 / 835 | 2318 / 690 | not-started | not-started / not-started | 0 | -1 | – / – | yes |
| norvig-hard1 | analyze | 15 s | 3263 / 837 | 2715 / 687 | not-started | not-started / not-started | 0 | -1 | – / – | yes |
| empty | explain | 15 s | 725 / 185 | 122 / 33 | not-started | not-started / not-started | 0 | -1 | – / – | yes |
| empty | analyze | 15 s | 657 / 179 | 100 / 34 | not-started | not-started / not-started | 0 | -1 | – / – | yes |
| seventeen-minus-one | explain | 15 s | 729 / 171 | 92 / 30 | not-started | not-started / not-started | 0 | -1 | – / – | yes |
| seventeen-minus-one | analyze | 15 s | 588 / 215 | 83 / 31 | not-started | not-started / not-started | 0 | -1 | – / – | yes |
| escargot-poisoned | explain | 15 s | 542 / 181 | 70 / 21 | not-started | not-started / not-started | 0 | -1 | – / – | yes |
| escargot-poisoned | analyze | 15 s | 677 / 190 | 62 / 31 | not-started | not-started / not-started | 0 | -1 | – / – | yes |
| random-57 | explain | 15 s | 1548 / 451 | 77 / 31 | solved | solved / solved | 76 | 0 | – / – | yes |
| random-57 | analyze | 15 s | 2087 / 540 | 73 / 34 | solved | solved / solved | 76 | 2 | – / – | yes |
| poisoned-42 | explain | 15 s | 1845 / 441 | 87 / 30 | solved | solved / solved | 73 | 0 | – / – | yes |
| poisoned-42 | analyze | 15 s | 1926 / 497 | 70 / 27 | solved | solved / solved | 73 | 2 | – / – | yes |
| poisoned-43 | explain | 15 s | 1709 / 450 | 101 / 29 | solved | solved / solved | 74 | 0 | – / – | yes |
| poisoned-43 | analyze | 15 s | 1807 / 478 | 91 / 29 | solved | solved / solved | 74 | 2 | – / – | yes |
| easy | explain | 60 s | 567 / 591 | 35 / 38 | solved | solved / solved | 78 | 0 | – / – | yes |
| easy | analyze | 60 s | 545 / 591 | 32 / 35 | solved | solved / solved | 78 | 2 | – / – | yes |
| hidden-singles | explain | 60 s | 510 / 609 | 32 / 38 | solved | solved / solved | 82 | 0 | – / – | yes |
| hidden-singles | analyze | 60 s | 550 / 679 | 34 / 38 | solved | solved / solved | 82 | 2 | – / – | yes |
| seventeen | explain | 60 s | 570 / 595 | 35 / 35 | solved | solved / solved | 90 | 0 | – / – | yes |
| seventeen | analyze | 60 s | 639 / 749 | 33 / 51 | solved | solved / solved | 90 | 2 | – / – | yes |
| escargot | explain | 60 s | 17901 / 18748 | 38 / 36 | incomplete | tier-cap / tier-cap | 28 | 6 | – / – | yes |
| escargot | analyze | 60 s | 16818 / 26937 | 34 / 40 | incomplete | work-limit / work-limit | 28 | 6 | – / – | yes |
| inkala-2012 | explain | 60 s | 22794 / 25408 | 41 / 37 | incomplete | work-limit / work-limit | 27 | 6 | – / – | yes |
| inkala-2012 | analyze | 60 s | 29504 / 42594 | 33 / 109 | incomplete | work-limit / work-limit | 27 | 6 | – / – | yes |
| golden-nugget | explain | 60 s | 25214 / 51016 | 39 / 41 | incomplete | work-limit / work-limit | 28 | 6 | 2582 / 2635 | yes |
| golden-nugget | analyze | 60 s | 24292 / 35622 | 39 / 87 | incomplete | work-limit / work-limit | 28 | 6 | 4948 / 11322 | yes |
| anti-brute-force | explain | 60 s | 580 / 600 | 33 / 36 | solved | solved / solved | 90 | 0 | – / – | yes |
| anti-brute-force | analyze | 60 s | 627 / 696 | 34 / 42 | solved | solved / solved | 90 | 2 | – / – | yes |
| norvig-hard1 | explain | 60 s | 899 / 1036 | 743 / 859 | not-started | not-started / not-started | 0 | -1 | – / – | yes |
| norvig-hard1 | analyze | 60 s | 859 / 1061 | 706 / 904 | not-started | not-started / not-started | 0 | -1 | – / – | yes |
| empty | explain | 60 s | 194 / 208 | 35 / 33 | not-started | not-started / not-started | 0 | -1 | – / – | yes |
| empty | analyze | 60 s | 190 / 194 | 39 / 30 | not-started | not-started / not-started | 0 | -1 | – / – | yes |
| seventeen-minus-one | explain | 60 s | 182 / 198 | 31 / 45 | not-started | not-started / not-started | 0 | -1 | – / – | yes |
| seventeen-minus-one | analyze | 60 s | 192 / 210 | 31 / 36 | not-started | not-started / not-started | 0 | -1 | – / – | yes |
| escargot-poisoned | explain | 60 s | 183 / 220 | 29 / 30 | not-started | not-started / not-started | 0 | -1 | – / – | yes |
| escargot-poisoned | analyze | 60 s | 174 / 229 | 25 / 45 | not-started | not-started / not-started | 0 | -1 | – / – | yes |
| random-57 | explain | 60 s | 474 / 655 | 35 / 50 | solved | solved / solved | 76 | 0 | – / – | yes |
| random-57 | analyze | 60 s | 534 / 719 | 37 / 43 | solved | solved / solved | 76 | 2 | – / – | yes |
| poisoned-42 | explain | 60 s | 513 / 624 | 36 / 41 | solved | solved / solved | 73 | 0 | – / – | yes |
| poisoned-42 | analyze | 60 s | 541 / 721 | 35 / 48 | solved | solved / solved | 73 | 2 | – / – | yes |
| poisoned-43 | explain | 60 s | 563 / 604 | 36 / 43 | solved | solved / solved | 74 | 0 | – / – | yes |
| poisoned-43 | analyze | 60 s | 632 / 661 | 37 / 39 | solved | solved / solved | 74 | 2 | – / – | yes |
