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

## Reproduction

```
# one configuration, one budget, one shard of the held-out cases
ABLATE=run ABLATE_CONFIG=<0..9> ABLATE_BUDGET=spec|stop ABLATE_CASES=grid|full \
  ABLATE_SHARD=i/n [ABLATE_TAG=repeat] CORPUS_OUT=<dir> \
  npx vitest run tests/unit/solver/bench-ablate.test.ts

# merge every trace into <dir>/ablation-report.json
ABLATE=report CORPUS_OUT=<dir> npx vitest run tests/unit/solver/bench-ablate.test.ts
```

Phase 1 took 105 minutes for 40 jobs and phase 2 took 117 minutes for 32
sharded jobs, both on 12 cores. `explain-fair@2` was measured over the whole
grid on 30 cases and its best configuration over all 310 held-out cases;
§3.12's gate numbers above are the full held-out ones.
