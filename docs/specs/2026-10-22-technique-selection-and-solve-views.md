# Technique selection and a single Solve view — proposal

Status: **proposed, not approved.** No decision number is assigned; see §7. Drafted 2026-10-22 from a session that investigated a puzzle the Explain run could not finish, and from a user suggestion made while looking at HoDoKu.

Related: [M2.6 engine hardening](2026-09-22-m26-engine-hardening.md) (D103), [engine architecture](../solver/architecture.md), [decisions](../decisions.md) D055, D063, D094, D099

## 1. Objective

Two changes to how the Solve screen uses the engine, to be sequenced **after M2.6**:

1. **Technique selection.** The user chooses which technique families a run may use, as HoDoKu allows. A run then answers "what can I solve with the techniques I know", and a slow family can be switched off.
2. **One Solve view.** The Analyze/Explain toggle is removed. The step-by-step view becomes the only view and carries the summary as a header. Engine Analyze mode stays out of the UI until it has its own purpose (§4.2).

Neither change adds techniques or touches proof checking, count independence or Perfect semantics.

## 2. Evidence (2026-10-21/22)

Puzzle: `1....7.9..3..2...8..96..5....53..9...1..8...26....4...3......1..4......7..7...3..`, 9×9 classic, run through `solveClassic` in `explain` mode with the default `CLASSIC_SOLVE_LIMITS` (60 s) on `master`-era code, Node 24, Windows, via a throwaway vitest probe kept outside the repository. Figures are one machine and one run unless stated; they are not benchmarks.

**The run does not fail; it is incomplete.**

- Result `outcome: "complete"`, `count: "unique"`, `human: "incomplete"`. The returned solution is valid and agrees with the givens (checked row, column and box by hand-written loop). The exact phase produced it.
- 28 logical steps: 26 Basic elimination, one Hidden Single (step 27), one Finned fish (step 28). Only 24 cells are filled by the logical phase (the givens plus the Hidden Single). Total run ≈ 45 s.
- `human: "incomplete"` means the logical phase was stopped by its budget, not that no technique applies (`human.ts` maps `logical-budget`, `work-limit`, `time-limit` and `selection-window` to `incomplete`; "no technique applies" is `stalled-within-profile`). The raw reason is dropped before the `result` event, which is the finding already recorded in M2.6 §2.
- Raising the limits does not change the outcome. With `timeMs` 300 s the logical phase ended at ≈ 219 s, which is its 70 % window; with 900 s the whole run took 630 s, again 70 %. The phase consumes whatever time it is given after step 28.

**Where the time goes.** A CPU profile of the default run attributes ≈ 22 s of ≈ 42 s of self time to `techniques/fish.ts` (`coverPatterns`, `sizePatterns`, `ordered`, `combinations`). The fish search is exhaustive (set size up to 7 for the basic and finned families, up to 4 for the others). With the six fish-family jobs removed in the probe, the time spreads over `pattern-contracts.ts` (≈ 8 s), `bent-subsets.ts` (≈ 4 s) and `chains-runtime.ts` (≈ 4 s) and the logical phase still produced no step in 208 s.

**Why the heavier techniques never ran.** `select.ts:459-465` serves a job only when every simpler tier is exhausted (Explain mode). The profile order is therefore strict, and the fish families sit below the chain, forcing and Kraken families. This is the behaviour M2.6 §3.2 and §4.4 replace with a per-job work cap.

**What each technique does on this puzzle** (probe, techniques called directly on the state after step 28: 236 candidates, 24 cells filled, bypassing the scheduler):

| Result | Techniques |
| --- | --- |
| Exhausted, no proposal | t-whips, Bivalue chains, OR-k forcing, Digit forcing chains (≈ 96 s), Kraken Fish (≈ 17 min), Fireworks, Exocet, Tridagon, SK Loops, ALS chains, Sue de Coq |
| No proposal within the probe's time cap | Braids (20 min); Static forcing nets (20 min); Aligned Pair Exclusion, Continuous Nice Loops, WXYZ-Wing, Endo-fin fish (10 min each); Franken fish (150 s) |
| Interrupted by a fixed bound | Per-digit templates: `work-limit` after ≈ 265k work units, which matches the by-design bound `maxTupleTestsPerRevision: 100000` in `techniques/templates.ts` |

At the state after step 27 (before the Finned fish), each of Finned fish, Bivalue chains, Kraken Fish, t-whips, Braids and Per-digit templates was run alone together with the two singles. Each produced between 1 and 4 elimination steps and **none placed a digit**. The 22 techniques below the heavy families, run together, performed the Finned fish and ended in `stalled-within-profile` after 263 s.

**What this does not establish.** No run found a technique that solves the rest of the puzzle. A cap in the probe is not a proof that a family has nothing to find, and several families were stopped by the probe's own caps. The puzzle may need a deduction outside the catalogue. It behaves like the AI Escargot finding in M2.6 §2 (finned fish at ≈ 14 s, then no step), so it is a second instance of the same stall, not a new defect.

An attempt to run the heavy families together through the scheduler with the technique list filtered failed for reasons unrelated to the puzzle: Explain stopped with `incomplete-cheaper-tier` for the filtered sets, and engine Analyze stopped with `selection-window` after 0.5 s. This matters for §4.1.

## 3. Findings that shape the proposal

| Finding | Consequence |
| --- | --- |
| A slow family starves every family above it in Explain. | Letting the user switch families off is a direct remedy, and after M2.6 it is still useful as a teaching control. |
| `stalled-within-profile` already means "no step inside the chosen technique set". | A user-chosen set fits the existing vocabulary; the status needs no new meaning. |
| Filtering the registry in a probe produced `incomplete-cheaper-tier` for some sets. | The tier-exhaustion rule has no defined meaning for a set with gaps. This must be designed, not assumed (§4.1). |
| In the app, Analyze and Explain are one engine run in Explain mode with two presentations (D099; `ui/solver.ts` toggles `solverView`). Engine Analyze mode is disabled and returned zero steps (D101, M2.6 §2). | Removing the toggle changes only presentation. It does not remove an engine capability. |
| M2.6 §4.5 already specifies the summary content (count verification time, stop reason, coverage, capped badge) for the Analyze panel. | That content can move to a header of the step view unchanged. |

## 4. Design

### 4.1 Technique selection

- **Unit of choice.** The coverage family (the 33 primary rows plus the five uniqueness-conditional ones), by its display name, as the Solve screen already lists them. Not individual variants.
- **Where it lives.** A user-chosen subset is a *profile*: a named list of enabled families layered on `classic-expanded@1`. Presets are shipped: "All" (the default, identical to today), "Singles only", "Up to subsets", "Up to wings and fish", "No fish". A custom set is stored in settings.
- **Identity.** The enabled set enters the canonical options key and the `RunKey` (a sorted list of coverage ids), so two runs with different sets never share evidence or golden traces (D094). The default set must serialise to the same key as today so existing traces stay byte-identical.
- **Tier rule with gaps (open).** Today a job at tier *t* runs only after every job below *t* is exhausted or excluded. With a set that has gaps, the rule can be taken as: disabled families are treated as `excluded` for the purpose of tier exhaustion. The probe evidence in §2 shows that this has not been verified, so the first task is a design note plus a test, before any UI. Under M2.6 `explain-fair@3` the same question applies to `capped` jobs and should be answered once for both.
- **Honest wording.** A run restricted to a set reports `stalled-within-profile` as "no step with the selected techniques", and a result produced with a restricted set is never labelled as the simplest possible explanation. Count, Perfect and proof checking are unaffected, since they do not depend on which techniques proposed steps.
- **Out of scope.** Reordering techniques or setting per-family weights as HoDoKu does. The scheduler policy stays the single authority on order.

### 4.2 One Solve view

- Remove the Analyze/Explain switch from the Solve screen. The step list is always shown once the run has steps.
- A header above the list carries the M2.6 §4.5 summary: count status (verified in *x* s / not verified and why), logic status (solved / stalled at tier *n* / stopped by limit), highest tier used, steps per tier, techniques exhausted, capped and not started.
- The engine keeps `mode: "analyze"` and `analyze-fair@*` unchanged. If it later gets a purpose of its own, the candidates are a difficulty report (hardest technique needed, alternative routes) and a hint source for M6. This proposal does not pick one.
- If the user's habit is to read steps only, the summary must not push the step list below the fold: the header is collapsed to one line with an expander.

### 4.3 Order relative to M2.6

Both changes depend on M2.6: the summary content needs the result contract (T06), and the tier rule with gaps should be solved together with the tier cap (T05). Proposed order: M2.6 completes, then a design note for the tier rule with gaps (§4.1), then the UI.

## 5. Tasks (provisional)

| Task | Deliverable | Acceptance |
| --- | --- | --- |
| S1 | Design note: tier-exhaustion semantics for a set with disabled families, under `explain-fair@3`; options key and `RunKey` encoding of the set. | Reviewed and approved; names the behaviour of `incomplete-cheaper-tier` for a set with gaps. |
| S2 | Engine: profile subset selection, presets, options-key change. | The default set yields the current key and byte-identical `@1`/`@2`/`@3` golden traces; each preset terminates with a status consistent with its set (table-driven test); count and checker results are identical across sets on the evaluation corpus. |
| S3 | Solve screen: technique selector, presets, per-set wording of the stop reason. | Playwright: switching "No fish" on the puzzle in §2 changes the technique coverage shown, not the count. |
| S4 | Solve screen: remove the toggle, add the summary header. | Playwright: no toggle; the header shows the M2.6 summary lines; the step list is unchanged for the corpus cases. |
| S5 | Corpus: add the §2 puzzle to the evaluation corpus as a stall case with `human` expected to be `incomplete` or `stalled-within-profile`, never asserting a solving technique. | Count `unique` and the stored solution match the Algorithm X oracle. |

## 6. Risks and open items

- **Semantics, not UI, is the risk.** If gaps in the tier order cannot be made precise, selection must be limited to trailing families ("up to tier *n*"), which loses the "switch off just fish" case that motivated it.
- **A restricted run can look like a stronger claim than it is.** The wording in §4.1 and the header in §4.2 carry this; without them users may read "stalled" as "the puzzle needs a technique beyond all of Sudoku".
- **The puzzle in §2 may have no solving deduction in the catalogue.** S5 therefore asserts count and solution only.
- **Probe limits.** §2 reports time caps chosen in a probe, a single machine, and one execution per case. They show where the cost is, not what the defaults should be (that is M2.6 T08).
- **Settings and storage.** A custom set is a new persisted setting; the backup format and migration (`domain/settings.ts`, `domain/backup.ts`) need a version note in S2.

## 7. Entries to apply on approval

No `D` number is assigned in this draft. Per the git workflow, the next free number is read from `docs/decisions.md` on `master` at merge time.

- **Decision entry** (new `D<n>`): "Add user-selectable technique sets to the Solve screen and remove the Analyze/Explain toggle, sequenced after M2.6; engine Analyze mode is unchanged and stays outside the UI." Source: this proposal. Alternatives rejected: keeping the toggle with a better Analyze; deleting engine Analyze mode.
- **Roadmap row** after M2.6: "M2.7 | Technique selection and a single Solve view. | S1–S5 acceptance in §5. | This spec under D<n>."
- **README index** line under the M2.6 line, linking this document.
