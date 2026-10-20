# M2.6 benchmark and default limits

Spec [M2.6 engine hardening](../specs/2026-09-22-m26-engine-hardening.md) §5 T08 and §6, D063, D103.

## Setup

- Harness: `web/tests/browser/solver-bench.html` runs each request through the real module worker (`startWorker`, `solve-classic`, the Solve screen's own path) and reports what the screen would show; `web/tests/e2e/solver-m26-benchmark.spec.ts` drives it (`M26_BENCH=1`, `M26_BENCH_PRESETS`, `M26_BENCH_RUNS`, `M26_BENCH_IDS`, `M26_BENCH_OUT`).
- Cases: the evaluation corpus's named and derived cases plus every unique case (14), Explain and Analyze, at the 15 s and 60 s presets, two runs each.
- Browser matrix: **Chromium only** (Playwright's bundled Chromium, dev server). Firefox and WebKit are not installed on the development machine, and installing them is a download that was not authorised in this session, so the slowest browser measured is Chromium. The other browsers are **not measured**.
- Machine: Intel Core i5-1345U, Windows 11, Node v24.19.0. The final run (the table below) was **on mains**. The laptop alternates between a fast and a slow state that this session cannot control (about 3x apart): the second pass of the 15 s preset ran mostly in the slow state, as its times show.

## Defaults chosen

| Parameter | Spec (provisional) | Chosen | Why |
| --- | --- | --- | --- |
| Work budget | 60M units at every preset | **200 units per ms** of the time limit: 3M at 15 s, 12M at 60 s, 36M at 180 s (`WORK_UNITS_PER_MS`, `classicLimitsFor`) | The logical phase must end on its work cut, not the clock (D103). The slowest tiers run at about 150–200k units/s in Chromium; with 60M units every hard grid ran to the time stop at every preset (first T08 pass, battery: Escargot, Inkala and Golden Nugget all `time-limit` at 15 s). |
| Precount share | 30 % | **45 %** (`PRECOUNT_SHARE`) | Norvig `hard1` needs 1.27M exact units, the most of any corpus case; 45 % of the 15 s budget is 1.35M. With 30 % of 3M the precount could not finish it. Exact units cost less time than logical ones (about 2.3 µs against 5–9 µs per unit), so the larger share costs little time. |
| Tier cap | 2,000,000 units per job per state | **100,000** (unchanged from T05) | Measured in T05: 2M cannot reach tier 5 within 15 s; at 100k all three hard grids serve tier-5/6 jobs within 15 s and Golden Nugget's first tier-5 step comes at 2.6–8.8 s. |
| UI presets | 15 s, 60 s, 180 s | unchanged | The budget now scales with them. |

## Results against §6 (Chromium, mains)

- Exact count: verified in 21–140 ms on every case except Norvig `hard1` (687–904 ms in the fast state, 2.3–2.7 s in the slow state); target < 1 s, `hard1` < 5 s: **met**. Escargot 34–46 ms in the fast state, 123–138 ms in the slow one; target < 50 ms: **met in the fast state only**.
- Easy (singles-only) Explain end to end: 0.5–0.6 s in the fast state (target < 1 s), 1.8–2.1 s in the slow state.
- 17-clue singles Explain: 0.6–0.9 s fast, 1.9–2.4 s slow (target < 3 s): **met**.
- Escargot, Inkala 2012, Golden Nugget at the 15 s preset reach tier ≥ 5 (highest tier tried 5–6): **met**; ≥ 1 tier-5/6 step: Golden Nugget only (accepted known limit of the chain/forcing detectors, T05).
- Engine Analyze: at least one step on every unique corpus case (27–90 steps): **met**.
- Determinism at 60 s: both runs of every case gave the same steps, final grid, status and stop reason; every hard grid ended on its work budget (17–51 s). At 15 s the hard grids reach the time safety stop when the machine is in its slow state, so their 15 s results can differ between runs; §6 asks for determinism at 60 s.
- UI: `hard1` shows "Multiple solutions" at 15 s, and every result shows a stop reason and coverage (T07 Playwright).

The stop-reason column below was recorded before a reopened capped job kept its `tier-work-cap` reason (found by this benchmark, fixed in the T08 commit), so some cap-bound stops read `work-limit` here and `tier-cap` now; steps and results are unaffected.

## Per case

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
