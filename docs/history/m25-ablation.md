# M2.5 scheduling ablation

Plan task T15, acceptance gate of the [engine design](../specs/2026-09-17-engine-design.md)
§3.12. Run on 2026-09-22/23 from `feat/m25-engine` at `fdef161`, after the block 5
review fixes. The decision this report feeds is D101.

## What was measured

`explain-fair@2` against `explain-fair@1` on the held-out partition of
[corpus](m25-corpus.md) `2c8c6891…0dea`, over the spec §3.11 parameter grid
`rotationEvery ∈ {2, 4, 8} × decayShiftCap ∈ {2, 4, 6}` with `scoreFromTier = 3`.
The harness is `web/tests/solver/bench/ablate.ts`, driven by
`web/tests/unit/solver/bench-ablate.test.ts` (`ABLATE=run`, then `ABLATE=report`).
Runs are ended by the work cap, never by the clock, so a trace is reproducible
on any machine.

Two budgets, as approved on 2026-09-22:

- **`spec` = 2,000,000 units**, the budget metric C names in §3.12.
- **`stop` = 16,000,000 units**, for A, B, D and F. One Explain selection costs
  roughly 87 k accounted units, so at 2 M every run ends after about 15 steps,
  before any logical stop.

Analyze is **not** evaluated. `analyze-fair@1` ends its first 4,096-unit
selection window with no step on every corpus case, a pre-existing M2 defect
that the [M2.6 draft](../specs/2026-09-22-m26-engine-hardening.md) fixes under
`analyze-fair@3`; comparing it with `analyze-fair@2` would set zero steps
against zero steps.

Metric definitions as implemented, recorded because §3.12 states them in one
line each:

- **A** — per policy, the median over its own states whose accepted step is
  tier ≥ 3 of the work spent in that state since the previous accepted step
  (rules and cheaper tiers included). The trajectories diverge, so the two
  populations are not paired and both sizes are reported. Pass: ≥ 20 % reduction.
- **B** — mean total work to the logical stop, over the pairs where **both**
  runs reached one; pairs where either run ended `incomplete` are counted as
  censored instead of entering the mean at the budget. Pass: ≥ 10 % reduction.
- **C** — `incomplete` rate at the `spec` budget. Pass: not higher than `@1`.
- **D** — accepted steps per technique family. Pass: every family keeps ≥ 90 %
  of `@1`'s count.
- **E** — each configuration is run twice at both budgets; the traces must be
  byte-identical. A missing repeat fails E.
- **F** — the trace prefix below tier 3 must be identical to `@1`'s.

## Phase 1: parameter grid, 30 held-out cases (5 per family)

| Configuration | A (states @1 / @2) | B | C (@1 / @2) | D worst (below 90 %) | F | Gate |
| --- | --- | --- | --- | --- | --- | --- |
| r2 d2 | 6.0 % (7 / 9) | 0.0 % (22 censored) | 1.00 / 1.00 | 1.00 (-) | 30/30 | fails A,B |
| r2 d4 | 6.1 % (7 / 9) | 0.0 % (22 censored) | 1.00 / 1.00 | 1.00 (-) | 30/30 | fails A,B |
| r2 d6 | 6.2 % (7 / 9) | 0.0 % (22 censored) | 1.00 / 1.00 | 1.00 (-) | 30/30 | fails A,B |
| r4 d2 | 0.0 % (7 / 7) | 0.0 % (22 censored) | 1.00 / 1.00 | 1.00 (-) | 30/30 | fails A,B |
| r4 d4 | 0.6 % (7 / 7) | 0.0 % (22 censored) | 1.00 / 1.00 | 1.00 (-) | 30/30 | fails A,B |
| r4 d6 | 1.8 % (7 / 7) | 0.0 % (22 censored) | 1.00 / 1.00 | 1.00 (-) | 30/30 | fails A,B |
| r8 d2 | −38.4 % (7 / 5) | 0.0 % (22 censored) | 1.00 / 1.00 | 0.33 (c16@1) | 30/30 | fails A,B,D |
| r8 d4 | −36.7 % (7 / 5) | 0.0 % (22 censored) | 1.00 / 1.00 | 0.50 (c16@1, c18@1) | 30/30 | fails A,B,D |
| r8 d6 | −34.4 % (7 / 5) | 0.0 % (22 censored) | 1.00 / 1.00 | 0.50 (c16@1, c18@1) | 30/30 | fails A,B,D |

E passed for every configuration at both budgets (20 configurations × 2 runs).
F passed 30/30 everywhere, including `r2` and `r8`, which the block 5 review
fix (H1) restored: before it, the rotation parameter reordered tiers −1 and
0–2 as well.

Reading:

- **A never approaches 20 %.** The best is 6.2 % at `r2 d6`, on 7 baseline and
  9 candidate states across 30 cases.
- **B has almost nothing to average.** 22 of 30 pairs are censored because they
  do not reach a logical stop within 16 M units; on the remaining 8 the two
  policies spend exactly the same work.
- **C passes trivially.** At 2 M every case of both policies is `incomplete`.
- **D fails for `rotationEvery = 8`**, which loses c16 and c18 steps — the
  starvation the rotation exists to prevent.

`r2 d6` was carried to phase 2 as the best candidate.

## Phase 2: full held-out partition, 310 cases

`explain-fair@2 r2 d6` (the best grid configuration) against `explain-fair@1`,
every held-out case, both budgets, each configuration run twice. 32 sharded
jobs, 117 minutes of wall time on 12 cores.

| Metric | `@1` | `@2 r2 d6` | Pass | Result |
| --- | --- | --- | --- | --- |
| A median work to a tier ≥ 3 step | 2,014,726 (94 states) | 1,715,696 (118 states) | ≥ 20 % | **14.8 %, fails** |
| B mean work to logical stop | 8,467,718 | 8,467,875 | ≥ 10 % | **−0.0 %, fails** (226 of 310 pairs censored) |
| C `incomplete` rate at 2 M | 1.000 | 1.000 | not higher | passes |
| D accepted steps per family | — | worst ratio 0.571 (`c14@1`, 7 → 4) | ≥ 0.90 | **fails** |
| E determinism | identical | identical | identical | passes |
| F tiers 0–2 prefix | — | 310/310 identical | identical | passes |

Where the steps moved: `c14@1` 7 → 4 is the only family that loses; `c08@1`
5 → 6, `c15@1` 12 → 17, `c16@1` 6 → 10, `c17@1` 3 → 4, `c18@1` 32 → 41 and
`c19@1` 10 → 17 gain. In total both policies accept about the same amount of
work-bearing deduction — 12,063 against 12,117 technique steps — and both
solve the same 84 of 310 cases, with no stall. At the 16 M budget 226 cases
end `incomplete` under both: arrow 55, killer 58, kropki 22, mixed 61,
thermometer 16 and classic 14.

**Gate result: A, B and D fail; C, E and F pass.** Under §3.12 `explain-fair@2`
therefore does not become the default. It ships selectable and disabled, the
`@1` policies stay the defaults, and the milestone still completes — the spec
provides for exactly this outcome. The decision is recorded as D101.

## Why the tier ≥ 3 population is small

The corpus has no public hard classic puzzles: no license was verified, so
none were ingested (T13, [corpus record](m25-corpus.md)). Spec §3.9 predicted
this consequence — "random generation almost never reaches tiers ≥ 5; only the
public hard lists do" — and the ablation measures it: across all 310 held-out
cases only 94 baseline states accept a tier ≥ 3 step, about one state for every
three cases, and 30 cases carry only 7 of them. The generated variant families
spend their budget in rule propagation and the cheap tiers instead; at 16 M
units, kropki, mixed, killer, thermometer and arrow cases reach the budget
rather than a logical stop.

## M2.6 refresh: the `@3` policies (2026-11-10/11)

Spec [M2.6](../specs/2026-09-22-m26-engine-hardening.md) §5 T09 asks for this
ablation to be re-run with `explain-fair@3` and `analyze-fair@3`, and for D101 to
be revisited only if `@3` changes its conclusion. Run from `feat/m26-hardening`
at `b9dfaf2` plus the T09 harness change (configurations 10–12 in
`bench-ablate.test.ts`: `explain-fair@3`, `analyze-fair@1`, `analyze-fair@3`);
`ablate.ts` and the corpus are unchanged since M2.5. Same held-out partition
(310 cases), same budgets, every configuration run twice at both. 52 jobs, 11 at
a time on 12 logical cores, 3 h 34 min of wall time (2026-11-10 23:01 to
2026-11-11 02:35 -03:00), on mains (`BatteryStatus` 2 at the start and the end).
Every run uses a fixed clock (`now: () => 0`) and ends at a logical stop or on its
work cap, never on time, so the numbers do not depend on the machine.

**The `@1` baseline is not the M2.5 one.** M2.6 T04 cut the units charged for
source-index preparation (a basic step on the easy puzzle went from about 87k to
about 7.5k units) without changing `@1`'s step order, so at the same
budgets `@1` now goes much further: at 16M units it reaches a logical stop on
195 of 310 cases (84 in M2.5) and ends `incomplete` on 115 (226). Only the rows
below compare with each other; the M2.5 tables above are kept as they were.

No run ended in `error` (4,960 runs: four policies, two budgets, 310 cases, each
run twice). The first attempt on 2026-11-10 did, on five
variant boards; that was the defect fixed in `b9dfaf2` (effect-free steps), and
its outputs were discarded.

### `explain-fair@3` against `explain-fair@1`, 310 held-out cases

| Metric | `@1` | `@3` | Pass | Result |
| --- | --- | --- | --- | --- |
| A median work to a tier ≥ 3 step (16M) | 2,422,811 (198 states) | 1,165,523 (432 states) | ≥ 20 % | **51.9 %, passes** |
| B mean work to logical stop (16M) | 2,696,400 | 2,376,632 | ≥ 10 % | **11.9 %, passes** (118 of 310 pairs censored) |
| C `incomplete` rate at 2M | 0.768 | 0.752 | not higher | passes |
| D accepted steps per family (16M) | — | worst ratio 0 (`c13@1`, 1 → 0) | ≥ 0.90 | **fails**: `c08@1` 16 → 12, `c13@1` 1 → 0, `c15@1` 19 → 13, `c19@1` 38 → 31 |
| E determinism | identical | identical | identical | passes |
| F tiers 0–2 prefix (16M) | — | 298/310 identical | identical | **fails** (12 cases) |

At 2M, A gives 46.1 % (11 / 53 states), B 1.9 % (238 censored), D fails on
`c13@1` alone and F has 271/310 identical.

Where the steps moved at 16M: tier ≥ 3 steps rise from 198 to 432, and tier-5/6
steps from 0 to 238 (`c32@1` 182, `c24@1` 25, `c22@1` 24, `c25@1` 5, `c20@1` 1,
`c26@1` 1) on 40 cases. All 182 `c32@1` steps are effect-free guardian clauses
(the steps `b9dfaf2` retains); 27 cases get a tier-5/6 step that removes
candidates. Logical stops: 196 under `@3`, 195 under `@1`, by family the same
except one more thermometer case. The losses in D are the intended effect of the
tier cap: a tier-3/4 job that spends its 100,000 units on a state without a step
is capped, Explain climbs, and the state is resolved by a step from a higher tier
or a different tier-3/4 family (`c12@1` 1 → 9, `c18@1` 58 → 63). `c13@1` (Remote
Pairs, tier 2) loses its only step (on `classic-312`) because that case's
trajectory diverged earlier, at a `c06@1` step (see F).

F's misses are not caused by the tier cap, which starts at tier 3. At 16M all 12
diverge at a tier-2 step: in ten, `@3` takes a `c10@1` (single-digit pattern) step
where `@1` takes a `c11@1` (wing) step; the other two differ at a `c06@1` and a
`k02@1` step. The likely cause, consistent with these divergences but not
isolated by an experiment: `@3`'s basic fish (C06) enumerates only admissible
cover sets, which finds the same candidates for far less work (T05), so the
tier-2 jobs are served in a different order and the first tier-2 step can come
from another family. At 2M, 10 cases diverge the same way and 29 more are `@1` prefixes cut by
the budget that `@3` extends because it spends less. T05's "tiers 0–2 identical
to `@1`" holds on the golden fixtures, as its acceptance states, not on the
whole held-out partition.

### `analyze-fair@3` against `analyze-fair@1`

`analyze-fair@1` accepts no technique step on any of the 310 cases at either
budget (rule propagation only, 425 steps in all), the M2 defect M2.6 fixed under
`@3`. A and B have nothing to compare (baseline 0 states, 310 pairs censored), D
passes trivially and F does not apply, so the gate has no meaning for Analyze.
What `analyze-fair@3` does on its own: 16,870 technique steps at 16M (9,998 at
2M), at least one on 301 of 310 cases (the other 9 have none under `explain-fair@1`
either), a logical stop on 185 cases (78 at 2M), `incomplete` rate 0.403 at 16M
and 0.748 at 2M against 1.0. E passes at both budgets.

### Conclusion for D101

D101 compared `@2` with `@1` and kept `@2` disabled; nothing here concerns `@2`,
and `@2` stays disabled. Measured against the same §3.12 gate, `explain-fair@3`
passes A, B, C and E and **fails D and F**, so it would not pass the M2.5 gate.
It is the `classic-run` default because D103 approved it for a different
objective (reach the tier a puzzle needs within the time limit, spec §1), and
the D failures are that objective at work. No default changes. The F result
corrects the reading that `@3` keeps every tier-0–2 prefix of `@1`: it does on
the golden fixtures and on 298 of 310 held-out cases at 16M.

Reproduction: the commands of the section below, with `ABLATE_CONFIG` 0, 10, 11
and 12, `ABLATE_CASES=full`, both budgets, each with and without
`ABLATE_TAG=repeat`, four shards for 0, 10 and 12.

## Reproduction

```
# one configuration, one budget, one shard of the held-out cases
ABLATE=run ABLATE_CONFIG=<0..12> ABLATE_BUDGET=spec|stop ABLATE_CASES=grid|full \
  ABLATE_SHARD=i/n [ABLATE_TAG=repeat] CORPUS_OUT=<dir> \
  npx vitest run tests/unit/solver/bench-ablate.test.ts

# merge every trace into <dir>/ablation-report.json
ABLATE=report CORPUS_OUT=<dir> npx vitest run tests/unit/solver/bench-ablate.test.ts
```

Phase 1 took 105 minutes for 40 jobs and phase 2 took 117 minutes for 32
sharded jobs, both on 12 cores. `explain-fair@2` was measured over the whole
grid on 30 cases and its best configuration over all 310 held-out cases;
§3.12's gate numbers above are the full held-out ones.
