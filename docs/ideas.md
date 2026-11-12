# Parked ideas

Ideas that are not decisions, specs or roadmap items. Each entry says what the idea is, why it was parked, and what would unlock it. Nothing here is approved; an entry becomes a spec or a `D<n>` only through the normal route.

## 1. Calibrated, learned technique selection, with a determinism setting

Noted 2026-10-22. Related: [technique selection and a single Solve view](specs/2026-10-22-technique-selection-and-solve-views.md), [M2.6 engine hardening](specs/2026-09-22-m26-engine-hardening.md), decisions D094, D101.

### Idea

Choose the next technique to try from calibrated probabilities instead of a fixed tier order. For each (board state, technique) pair the model estimates the probability that the technique finds at least one step within its work cap, the expected cost, and the expected gain. The selector ranks by expected gain per unit of cost (`p_hit × gain / E[cost]`), which is the form the existing `Estimate { hit, gain, cost }` already has (`techniques/types.ts`). The scheduler's `explain-fair@2` / `analyze-fair@2` and `model-1` are an earlier, offline-calibrated version of the same shape.

### Setting: deterministic or not (future)

A user-facing option, off by default.

| Mode | Behaviour | Constraint |
| --- | --- | --- |
| Fully deterministic (default) | A frozen, versioned model evaluated as a pure function of the state; no clock, no randomness, no network. | D094: same policy id, same trace. The model is part of the policy identity. |
| Adaptive / non-deterministic | May use seeded or unseeded sampling (for example Thompson sampling), online updates within a puzzle, or an external model such as a hosted System One model. | Must say so in the result, must never decide correctness (the checker still validates every step), and its traces are not golden. |

An external hosted model (the Jev System One model from TypeSafe AI was the example discussed; early access, hosted API, not evaluated here) cannot be the default: the solver runs in a browser worker without a network and needs thousands of decisions per second. It is a candidate baseline for offline experiments and for the non-deterministic mode.

### How calibrated probabilities could be built

1. **Labels.** Run each technique in isolation on states along solution paths of the evaluation corpus and record one of three outcomes: *hit* (a step), *exhausted* (no step), *capped* (stopped by the work cap). *Capped* is censored, not a miss: treating it as "no step" biases the probabilities down for exactly the expensive techniques. Model it as a survival or three-class outcome. Cost is the work used, right-censored at the cap.
2. **Features.** The 22 board features (`board-features@1`, `scheduling/features-board.ts`) plus the technique id, optionally the last accepted step's technique.
3. **Model.** Small and deterministic: logistic regression, a shallow tree ensemble, or a lookup table per technique. Exported as fixed-point integers and frozen under a new policy id.
4. **Calibration.** Held-out data; isotonic regression or temperature scaling; report Brier score, log loss and a reliability diagram. Calibration matters here because the ranking multiplies the probability by gain and divides by cost, so a systematic bias in `p_hit` reorders techniques.
5. **Selection rule.** Deterministic mode: pick the highest expected gain per cost, with a seeded tie-break and the existing reopen rules. Adaptive mode: add exploration.
6. **Evaluation.** The M2.5 ablation harness: work to the first step of tier 3 or higher, tier-0-to-2 prefix identical, results byte-identical across runs.

### Where it fits relative to research

Kept separate from the difficulty-and-order study, but connected.

- The study of how difficulty depends on technique order treats a selection policy as one ordering condition among others (by tier, a HoDoKu-like order, seeded random). The learned selector is one more condition, not the instrument that measures difficulty.
- A model must not be trained on the quantity the study measures (work or bottleneck tier), and not on the puzzles it is evaluated on. Otherwise the policy defines the difficulty it reports.
- The shared artifact is a dataset of traces: state, technique, outcome, cost. The study reads it to measure order sensitivity; the selector trains on a disjoint split of it.
- A smaller standalone question comes out of step 1 to 4: how well can technique success be predicted from board features alone, with calibration metrics as the result. That is a candidate first piece of work, independent of the rest.

### Why parked

- Depends on M2.6 (`explain-fair@3` tier cap, stop reason and coverage, work-unit budgets): without them there is no clean label for *capped* and no deterministic work cut.
- Depends on a corpus with more hard puzzles: D101 records 94 tier-3-and-above states in 310 cases, too few to calibrate the expensive techniques.
- The earlier scored policy (`@2`) missed three of six gates in the M2.5 ablation (D101); any new attempt should start from why.

### Unlocks

M2.6 merged; a larger hard-puzzle corpus with a verified licence (D101 notes none is available today); a decision on the determinism setting's default and wording.
