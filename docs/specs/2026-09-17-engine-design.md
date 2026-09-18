# M2.5 Engine — variant primitives and calibrated scheduling

Status: **approved 2026-09-18 (D100)**. Brainstorm record of 2026-09-17, audited the same day (Socratic ambiguity review, §12). Implementation follows the task plan referenced from D100; no code existed when this document was approved.

Related: [engine architecture](../solver/architecture.md), [roadmap](../roadmap.md), [M2 engine contracts](../history/superpowers/specs/2026-09-12-m2-engine-contracts.md), [coverage matrix](../history/superpowers/specs/2026-09-12-m2-technique-coverage.md), [expansion research](../history/superpowers/specs/2026-09-12-m2-engine-expansion-design.md).

Audit result: ambiguity 0.31 → 0.12 over eight rounds; **no BLOCKING item remains** (§12.4). Items marked *provisional* were accepted by the user with an explicit "simplify now, keep it parameterizable".

## 1. Objective

Two engine capabilities, delivered without any UI change and **independent of each other for acceptance** (§3.12):

1. **Variant constraints as composable rule modules.** Add the minimum proof/propagation vocabulary so that thermometer, futoshiki, kropki, killer and arrow constraints — plus diagonal — assemble with the classic rules into one shared candidate state, with every logical deduction independently checked exactly as today (D052, D061) and with **count evidence that can actually finish** on variant puzzles (§3.13). Any combination of these modules works by construction of the existing `CapabilityAssembler`; combinations are tested by property, not enumerated.
2. **Calibrated technique scheduling.** Replace the placeholder `estimate()` (`{hit:1, gain:1, cost:tier+1}` in every descriptor) with feature-based, offline-calibrated, integer, frozen estimates of `hit`/`gain`/`cost` per technique, consumed by the existing `FairPolicy` formula. Explain keeps its tier semantics (D055/D063) and applies the estimates only from tier 3 upward; Analyze uses them across tiers. New policy identities; the existing ones remain as ablation baselines.

Proof checking and Perfect semantics do not change (D052, D056, D061). Count evidence keeps its independence from human-pruned state (D049) but gains module forward checking (§3.13). The milestone changes *which detector runs next*, never *whether a step is accepted*.

## 2. What the code and decisions already establish (inspection findings)

These findings shaped the questions and are recorded so the plan does not rediscover them.

| Finding | Where | Consequence |
| --- | --- | --- |
| `EngineProblem` is already geometry-agnostic: `cells`, `symbols`, `givens`, `constraints`. The classic adapter only emits 27 `all-different@1` instances with stable IDs. | `problem.ts:248-295` | Irregular regions on 9×9 and diagonal need **no new primitive**, only constraint instances. |
| Root preflight caps 81 cells / 9 symbols / 256 rules / 256 all-different / 2,304 covers / 2,978 roots. | `limits.ts:21-27`, D067 | Custom sizes are structurally excluded; see §3.1. |
| `Mask = number` with `1 << (symbol-1)`. | `problem.ts:5`, everywhere | Up to 31 symbols without a representation change; not exercised in this milestone. |
| 27 solver files contain literal `81` (not 150): 13 are derivable bounds, 13 are classic-geometry algorithms that already self-gate on `cells.length === 81 && symbols.length === 9`, plus the adapter. | grep over `web/src/solver`; classification in §3.1 | The classic families stay classic and are *excluded* on other geometries (D080), never broken. |
| `RuleModule` already has `normalize/validate/checkComplete/capabilities/propagate/checkPrimitive`; `RuleCapabilities` has `allDifferent`, `covers`, `relations`, `primitiveIds`. | `rules/types.ts` | The factory the user asked for exists. Missing: a **sum** capability, the modules, and an exact-phase forward-check hook (§3.13). |
| Test-only `sum@1` and `order@1` mock modules exist and pass shared-state tests; their `propagate` yields `exhausted` only. | `tests/solver/mock-rules.ts`, D061 | Working template for capability derivation; production modules need real propagation. |
| `relation@1` is bounded to 16 cells / 256 tuples. | D068 | Binary constraints fit (≤ 81 tuples). A 4-cell cage summing to 20 has 288 ordered tuples: **killer cannot be a relation**. |
| `Proposition` already includes `clause` with signed literals and `false`; `table-project@1` verifies signed clauses and single positive/negative literals against every surviving row. | `state/types.ts:10-21`, `proof/tables.ts:95,172,214` | Contradiction conclusions and strong links from relations fit the existing algebra. |
| Every `estimate()` returns `{hit:1, gain:1, cost:tier+1}`; every `watches()` returns `[{kind:"all"}]`. | `registry.ts:62`, `fish.ts:258`, `als-runtime.ts:164`, … | The `hit×gain/cost` ordering in `policy.ts:25` currently equals "sort by tier, then alphabetical technique id". |
| Explain filters jobs to the minimum tier *before* sorting; a job runs only when simpler tiers are exhausted; the selection loop **stops at the first buffered step** in Explain. | `policy.ts:19`, `select.ts:143,162` | A score can only reorder **within** a tier in Explain, and the first found step within the tier is the chosen one. |
| Every fourth ticket serves the oldest job; `clamp(1..1024)` on each estimate factor; `ledger.advance()` re-calls `descriptor.estimate(view)` for **every** job after each accepted change. | `policy.ts:11,22-27`, `ledger.ts:47-51`, D063 | Fairness floor exists; the model output range is fixed; feature extraction must be memoized per view. |
| Policy identity is part of `optionsKey`; changing a frozen table requires a version bump; no online learning. D048's fixed order is superseded (D054). | D094, D063, D054 | Different policy versions may produce different traces; the same version must be deterministic. |
| The benchmark corpus has two trivial entries; the 181 fixture strings in tests are per-technique candidate states sharing source puzzles. | `tests/solver/bench/corpus.json`, D063 | **There is no calibration data.** |
| The ALS index enumerates every proved `all-different` fact, not classic houses. | `indexes/als.ts:101-104` | ALS inside killer cages is free. |
| The implication index builds **weak** edges from relations but **strong** edges only from covers. | `indexes/implications.ts:86-108` | Chains through thermometers get weak links free; strong links need a new recipe (§3.5). |
| `unique-transform@1` rejects a transformation when an affected rule lacks a preservation certificate. | D093 | U01–U05 automatically refuse on cells touched by cages/relations; M2.5 adds tests, not behavior. |
| The test oracle is set-based Algorithm X (exact cover). | `tests/solver/oracle.ts`, D052 | It cannot express sums or orders. A second independent oracle is mandatory (§7). |
| `ExactSearchSession` prunes with singles and all-different forward checking and validates complete assignments through `checkComplete`. Killer puzzles typically have **zero givens**. | `exact.ts`, D049 | Without module forward checking, count evidence on variants is inconclusive in practice (§3.13). |
| Human stop statuses are `solved`, `stalled-within-profile`, `incomplete`, `contradiction`; unsupported rule types fail assembly with `unsupported-rule`. | `human.ts:19-23`, `assemble.ts` | An unconsumed capability leads to an honest stall and exact fallback, never a silent claim (§3.14). |
| Technique tiers: C01–C03 0; C04–C05 1; C06, C10, C11, C13 2; C14–C15 3; C07–C09, C12, C16–C19 4; C20–C21, C29–C33 5; C22–C28, U01–U05 6. | `manifest.ts` | Tier 4 has eight competing jobs; tiers 0–2 have at most four cheap ones (§3.7). |

## 3. Decisions taken

Each entry: decision, why, and what the user's original intention said when it differed.

### 3.1 Geometry: non-regression rule, caps stay

- **Decision.** The 81/9/256 preflight, the classic adapter and the classic-only named families are untouched. Every new primitive, module, feature extractor, model and policy is written against `EngineProblem` (`problem.cells`, `problem.symbols`, `assembly.*`) and **may not introduce a new literal 81, 9 or 27**. An architecture test greps the new directories/files for those literals. Existing files are not converted in this milestone, including the 13 bound-only ones.
- **Criterion for a future geometry milestone (recorded now):** a file enters that milestone if and only if its literal is a *derivable bound* (replaceable by `limits.cells`/`problem.cells.length`); enumeration or encoding that depends on nine (9! templates, base-9 encoding, `⌊c/9⌋` row arithmetic, box arithmetic) stays classic-only and is *excluded* through D080 eligibility, as it already is.

| Class | Files (2026-09-17) |
| --- | --- |
| Derivable bound (refactor) | `limits.ts`, `exact.ts`, `evidence.ts`, `classic-run.ts`, `proof/counts.ts`, `proof/unique.ts`, `chains-runtime.ts`, `forcing-runtime.ts`, `generalized-runtime.ts`, `registry.ts` (`maxPatternCells` table), `coloring.ts`, `coloring-grammar.ts`, `manifest.ts` (text) |
| Classic algorithm (already self-gated) | `templates.ts`, `indexes/templates.ts`, `proof/template-cover.ts`, `fish.ts`, `fish-grammar.ts`, `fish-certificate.ts`, `exocet.ts`, `exocet-grammar.ts`, `fireworks.ts`, `specialized-runtime.ts`, `specialized-lineage.ts`, `unique-grammar.ts`, `unique-runtime.ts` |
| Adapter | `problem.ts` |

- **Why.** The user wants custom sizes later, not now, and wants nothing built now to obstruct them. Converting the bound files is mechanical but touches independently reviewed families and reruns a suite with four unresolved timeouts (D097) for no gain in this milestone.
- **Original intention.** "Geometria configurável no futuro" — reinterpreted as a constraint on new code plus a recorded classification.

### 3.2 Delivery surface: engine, tests and fixtures only

- **Decision.** No screen changes. Variant problems exist only as `EngineProblem` constraint instances in tests and corpus files. The JSON shape of those instances is the contract M4 later builds UI on; it is not exposed in the Solve workspace.
- **Why.** M2.5 pulls the engine half of M5 ahead of M3/M4. Exposing a paste-JSON path would pre-empt M4's format/versioning decisions.
- **Roadmap consequence (to apply on approval).** Insert M2.5 between M2 and M3. M4 keeps its UI scope. M5 shrinks to sandwich, remaining killer techniques and UI integration of what M2.5 ships.

### 3.3 Proof vocabulary: one new proposition, two new rules

Inventory of the seven requested variants against the existing checker:

| Variant | Existing fit | Missing |
| --- | --- | --- |
| Diagonal | `all-different@1` over 9 cells → covers by D061's size rule | adapter/instance only |
| Futoshiki, thermometer (chain of `<`), kropki white/black/negative | `relation@1` over 2 cells, ≤ 81 tuples | modules that emit relations |
| Killer cage | `all-different@1` (no covers unless 9 cells) | **sum** |
| Arrow | — | **weighted sum** (Σ arm − circle = 0) |
| Sandwich | `cases@1` on the positions of 1 and 9 | sum on the segment; expensive propagation — out (§8) |

- **Decision A — proposition `sum`.** `{ kind: "sum", cells, coefficients, total }` with `|cells| ≤ 16`, nonzero integer coefficients `|a_i| ≤ 8`, integer `total`. Cell values are `symbolValue(problem, symbol)`, a single helper in `problem.ts` returning the `SymbolId` today; a future symbolic domain adds `problem.symbolValues` without touching the checker.
- **Decision B — rule `linear-sum@1`** (lemma LS, §5). Premises: exactly one `sum` fact plus the **current exact domain fact** of every cell in it (D061; never a proponent-supplied mask). Conclusion: **one negative literal per node** (`{kind:"literal", positive:false}`) or `{kind:"false"}`. Ordinary `domain-restrict@1` closure follows, as for every other technique. A per-cell mask conclusion was rejected: it would be the first rule concluding `domain` directly and would turn the lemma into a biconditional the checker must verify bit by bit.
- **Decision C — rule `linear-combine@1`** (lemma LC, §5). Premises: 2…8 `sum` facts; parameters: multipliers in `{−1, +1}`. Conclusion: the `sum` obtained by multiplying and adding coefficient-wise over the union, zero coefficients dropped, `≤ 16` nonzero cells, `|coefficient| ≤ 8`. Nesting is allowed because the conclusion is an ordinary `sum` fact. This profile covers innies/outies over one or two houses with up to six cages and over a band with up to five, in a single node with cancellation; larger cases nest cage groups first (§12.1 item 2).
- **Decision D — capability `sums`.** `RuleCapabilities.sums: readonly LinearSum[]` (`{ id, cells, coefficients, total, premise }`), validated by the assembler like covers; `Assembly.sums`; `limits.sums = 256`, `limits.nodes += 256`. `all-different@1` additionally emits a `sum` with unit coefficients and `total = Σ symbolValue(problem, s)` when its scope size equals the symbol count and every cell's domain is within the symbol set — the same criterion D061 uses for covers — proved by the module's own `checkPrimitive`.
- **Why.** Readable Explain output, tiny nodes, one checker to review. Reusing `cover-count@1` with digit weights was rejected (§4.1).

### 3.4 Modules: named by semantics, not by puzzle genre

- **Decision.** Production modules: `order@1` (a < b; thermometer = ordered chain of instances), `difference@1` with `kind ∈ {consecutive, ratio, neither}` and **one instance per adjacent pair** (stable IDs; the 256-rule cap admits 27 houses + 144 adjacencies + ~40 cages + diagonals + arrows ≈ 225), `cage@1` (emits `allDifferent(cells)` **and** `sum(cells, +1…, total)`), `arrow@1` (emits `sum` with `+1` on arm cells and `−1` on the circle, `total = 0`; no all-different). Diagonal is two extra `all-different@1` instances from the adapter. Each module implements the full `RuleModule` interface, including a real `propagate`, a `checkPrimitive` for its capability derivations (§5, lemmas M1–M4) and the exact-phase `prune` hook (§3.13).
- **Propagation (tier −1 rule maintenance, drained before every selection window per `policy.ts:18`).** `order`/`difference`: literal removals proved by the relation fact plus the partner's domain through `table-filter@1` + single-literal `table-project@1` (D075). `cage`/`arrow`: `linear-sum@1`. Pairwise cage conflicts: existing all-different maintenance. **No tuple enumeration in propagation**: a nine-cell cage costs 9 × 9 × O(9) ≈ 730 operations per pass.
- **Why.** "Cada variante como módulo separado" would duplicate the sum in killer and arrow and make thermometer and futoshiki two names for one relation.
- **Out.** Sandwich (§8), two-digit arrow circles, cages that allow repeated digits.

### 3.5 Technique requirements over new capabilities

- **Decision.** Extend the capability letters: `S` (live sums present), `V` (numeric symbol values); `R` (relations) already exists. `eligible()` keeps resolving actual scopes (D080).
- **Free generalization, to be proven by tests rather than assumed:** naked subsets and ALS over cages; weak links across relations in chains/coloring; `linear-sum` contradictions inside forcing branches (`C22`–`C28`) because `false` is an ordinary conclusion.
- **Not free, in scope:** a `relation-strong` recipe in the implication index (lemma RS, §5), with D072 lease accounting and expansion through `table-filter@1` + `table-project@1` with a two-positive-literal clause. Without it thermometers contribute only weak links.

### 3.6 Variant-native techniques: two families

- **K01 Cage combinations.** Requires `D,A,S,V`. Tier 1 (provisional). Profile: a live `sum` whose cells lie in one proved all-different scope, **2–5 unsolved cells**, and input box `Π|D_i| ≤ 16,384` Cartesian tuples (≤ 64 D068 leaves of ≤ 256, joined by `table-union@1`). Builds the complete finite table (all-different × sum × current domains) and projects single-literal removals. Above the box bound K01 returns `excluded` with reason `cage-box-out-of-profile`; bounds propagation and K02 continue. **The box bound is a declared, versioned profile parameter, not a literal**; raising it is a profile change (version bump, refixture), not a redesign. Exact figures: a 4-cell cage with full domains has 6,561 box / 288 surviving ordered tuples (accepted); a 5-cell cage with full domains has 59,049 (excluded until propagation narrows it). The earlier "≤ 256 rows" wording was wrong — the leaf bound applies to the input box, not to surviving rows.
- **K02 Innies/outies.** Requires `D,S,V`. Tier 2 (provisional). Combine one full-cover scope sum with the cage sums intersecting it via `linear-combine@1` (single node, ≤ 8 premises), then apply `linear-sum@1` to the residual.
- **Why.** Without these, killer solves only by bounds. Sum-restricted ALS and dynamic thermometer bounds are deferred (§8). The extension path beyond tables — a `combination` proposition (§4.2) — is recorded as the future route, not adopted.

### 3.7 Where the score acts

- **Decision.** New policy identities `explain-fair@2` and `analyze-fair@2`. In Explain the estimates order detectors **inside** the current tier only, and **only for tiers ≥ 3** (`scoreFromTier = 3`, a policy parameter); tiers 0–2 keep the canonical `@1` order, so easy-puzzle traces are identical between `@1` and `@2`. In Analyze the estimates order across all tiers. `fixed-scan@1`, `event-fixed@1`, `explain-fair@1`, `analyze-fair@1` remain as mandatory ablation baselines. `choose()` is unchanged.
- **Why.** D055 (confirmed): Explain favors simpler proofs. The benefit of reordering within a tier is bounded by roughly `4·(N−1)` with `N` active jobs — negligible in tiers 0–2 (≤ 4 cheap jobs) and large in tiers 4–6 (7–8 expensive jobs). Worked example (§12.1 item 4): at a tier-4 state where only ALS-XZ has a step, `@1` reaches it after ≈ 57,000 work units (alphabetical order feeds finned fish first), `@2` after ≈ 2,800 — same step, same trace.
- **Correction to the original intention.** D048's fixed order is superseded (D054); D094 requires determinism *per policy version*, not identical traces across policies. "Não mudar o resultado provado — só a ordem" holds for soundness, count evidence and determinism; the trace may differ between `@1` and `@2` when several families have steps at the same state.

### 3.8 Board features → per-technique estimates; scalar difficulty as a by-product

- **Decision.** A `BoardFeatures` extractor reads `view.state` and `view.assembly` in `O(cells × symbols)`, **never builds an index**, and is **memoized per view identity** (the ledger calls `estimate` for every job after every accepted change). A shared `TechniqueEstimator` wired by the registry implements `descriptor.estimate(view)` for every technique from a static model keyed by technique id.
- **Feature schema v1 (fixed; any change bumps the schema version and the policy id):** unsolved cells; domain-size histogram (2, 3, 4+); total candidate count; per symbol: placements still needed, covers with exactly 2 live positions and with 3 (summed and maximum); covers with 1 live position; small all-different scopes with `n` unsolved cells and `n+1` candidates (scope-level ALS proxy); live sums, total sum slack (`Σmax − Σmin`), sums with ≤ 3 unsolved cells; live relation cells; static assembly counts (scopes, covers, relations, sums). **Candidate revision is excluded** — it proxies progress, which does not generalize across difficulty distributions.
- **Outputs per technique.** `hit` = P(≥ 1 checkable proposal in this state), `cost` = expected work units to the first proposal (censored at the per-technique cap when none), `gain` = a per-family constant equal to the mean `utility` (`features.ts`) of that family's accepted steps in the corpus. All clamped to 1…1024.
- **Scalar difficulty.** Derived from the same features and estimates (formula deferred, §12.3), exposed as an informative result field. No UI, no scheduler consumer; M3's target evaluator inherits it.

### 3.9 Calibration data: a sampling harness; generated plus licensed public puzzles

- **Decision — sampling harness (not a policy).** The Explain selection loop stops at the first buffered step (`select.ts:162`), so sampling cannot be a `SchedulerPolicy`. A bench-only harness drives `descriptor.discover()` directly on each view of the Explain trajectory — as the discovery tests already do — for **every eligible technique of every tier**, to exhaustion or a per-technique quantum cap, recording `(feature vector, found?, work units to first proposal or censored cap, utilities)`, then advances with the Explain choice. Deterministic, Node-only, offline; the cap is the cost control (a hard puzzle: ~50 states × 38 families × 16,384 units ≈ 30 M units).
- **Decision — corpus targets (requirements, not plan detail).** ≥ 300 generated classic puzzles; ≥ 1,000 public hard classic puzzles with verified license (candidate: Royle's 17-clue collection; list finalized in the plan after license verification); ≥ 150 generated killers; ≥ 100 generated puzzles for each of thermometer/futoshiki, kropki and arrow; ≥ 100 generated mixed puzzles. Every case records source, license, normalized hash and source group; calibration and held-out partitions are fixed by hash (D063 refinement of 2026-09-14).
- **Decision — fitting threshold.** A family receives a fitted model only with **≥ 200 positive states** (`hit = 1`) in the calibration partition. Below that, `hit` is the observed base rate (floor 1) and `cost` the observed median or the declared constant; the training script refuses to fit and lists such families in the ablation report. Rare families (Exocet, SK, Tridagon) are expected to stay on constants; the floor and the rotation are their safety net.
- **Why.** Samples are per state (~20–60 per puzzle); a ~24-feature linear model needs ≳ 10 positives per feature. Random generation almost never reaches tiers ≥ 5; only the public hard lists do.

### 3.10 Model format and integration

- **Decision.** Per technique, a linear model over the feature vector in **fixed-point integers** (weights ×1024, output `>> 10`, clamped 1…1024) for `hit` and `cost`; a constant for `gain`. Serialized as a static JSON imported by the policy module, carrying `policyId`, feature-schema version, corpus hash and training-script hash. No floats at runtime, no runtime dependency, no dynamic loading. Training is a plain Node script under the bench directory with no external library. Any weight change bumps the policy version (D094).

### 3.11 Fairness: keep the rotation, add deterministic in-run decay

- **Decision.** Keep "every k-th ticket serves the oldest eligible job" with `rotationEvery` a policy parameter (default 4). Add per ledger job a counter of consecutive served quanta without a proposal; `effectiveHit = hit >> min(decayShiftCap, counter)`, reset on proposal or candidate-revision change; `decayShiftCap` default 4. Ablation grid: `rotationEvery ∈ {2, 4, 8}` × `decayShiftCap ∈ {2, 4, 6}`. All parameters are part of the policy identity.
- **Why.** Explain cannot starve (tier exhaustion); in Analyze the rotation already guarantees every family ≥ ~50 services per 2 M-unit run. The residual risk is D063's misleading-score case; the decay is a fixed formula over the run's own counters — not learning.

### 3.12 Acceptance gate for scheduling (pass/fail)

All metrics in accounted work units, held-out partition, identical budgets, `@2` versus its `@1` counterpart:

| # | Metric | Pass |
| --- | --- | --- |
| A | Median work to first accepted step, per state, tiers ≥ 3 | reduction ≥ 20 % |
| B | Mean total work to logical stop (solved/stall), per puzzle | reduction ≥ 10 % |
| C | `incomplete` rate at the 2 M-unit budget | not higher than `@1` |
| D | Accepted steps per family (protects rare families) | ≥ 90 % of `@1`'s count for every family |
| E | Determinism | two runs → identical traces, for every policy |
| F | Explain tiers 0–2 | traces identical between `@1` and `@2` |

If any metric fails, `@1` stays default and `@2` ships **disabled** with the report committed under `docs/history/`; the milestone still completes — the variant deliverable does not depend on the model winning. The cold/warm/throttled browser matrix and the 10 s / 70 % time defaults remain the separate D063 gate.

### 3.13 Exact phase: module forward checking, trusted, oracle-validated

- **Problem (found in the audit).** §1's earlier "count evidence does not change" contradicted the variant goal: `ExactSearchSession` prunes with singles and all-different forward checking and consults modules only at complete leaves. A killer puzzle typically has no givens; for the exact phase it is an empty classic grid (~6.7 × 10²¹ completions) filtered at the leaves — inconclusive in every run. No Unique, therefore no Perfect and no conditional analysis on any variant.
- **Decision.** `RuleModule` gains `prune(rule, partialAssignment, domains): PruneResult` — bounds checking for sums, tuple filtering for relations, sound by construction, **not proof-checked**. The exact session calls it after singles propagation on every node. This rewrites D049's "singles propagation" to "singles plus module forward checking"; count independence from human-pruned candidates is unchanged (the exact phase still starts from original givens and rules). Trust comes from independent evidence (D052): every generated mixed puzzle is counted by both the engine and the variant oracle (§7), and a property test asserts that `prune` never removes a value that appears in an oracle solution.
- **Why.** The exact phase is evidence, not proof; its trust has always been differential testing. Keeping D049 verbatim would make variants "solvable but never certified".

### 3.14 Unconsumed capabilities: honest fallback, already implemented

- **Finding.** Three distinct paths exist today and none is a silent claim: (1) an unknown rule type fails assembly with `unsupported-rule` — the run never starts (D061); (2) a supported capability with no consuming technique (e.g., arrow without cages: K01 inapplicable) still gets rule propagation; each technique returns `excluded` with reason and dependencies (D080), the human phase ends `stalled-within-profile`, and the exact phase runs with the remaining budget; (3) consumed but insufficient — the same honest stall.
- **Decision.** No new behavior. The coverage ledger must show K01/K02 exclusion reasons (`no-cage-in-scope`, `no-overlapping-sums`, `cage-box-out-of-profile`) exactly as it shows classic exclusions. The result presentation is the existing one.

## 4. Alternatives rejected

1. **Sums through `cover-count@1` with digit weights.** Zero new primitives, but two inequalities per equation, D076's incidence semantics stretched to value weights, and unreadable Explain output.
2. **A `combination` proposition** (unordered digit sets for a cage). Stronger killer propagation, but a multiset proposition nothing else uses and a second checker/oracle surface. Recorded as the future extension path beyond K01's box bound.
3. **Modules named by genre.** Duplicates sums and relations; combinations stop being free.
4. **Cross-tier score in Explain.** Contradicts D055 and D063.
5. **Score only in Analyze.** Nothing reaches users this milestone.
6. **Score in all Explain tiers.** No measurable gain in tiers 0–2, and it pollutes the ablation with trace changes on easy puzzles.
7. **Score without rotation, decay only.** No floor when the model is wrong.
8. **Lifting the 81/9 caps now**, or converting the 13 bound-only files now. No product need; regression cost on reviewed families.
9. **JSON paste in Solve / minimal overlay.** Pre-empts M4.
10. **All seven variants including sandwich.** Case-split propagation, worst cost/benefit.
11. **Calibrating on the existing fixtures.** Per-technique candidate states sharing source puzzles (D063).
12. **Browser-timed cost calibration.** Work units are deterministic and sufficient for ordering.
13. **Scalar difficulty in the UI.** No human labels exist.
14. **Per-cell mask conclusion for `linear-sum@1`.** First rule to conclude `domain` directly; biconditional checking.
15. **Keeping D049 verbatim (singles-only exact search) on variants.** Count evidence would be inconclusive on every killer.
16. **Sampling as a `SchedulerPolicy`.** The selection loop stops at the first buffered step in Explain.

## 5. Proof lemmas (what the checker verifies)

| ID | Statement |
| --- | --- |
| **LS** (`linear-sum@1`) | Let `S = ⟨c₁…cₙ, a₁…aₙ, k⟩` be a `sum` fact and `Dᵢ` the current exact domain fact of `cᵢ` (placed cells have singleton domains). Let `loᵢ = min_{v∈Dᵢ} aᵢ·v`, `hiᵢ = max_{v∈Dᵢ} aᵢ·v` (for `aᵢ < 0` min and max swap — this is what makes arrow work). (i) For target `c_t` and `d ∈ D_t`: if `a_t·d + Σ_{i≠t} loᵢ > k` or `a_t·d + Σ_{i≠t} hiᵢ < k`, conclude `¬(c_t = d)`. (ii) If `Σ loᵢ > k` or `Σ hiᵢ < k`, conclude `false`. Premises: exactly `S` and the `n` domain facts, one per cell, none missing or extra. Inherits open assumptions, rule provenance and conditional taint from the union. Arity ≤ 17. |
| **LC** (`linear-combine@1`) | Premises `S₁…Sₘ`, `2 ≤ m ≤ 8`; multipliers `μⱼ ∈ {−1, +1}`. Conclusion `S*` with `a*_c = Σⱼ μⱼ·a_{j,c}` (`a_{j,c} = 0` when `c ∉ Sⱼ`), zero coefficients removed, `k* = Σⱼ μⱼ·kⱼ`; requires `|cells(S*)| ≤ 16` and `|a*_c| ≤ 8`. The checker recomputes and demands exact equality of cell set, coefficients and total. Provenance/assumptions/taint = union. A premise may itself be an LC conclusion. |
| **RS** (`relation-strong` recipe → `table-filter@1` + `table-project@1`) | Relation `R` over cells `C` with tuples `T`; current domains `D`; `T' = {t ∈ T : ∀j, t_j ∈ D_j}`. For literals `X = (c₁ = a)`, `Y = (c₂ = b)`: if every `t ∈ T'` satisfies `t_{c₁} = a` or `t_{c₂} = b`, conclude the clause `X ∨ Y`. Already verifiable by `table-project@1`'s signed-clause check over surviving rows (`tables.ts:95`). |
| **M1** (`cage@1` derivation) | From rule root `cage(cells, total)`: `all-different(cells)` and `sum(cells, 1…1, total)`. Checker recomputes both from the normalized rule instance. |
| **M2** (`arrow@1` derivation) | From rule root `arrow(arm, circle)`: `sum(arm ∪ {circle}, +1 on arm, −1 on circle, 0)`; `arm` and `circle` disjoint. |
| **M3** (`order@1`, `difference@1` derivations) | From rule root and `problem.symbols`: `relation([a, b], T)` where `T` is exactly the set of value pairs satisfying `<`, `|x−y| = 1`, `x = 2y ∨ y = 2x`, or the complement of the last two, respectively. Checker recomputes `T` and demands set equality. |
| **M4** (`all-different@1` full-cover sum) | If `|cells| = |symbols|` and every cell's domain ⊆ `symbols`, conclude `sum(cells, 1…1, Σ_s symbolValue(s))`. Same premise shape as the D061 cover derivation. |

Module capability derivation (`checkPrimitive`): M1–M4 above. Exact-phase `prune` is **not** a lemma — it is trusted evidence code validated by §7.

## 6. Scheduling contracts (for the plan)

### 6.1 `Estimate` producer

`TechniqueEstimator.estimate(techniqueId, features): Estimate` — pure, integer, reads a frozen table. Registry wires it into every descriptor; descriptors may still override `eligible()`/`watches()`. `BoardFeatures.of(view)` is memoized by view identity (WeakMap, as `FairPolicy.#features` already does for steps).

### 6.2 Ledger and policy additions

Per job: `emptyQuanta` counter. `FairPolicy` parameters: `scoreFromTier` (Explain only, default 3), `rotationEvery` (default 4), `decayShiftCap` (default 4). All three in the policy id's canonical options.

### 6.3 Offline pipeline (Node, bench only)

`corpus.json` (cases, partitions, hashes, licenses) → sampling harness → `samples.jsonl` (regenerable, not committed) → `train` script (refuses families under 200 positives) → `model-<version>.json` (committed, hashed) → ablation script (metrics A–F, parameter grid) → report committed under `docs/history/`.

## 7. Independent evidence (D052 applied to variants)

- **Second oracle.** `tests/solver/oracle-variants.ts`: depth-first enumeration with its own evaluators for all-different, sum, order, difference/ratio; imports nothing from `web/src/solver`. Validated on 4×4 instances against exhaustive brute force before it validates the engine.
- **Per module:** positive, negative and boundary fixtures; per-elimination forcing and per-placement forbidding through the oracle; original-clue replay; assembly rejection of malformed instances; `checkComplete` agreement with the oracle on complete grids; `prune` never removes a value present in any oracle solution (property test over generated instances).
- **Composition by property:** random small mixed problems (all four modules plus classic scopes on reduced domains) — engine exact count equals oracle count; every accepted deduction is oracle-consistent; registration-order permutation changes nothing (D061).
- **Free generalization:** fixtures showing a naked pair inside a cage, an ALS in a cage, an X-chain across a thermometer strong link (RS recipe), a `linear-sum` contradiction inside a forcing branch.
- **Lemma fixtures:** LS with a negative coefficient (arrow) and with a placed cell; LC with 2 houses + 6 cages accepted and 2 houses + 7 cages rejected; K01 4-cell full-domain cage accepted (288 tuples through leaf unions), 5-cell full-domain cage excluded with reason, the same cage accepted after propagation narrows its box.
- **Uniqueness on variants:** U01–U05 refuse when a cage or relation touches the trade cells (D093); the conditional profile reports the exclusion honestly.
- **Determinism:** identical traces across repeated runs for every policy; policy id present in `optionsKey`; Explain tiers 0–2 identical between `@1` and `@2`.
- **Non-regression:** grep test for `81|9|27` literals in new files; classic corpus traces under `@1` policies unchanged by the module additions.

## 8. Out of scope (confirmed)

| Item | Reason |
| --- | --- |
| Custom sizes / non-9×9 / symbol domains beyond 1–9; converting existing bound files | §3.1 |
| Sandwich | §3.4 |
| Any UI, JSON input in Solve, overlays | §3.2 |
| Browser benchmark matrix, 10 s / 70 % defaults | separate D063 gate |
| Sum-restricted ALS, dynamic thermometer bounds in chains, `combination` proposition | §3.6, §4.2 |
| Analyze rollout/lookahead | D063: stays off |
| Online or persistent learning | D063; frozen versioned model |
| Scalar difficulty in the UI | §3.8 |
| Uniqueness techniques on variant cells | D093 already refuses; tests only |
| Two-digit arrow circles, repeat-digit cages | §3.4 |
| Changes to `choose()` | §3.7 |
| Hints (M6), construction (M3), community | roadmap |

## 9. Risks

1. **Corpus bias.** The generator under-produces tiers 4–6; public lists carry license work. Mitigation: the ≥ 1,000 public hard puzzles requirement; rare families stay on constants with `hit ≥ 1`.
2. **Sampling cost.** ~30 M units per hard puzzle at the proposed cap; Node throughput is unmeasured. Offline only; the cap is the control.
3. **Trajectory mismatch.** Samples follow the Explain trajectory; Analyze visits different states. Known approximation; the ablation decides.
4. **Trusted `prune` bugs.** A wrong prune yields false zero/unique counts. Mitigation: oracle differential on every generated case plus the "never removes an oracle-solution value" property; independent review of each module's `prune`.
5. **Rule count.** One `difference@1` instance per adjacent pair puts negative kropki near the 256-rule cap when combined with cages, arrows and diagonals (~225 estimated).
6. **Proposition codec change.** Adding `sum` touches codec, transport and replay; memory-only persistence means no migration, but every codec test reruns.
7. **Suite time.** D097's four unresolved unit-test timeouts; new modules and property tests lengthen the suite.
8. **K01 proof size.** Leaf unions can reach 64 nodes per table; steps stay within 4,096 nodes / 1 MiB but transport chunks grow.
9. **Free generalization assumptions.** ALS/subset iteration over cages and relation weak links are verified by inspection but must be pinned by tests before the plan relies on them.
10. **Roadmap reordering.** Must be recorded in `roadmap.md` and a decision entry.

## 10. Open questions — status after the audit

| # | Question | Status | Resolution / owner |
| --- | --- | --- | --- |
| 1 | `linear-combine@1` bounds | **RESOLVED** | 2–8 premises, ±1, ≤ 16 residual cells, nesting allowed (§3.3 C) |
| 2 | Exact enumeration and sums | **RESOLVED** | trusted `prune` hook, oracle-validated (§3.13) |
| 3 | Final feature list; revision as a feature | **RESOLVED** | schema v1 fixed in §3.8; revision excluded |
| 4 | Sampling trajectory | **RESOLVED** | Explain-only in M2.5; recorded approximation (§9.3) |
| 5 | Rotation/decay grid | **RESOLVED** | {2,4,8} × {2,4,6} (§3.11) |
| 6 | Corpus targets and public lists | **RESOLVED / DEFERRED** | counts fixed (§3.9); the specific public lists are chosen in the plan after license verification; generator location (`tests/` vs `tools/`) decided in the plan |
| 7 | `gain` | **RESOLVED** | per-family constant in v1 |
| 8 | Difficulty formula | **DEFERRED** | informative field only; formula chosen in the plan, no acceptance depends on it |
| 9 | Provisional tiers K01/K02 | **RESOLVED (provisional)** | 1 and 2; explanation preference, not difficulty (D070) |
| 10 | Milestone naming | **DEFERRED** | decided when `roadmap.md` is edited on approval |
| 11 | Review process | **RESOLVED (assumed)** | same as M2: independent review per task (D065/D066); the user did not object |
| 12 | `difference@1` instance shape | **RESOLVED** | one instance per adjacent pair (§3.4) |

## 11. Corrections made to the requesting premises

- The bench corpus is empty, not a calibration source.
- `estimate()` is a placeholder; the existing formula is effectively "tier then alphabetical".
- The score cannot skip tiers in Explain without revoking D055.
- D048 does not require identical traces across policies; D094 requires determinism per policy version.
- Diagonal is not a module; thermometer and futoshiki are one module; killer and arrow share the sum.
- Thermometer strong links are not free; only weak links are (`implications.ts:91-108`).
- Every variant needs a second test oracle; Algorithm X cannot express sums or orders.
- Sampling cannot be a scheduler policy; it is a harness (`select.ts:162`).
- "Count evidence does not change" was false for variants without exact-phase forward checking (§3.13).
- K01's bound is the table's input box, not its surviving rows; a 4-cell cage already exceeds 256 rows.
- 27 solver files carry the literal 81, not 150; half are bounds, half are self-gated classic algorithms.

## 12. Audit ledger (2026-09-17, Socratic ambiguity review)

Method: `/gsd:spec-phase` scoring (goal 35 %, boundary 25 %, constraints 20 %, acceptance 20 %). Initial 0.31; final 0.12; all dimension minimums met after round 5.

### 12.1 Items raised and their status

| # | Item | Status | Outcome |
| --- | --- | --- | --- |
| 1 | `linear-sum@1` exact lemma and conclusion granularity | **RESOLVED** | Lemma LS (§5); one negative literal or `false` per node |
| 2 | `linear-combine@1` lemma and bounds | **RESOLVED** | Lemma LC; 8 / ±1 / 16 with nesting; two-house + 6 cages fixture |
| 3 | Unconsumed capability: error, fallback, what the user sees | **RESOLVED** | Existing honest fallback; ledger reasons required (§3.14) |
| 3b | Exact phase inconclusive on variants (hidden contradiction with §1) | **RESOLVED** | Trusted `prune` hook, oracle-validated; D049 wording change (§3.13) |
| 4 | Score vs "same step sequence" (D048) — does ordering alone save time? | **RESOLVED** | Premise corrected (D054/D094); worked example ≈ 57,000 → ≈ 2,800 units; score confined to tiers ≥ 3 in Explain |
| 5 | Calibration sample sizes; where killer/thermo puzzles come from | **RESOLVED** | ≥ 200 positives per fitted family; corpus counts in §3.9; generator for variants |
| 6 | Geometry: refactor or rewrite; inclusion criterion | **RESOLVED** | 27 files classified (§3.1); criterion recorded; none converted in M2.5 |
| 7 | Killer cage tuple counts; representation limit | **RESOLVED (provisional)** | Propagation is tuple-free; K01 box bound 16,384 as a versioned profile parameter; `combination` as future route |
| 8 | Ablation gate numbers; milestone outcome if `@2` loses | **RESOLVED** | Metrics A–F (§3.12); `@2` ships disabled on failure, milestone completes |
| 9 | Sampling policy naming (found in scouting) | **RESOLVED** | Harness, not policy (§3.9) |
| 10 | Feature extraction cost per state (found in scouting) | **RESOLVED** | Memoized per view (§3.8, §6.1) |
| 11 | `relation-strong` lemma (found in scouting) | **RESOLVED** | Lemma RS fits existing table algebra |
| 12 | Module derivation lemmas M1–M4 | **RESOLVED** | §5 |

### 12.2 Provisional items (accepted with "simplify now, keep it parameterizable")

- K01 input-box bound (16,384) — declared profile parameter; raising it is a version bump.
- K01/K02 tiers (1, 2).

### 12.3 DEFERRED (owner: implementation plan)

- Specific public puzzle lists after license verification; generator location.
- Scalar difficulty formula (informative only).
- Milestone naming in `roadmap.md`.

### 12.4 BLOCKING

None. Every question that could have been blocking received a decision (items 1, 2, 3b, 4, 5, 6, 8) or an explicit permission to simplify with a parameterized bound (item 7).
