# Sudoku Engine: expanded deductions and adaptive reasoning

**Approval update:** The user approved this design at `0e98c2b` and authorized implementation under D065/D066. Earlier review-only wording below records the drafting state; benchmarks and runtime acceptance remain required.

Date: 2026-09-12. Status: **DETAILED DESIGN PROPOSAL READY FOR REVIEW — not implementation authorization.**

This research rationale accompanies the revised [screen/evidence specification](2026-09-12-m2-classic-solver-design.md), [concrete engine contracts](2026-09-12-m2-engine-contracts.md), [bounded technique coverage matrix](2026-09-12-m2-technique-coverage.md) and [complete implementation plan](../plans/2026-09-12-m2-classic-solver.md). Those annexes finish the technical design and replace the former six-technique/flat-proof/full-checkpoint contracts. Where this research discussion offers several experimental choices or sketches, the concrete contracts state the proposed implementation choice. All remain subject to design approval.

## 1. Confirmed steering and current boundary

The user requested a much broader logical-technique repertoire, investigation of chess-like board/technique scoring, primary-source research, and an architecture prepared now for interacting puzzle constraints. The user then explicitly selected **Explain and Analyze modes, defaulting to Explain**, and **Perfect deductions must follow from clues and rules alone; uniqueness-dependent paths are shown separately**. These are confirmed directions. Algorithms, numerical budgets, rollout strategy and other proof details below are recommendations for review, not approved implementations.

The application now uses English under D053 and persistent light/dark pastel themes under D058. Latest inspection found clean `docs/m2-solver-design` at `80471d2`, preserving research `24e0d25`. Preserve the newer sidebar, board presentation, notes, input and appearance work. Existing UI verification is not solver verification. This session changes Markdown only; no solver, benchmark engine or variant implementation is created.

“All logical techniques” needs an auditable coverage contract rather than a claim of unlimited completeness. Technique names overlap; a general chain can cover several named patterns, and new patterns and generalizations continue to appear. The original Sudoku Explainer FAQ explicitly discusses the lack of a single technique count and terminology. We will inventory families, aliases, exact pattern bounds and verified coverage, and expose omissions rather than quietly limiting the engine to six techniques. A finite human-technique catalogue does not establish that every valid puzzle has a discoverable human-style path within any time limit. [Sudoku Explainer FAQ](https://github.com/SudokuMonster/SukakuExplainer/wiki/SE121---FAQ).

Broad classic coverage is the revised design target. Catalogued is not implemented. Implementation can proceed in testable batches, but the earlier six techniques are only the first kernel, not a substitute for the expanded requested target. The release manifest must identify each family's actual status and bounds. Variants remain later user-facing milestones; their integration contracts belong in this design now.

## 2. Research findings and their limits

| Primary source inspected | Finding | Consequence for this project |
| --- | --- | --- |
| [HoDoKu solver configuration](https://hodoku.sourceforge.net/en/docs_solv.php) | It supports configurable ordering, expensive-technique controls, progress measures using immediate and downstream singles, and filters for unnecessary fish searches. | There is a direct precedent for evaluating the usefulness of a Sudoku step. Our proposed scheduling formula is not copied from or benchmarked by HoDoKu. |
| [Schulte and Stuckey, Efficient Constraint Propagation Engines](https://arxiv.org/html/cs/0611009v1) | Studies event tracking, fixed points, priorities and staged propagation. Dynamic priority improves some workloads and harms others. | Use event-driven work queues and measure scheduling overhead; do not promise that a clever score always beats simple ordering. |
| [Choco: designing a propagator](https://choco-solver.org/docs/advanced-usages/propagator/) | Documents constraint scope, priorities, incremental updates and event conditions. | Constraint semantics and scheduling can be separate interfaces. This is an architectural reference, not a proposal to add a Java runtime. |
| [Sudoku Explainer FAQ](https://github.com/SudokuMonster/SukakuExplainer/wiki/SE121---FAQ) | Discusses overlapping techniques and why locally simplest steps do not guarantee a globally simplest path. | Separate detector choice, move choice and proof difficulty; do not advertise an optimal explanation path. |
| [Berthier's CSP-Rules](https://github.com/denis-berthier/CSP-Rules-V2.1) | Uses generic reasoning patterns such as whips/braids and application-specific interfaces; supports multiple puzzle domains. | Broad coverage can come from reusable proof mechanisms plus named explanations, not a separate monolithic solver per technique. |
| [Rangsk's SudokuSolver](https://github.com/dclamage/SudokuSolver) | The project's README describes logical paths, variant support and separate solution counting. | A close product precedent for the proposed separation. Only documentation was inspected successfully; its internal implementation and performance were not independently audited. |
| [Stockfish project](https://stockfishchess.org/) | Describes position evaluation combined with tree search. | The useful analogy is spending computation on promising work and comparing continuations. Sudoku deduction does not need an opponent or a win-probability score. |

Sources were accessed on 2026-09-12. HoDoKu's original documentation and the older Sudoku Explainer FAQ are historical primary descriptions, not claims about the latest release counts. No third-party executable was installed or benchmarked. Study algorithms and cite definitions; any future code/data reuse must follow the source's actual license and attribution requirements.

## 3. Expanded technique inventory

The table is the intended coverage catalogue for the revised classic engine, not a list of completed features. Every entry requires its own exact theorem/premises, search bounds, explanation representation and positive/negative fixtures before it can be marked verified. Family-level discovery does not justify claiming every specialized form is supported.

| Family | Techniques and aliases included in the inventory | Implementation/proof direction and primary reference |
| --- | --- | --- |
| Elementary placements and intersections | Full House/Last Digit; Naked Single; Hidden Single; pointing and claiming; direct forms that immediately expose a single. | Unit-support counts and explicit consequences. Keep an intersection and its newly created single as replayable steps even if the UI groups them. [Singles](https://hodoku.sourceforge.net/en/tech_singles.php), [intersections](https://hodoku.sourceforge.net/en/tech_intersections.php). |
| Subsets | Naked/hidden pairs, triples and quads; locked pairs/triples; generalized complementary subsets. | Parameterized subsets, not duplicated pair/triple engines. In a nine-cell house, large complementary forms often have a smaller equivalent; record equivalent coverage rather than inflate technique counts. [Naked subsets](https://hodoku.sourceforge.net/en/tech_naked.php), [hidden subsets](https://hodoku.sourceforge.net/en/tech_hidden.php). |
| Fish | X-Wing, Swordfish, Jellyfish, Squirmbag, Whale, Leviathan; finned/sashimi forms; Franken/Mutant forms; endo-fin, cannibalistic and Siamese forms. | A base/cover-set family with explicit sizes and overlap/fin semantics. Initial implementation order can be small/basic before large/complex, while the manifest retains the full target. [Fish theory and size names](https://hodoku.sourceforge.net/en/tech_fishg.php). |
| Short single-digit patterns | Skyscraper, Two-String Kite, Turbot Fish, Empty Rectangle and dual forms. | Fast named detectors plus equivalent short implication proofs; distinguish an explanation alias from a separate discovery capability. [Single-digit patterns](https://hodoku.sourceforge.net/en/tech_sdp.php). |
| Wings and bent subsets | XY-Wing/Y-Wing, XYZ-Wing, W-Wing, WXYZ-Wing; larger bent almost-locked subsets, chute remote-pair forms. | Bivalue/trivalue indexes plus implication or restricted-set proofs. Each larger wing variation needs a stated definition; similar names are not interchangeable. [Wings](https://hodoku.sourceforge.net/en/tech_wings.php), [WXYZ-Wing](https://www.sudokuwiki.org/WXYZ_Wing). |
| Coloring | Simple coloring, color trap/wrap, multi-coloring, 3D Medusa. | Graph components with independently checked weak/strong-link semantics; no assumptions inferred from visual color alone. [Coloring](https://hodoku.sourceforge.net/en/tech_col.php), [3D Medusa](https://www.sudokuwiki.org/3D_Medusa). |
| Chains and loops | Remote Pairs; X-/XY-Chains; continuous/discontinuous Nice Loops; AICs; grouped links; ALS links; grouped AICs/loops. | Shared signed implication graph plus proof DAG. Preserve familiar names when a proof matches a known pattern. Record link/node/branch limits. [Chains and loops](https://hodoku.sourceforge.net/en/tech_chains.php). |
| Almost locked sets | ALS-XZ, ALS-XY-Wing, ALS chains, Death Blossom. | Shared ALS discovery/cache with exact overlap and restricted-common-candidate contracts. [ALS](https://hodoku.sourceforge.net/en/tech_als.php). |
| Combined set/count arguments | Sue de Coq; aligned pair/triple/generalized exclusion; subset-counting arguments. | Candidate combinations and explicit covers/exclusions; every omitted combination must have a reason. Do not treat generic exhaustive search as a short named proof automatically. [Sue de Coq](https://hodoku.sourceforge.net/en/tech_misc.php), [Aligned Pair Exclusion](https://www.sudokuwiki.org/Aligned_Pair_Exclusion), [Subset Counting](https://www.sudocue.net/guide.php), [Explainer techniques](https://github.com/SudokuMonster/SukakuExplainer/wiki/SE121---FAQ). |
| Forcing and contradiction | Digit/cell/unit forcing chains; Nishio; forcing nets; static/dynamic/nested forcing; Kraken Fish. | Typed assumption scopes, all required alternatives and discharged contradictions. Finite proof search can discover these; only complete validated proofs may be called deductions. [Last-resort techniques](https://hodoku.sourceforge.net/en/tech_last.php), [forcing nets](https://www.sudokuwiki.org/Forcing_Nets), [Explainer](https://github.com/SudokuMonster/SukakuExplainer). |
| Generalized chains | Bivalue chains, z-chains, t-whips, whips, braids, g-whips; OR-k forcing/whip families. | These have distinct finite continuity/branching contracts and independent proof grammars; see the [implementation guide](../../solver/techniques/generalized-chains.md). D087 separates signed OR forcing from positive inserted OR whips; D088 confines effect-free source retention to complete named negative proofs. An AIC implementation alone does not establish this coverage. [CSP-Rules](https://github.com/denis-berthier/CSP-Rules-V2.1). |
| Advanced specialized patterns | Fireworks; SK Loops; Exocet/Junior Exocet/Double Exocet; Tridagon families and guardians. | Separate precise pattern contracts and counterexamples. Some structural arguments mix constraints or carry assumptions; label their dependencies individually. [Fireworks](https://www.sudokuwiki.org/Fireworks), [SK Loops](https://www.sudokuwiki.org/SK_Loops), [Exocet](https://www.sudokuwiki.org/Exocet), [Double Exocet](https://www.sudokuwiki.org/Double_Exocet), [Tridagons](https://www.sudokuwiki.org/Tridagons). |
| Templates and overlay | Per-digit templates, pattern overlay/POM and template incompatibility. | Finite pattern-set elimination; attach a checkable set/certificate. Potentially expensive and not necessarily an easy human explanation. [Templates](https://hodoku.sourceforge.net/en/tech_last.php), [Pattern Overlay](https://www.sudokuwiki.org/Pattern_Overlay). |
| Uniqueness-dependent families | Unique Rectangles types 1–6 and extensions; Hidden/Avoidable/Extended Rectangles; unique loops; BUG/BUG+1 and generalized BUG forms. | Catalogued, but disabled until independent uniqueness evidence exists and every structural premise is valid for the complete rule set. They are displayed separately and never qualify a path as Perfect. [Uniqueness methods](https://hodoku.sourceforge.net/en/tech_ur.php), [strategy families](https://www.sudokuwiki.org/Strategy_Families). |

Named brute force, “Bowman's Bingo” and unrestricted trial-and-error are retained in the taxonomy as **search**, not silently included in human logic. A long search transcript is not automatically a human explanation. A theorem-backed contradiction pattern can use internal search to discover its proof and still be a deduction; the deciding factors are its specified proof rules and complete checked certificate, not whether its implementation contains a loop or temporary assumption.

Additional names found during implementation belong in an alias/coverage ledger: `name → family → theorem/proof rule → exact supported bounds → fixture IDs → status`. Statuses: catalogued, specified, implemented, independently verified, unsupported. No placeholder “supports everything” flag. Solving a fixture by another technique does not prove discovery coverage of its advertised technique.

## 4. What the engine should score

Recommended: **score computational opportunities, then compare proven deductions**. A sound Sudoku deduction preserves all solutions admitted by the premises; it does not make a correct digit more correct. For an ambiguous puzzle, arbitrarily selecting a completion is a search decision even if its score is high.

Keep four quantities separate:

1. **Detector priority:** likelihood that running technique T on the relevant current region yields a useful step, divided by estimated work.
2. **Step usefulness:** progress after applying an already proven deduction, optionally including a small rollout of other proven deductions.
3. **Explanation complexity:** how demanding the proof is to follow (family, links, branches, distinct premises and cross-rule dependencies).
4. **Evidence status:** existence, count, proof completeness and fallback usage. These are facts with witnesses/certificates, never scores.

Candidate priority model for experiments, not a calibrated formula:

```text
priority(T, state) = eligibility(T, state) × (
                      estimatedHitRate(T, cheapFeatures)
                    × estimatedUsefulProgress(T, cheapFeatures)
                    / max(estimatedWork(T, cheapFeatures), workFloor)
                    + fairnessAllowance(T))
```

`eligibility` is a sound capability/precondition filter. Estimates can be wrong; they reorder work but cannot prove absence of a deduction. An initial hit/work table can be hand-authored, versioned and calibrated offline. No AI provider, neural network or online training is necessary for the first implementation. Changing measured priorities mid-run can make paths machine-dependent; default Explain should use frozen versioned cost/priority tables and deterministic work counts. Record scheduler/profile version with the trace.

Cheap features: changed cells/digits/constraints; candidate counts; unit support counts; matching two-/three-candidate cells; strong-link density; cached ALS information; and active constraint types. Do not spend as much time estimating a complex technique as running it. An XY-Wing check can be excluded when there are fewer than three bivalue cells; a fish check for one digit need not be repeated until its relevant support pattern changes. Cache invalidation must cover the detector's full declared dependency set; global chains may need whole-graph invalidation.

Possible usefulness features for a proven step: placements, candidate-domain reduction, singles enabled and progress from a bounded cheap-deduction continuation. Sum of `log2(candidateCount)` over unresolved cells is a possible domain-size proxy, **not probability, actual solution entropy or a correctness test**; ignore filled cells and handle zero domains as contradictions. Simple candidate-removal count alone is too crude. Ten irrelevant-looking removals can matter less than one removal that unlocks a series of singles. Our exact weights need measurement.

HoDoKu's downstream progress measurement supports evaluating a found step's consequences, while the priority/event research supports choosing which computation to try. The two solve different problems; running every expensive detector and only then scoring its result would fail the user's goal of avoiding wasted work.

## 5. Alternatives and selected mode direction

| Approach | Strength | Cost / limit | Recommendation |
| --- | --- | --- | --- |
| Fixed ordered scan, with complete passes | Predictable and easy to audit; good baseline. | Repeats failed checks and ignores current structure. | Retain as benchmark/reference policy, not the sole engine strategy. |
| Event-driven, prioritized technique portfolio | Wakes relevant work, favors useful inexpensive detectors, retains proof verification. | Requires correct dependency tracking and fairness; bad estimates can be slower. | Recommended production foundation for both modes. |
| Best-first or beam search over deduction paths | Can compare downstream progress and explanation cost, close to the requested board-evaluation idea. | Finding/scoring alternative proofs itself costs time; potentially duplicates many states. | Add bounded continuation evaluation in Analyze; compare against the simpler foundation before enabling deeper path search. |

**Explain — confirmed default mode:** prioritize the least-complex proof tier under a published profile. Within a tier, schedule likely useful detectors first and choose a deterministic, readable proof. To assert “no simpler supported step”, exhaust or soundly exclude the simpler tier at the same state revision. If budget prevents that, say “best step found within the budget”, not “simplest possible step”. Prefer cheap progress rather than exhaustively optimizing the entire explanation path.

**Analyze — confirmed alternate mode:** optimize expected verified progress per computational budget; permit bounded comparisons of alternative deductions and their cheap continuations. Keep every applied logical inference explainable and checked. Report the actual selected path and its cost; do not promise a globally shortest path or make Analyze mean “skip directly to guesses”. Both modes retain human-first operation, separate exact-count evidence, explicit search fallback, time limits and Cancel.

A first bounded-rollout experiment: compare at most four already proven candidate steps, then up to 16 additional proven cheap deductions for each, within at most 10% of the remaining work budget. These are proposed benchmark parameters, not user-approved constants. The simulation does not guess cell values. Only the selected real step is applied to the actual solver state; discarded lookahead deductions are not appended to the user trace. Deep beam search is an optional experiment until it earns its cost.

Fairness is mandatory: low priority means later, not never. At every state, maintain an auditable ledger of detector statuses: pending, in-progress, found, exhausted within profile bounds, soundly excluded, or interrupted. A stall claim requires all eligible detectors to finish for that state/profile, accounting for invalidations. Reaching a time, chain-length, proof-size or rollout limit must be visible. “No supported deduction found within these bounds” is not “no logical deduction exists”. The score never authorizes dropping a rule or deleting a candidate.

## 6. The multi-constraint boundary to establish now

Treat the puzzle as **one conjunction of constraints over one shared set of cells and candidates**. A factory/registry assembles capabilities and reasoning modules for that definition. It must not concatenate independent classic, killer and thermometer solvers, each with its own isolated candidate truths.

Proposed responsibilities:

| Boundary | Contract |
| --- | --- |
| Normalized engine problem | Stable cell/symbol IDs, copied givens, versioned constraint instances and an identity covering every semantic parameter. Classic 9×9 is the first adapter; persisted M1 definitions need no immediate migration. |
| Constraint module | Validate parameters; declare scope; check completed assignments; supply sound candidate filtering and its reasons; optionally supply stronger relations. It cannot place digits directly into UI state. |
| Capability assembler | Verify every rule instance has supported semantics for the requested operation. Build real all-different groups, digit-covering houses, peer relations and other declared structures. |
| Shared fact/index layer | Candidate domains, unit supports, arithmetic combinations and signed implications with provenance. Invalidate affected indexes whenever inputs change. |
| Technique module | Declare required capabilities and assumptions, watched facts, proof-search limits, eligibility estimate and resumable discovery. Propose a typed proof and effects; never commit its own unchecked state edits. |
| Proof checker | Validate each primitive rule, scope, branch closure and consequence. Only this boundary authorizes a deduction's effects. Separate discovery from checking. |
| Scheduler | Decide which eligible work to run and which proven step to use according to Explain/Analyze. It owns priorities, not truth. |
| Exact verifier | Evaluate the entire original constraint set in separate state, independently of the human path and scheduling scores. Preserve zero/one/multiple evidence rules. |

Important distinction: an **all-different group** is not necessarily a **house containing every digit exactly once**. A three-cell nonrepeating killer cage cannot support “digit 7 has only one place here” unless another fact establishes that 7 must occur. A nine-cell diagonal over digits 1–9 with all-different semantics does establish full digit coverage. Naked subsets use an all-different relation; hidden subsets and fish need the relevant existence/coverage premises too. Extra adjacency or arithmetic constraints cannot be mislabeled as full houses.

Concrete mixed-constraint example, derived from the proposed semantics: cells A and B are a two-cell cage totaling 10, and a thermometer establishes A < B. Their possible digit pairs are `(1,9), (2,8), (3,7), (4,6)`. The shared state can therefore restrict A to 1–4 and B to 6–9. A classic row deduction removing 1, 2 and 3 from A then forces A=4 and B=6. One trace cites the cage, thermometer and row facts. Independent rule propagation may be insufficient to discover the first combined restriction; the architecture therefore permits shared tuple relations and explicit cross-rule techniques.

Proposed semantic contract sketch; all identifiers are versioned data, not user-provided executable code:

```text
ConstraintInstance = { instanceId, ruleType, ruleVersion, cells, parameters }
ConstraintCapabilities = { completedAssignmentCheck, explainedPropagation,
                           allDifferentGroups, digitCoveringHouses, relations }
TechniqueDescriptor = { techniqueId, version, requires, assumptionPolicy,
                        watchedFacts, bounds, estimate, enumerateProofs }
ProofContext = { problemIdentity, candidateRevision, ruleVersions,
                 availableFacts, allowedAssumptions, proofBudget }
```

This boundary is now concretized in [engine contracts §§1–5](2026-09-12-m2-engine-contracts.md#1-boundaries-and-identity), with compile-time contracts and planned executable mock-rule tests. It does not require real killer/thermometer UI in M2. M2's classic adapter supplies the familiar 27 houses; orchestration/scheduler/proof infrastructure must not contain hardcoded `27`, `classic@1` or future variant-name special cases. Optimize bitmasks for the current nine-symbol domain without claiming general geometry is implemented.

New internal problem identity must include canonical constraint IDs/versions/parameters, not only the previous `classic@1:<81 digits>` key. The classic-only adapter can preserve the old external input format. Unknown semantics still block complete-puzzle claims. Shared candidate buffers, indexes and caches belong to a single snapshot/branch; no reuse across differing rule versions or speculative branches without explicit identity checks.

## 7. Proofs, assumptions and Perfect

The original flat placement/elimination trace suffices for singles and pairs but not for chains, branching nets or mixed constraints. Extend it to a **proof DAG**: nodes cite input facts or earlier nodes, apply a named/versioned primitive, and produce conclusions. A visible step references proof roots plus its placements/eliminations. The UI can collapse repeated subproofs; the checker must retain their complete dependencies.

Required node kinds: given fact; rule instance; current candidate-domain fact justified by initialization/prior deductions; direct inference; conjunction; explicit exhaustive alternatives; temporary assumption; contradiction; and assumption discharge. A chain is a simple path through this structure. A forcing net is a branching subgraph. Grouped alternatives and higher-arity relations need actual logic, not merely an untyped list of graph edges.

Every proof tracks inherited assumptions. **Confirmed policy:** only a complete path derived from givens and declared puzzle rules, with all temporary assumptions properly discharged, can supply Perfect's logical-path requirement. Independent uniqueness evidence is still required separately. Reading a solved grid from the exact verifier, an undisclosed assumption that a candidate is true, or a uniqueness-dependent proof does not qualify. Advanced explained contradiction techniques remain permitted under D029; complexity alone is not guessing.

Uniqueness-based deductions must not help prove the uniqueness they assume. They require prior independent evidence, use a separate trace, and remain ineligible for Perfect even after uniqueness is known. A proposed user flow is an optional **Uniqueness-dependent analysis** action after a unique result: a fresh bounded request reads the unchanged original problem, its verified uniqueness evidence and a copy of the unconditional logical prefix. It never imports the exact solution's digits as premises or replaces the primary path. Give it its own operation identity and result panel; Cancel does not erase the primary result. No claim of uniqueness is generated from its resulting board.

Additional variant safeguard: **full-puzzle uniqueness alone does not authorize classic Unique Rectangle rules on a variant**. Their usual swap argument may break a cage, diagonal or thermometer. A plugin must prove that its transformation preserves every relevant rule, or declare the technique classic-only. This is a deduction from the rule-composition contract, not a claim that the cited classic source handles variants. The source's underlying assumption is explicit in [HoDoKu's uniqueness discussion](https://hodoku.sourceforge.net/en/tech_ur.php).

Internal search to discover a valid short proof is distinct from using a guessed solution to finish the board. However, relabeling an arbitrary exhaustive DFS tree as a “forcing technique” does not meet this contract. Each family must define its accepted proof grammar and complexity bounds before activation. If a discovered proof exceeds its limit, record interrupted/over-bound discovery without applying it. Keep general completion search visibly identified.

## 8. Consequences for worker, storage and execution budgets

Keep isolated snapshots, unique request IDs, immediate cancellation, evidence monotonicity and independent count classification from the initial design. Extend identity with operation kind, technique-profile version, scheduler version and complete rule identity. A secondary conditional-analysis result cannot overwrite the unconditional result merely because both share the same givens.

The 729 bound still limits productive candidate-changing steps for an 81×9 monotone human state, but **does not bound proof size or detector work**. Long nets can contain many proof nodes before eliminating one candidate. Therefore the earlier full-trace-per-progress-message recommendation needs revision:

- Send small periodic statistics/phase checkpoints and immutable proof batches with declared sequence ranges and node dependencies.
- Accept a deduction atomically only when all required proof data has arrived and passed checking; retain the previous accepted prefix during partial delivery.
- Bound queued bytes and proof nodes, acknowledge accepted batches and apply worker backpressure; no unbounded message queue.
- Time-slice main-thread proof checks and rendering too, so Cancel remains responsive. Termination discards incomplete incoming proofs while preserving already accepted evidence.
- Never truncate an applied proof silently. If budgets are exceeded before a full checked step exists, return explicit incomplete work or keep the previous proof path.

Starting benchmark candidates, not settled defaults: 4,096 proof nodes per step; 65,536 retained proof nodes per run; 8 MiB total serialized proof data; 64 KiB transport batches; at most two unacknowledged batches. A transport batch can contain partial data for a larger proof but cannot commit partial effects. Definition, graph-construction, detector, verifier, rollout and proof-serialization work all count toward the selected total budget. Initial 10 s and 1–120 s controls remain proposals to remeasure against the expanded corpus; they are not inherited performance guarantees.

No persisted-result schema is introduced by this research revision. Modes/profiles and conditional results can remain in application memory initially, preserving the earlier no-migration proposal. If the user later requests durable technique preferences or saved analyses, explicitly design their versioning and backup behavior. UI text follows current English D053, not the initial M2 document's historical Portuguese examples.

## 9. Trust and experiments

Use the original independent exact-cover oracle for classic truth checks and a separate proof checker for the expanded proof grammar. Neither detector scores nor agreement between two related solvers is proof of correctness. Reference solvers are useful comparison points, but different orders, names and supported assumptions mean their traces need not match ours.

Required validation additions:

1. For every named claimed technique/bound: a satisfiable pre-state, exact premises/effects, negative lookalikes, an original-givens example and an independent force/forbid correctness check. Record fixture provenance and aliases.
2. Proof mutations: deleted alternative, unclosed assumption, incorrect strong/weak link, stale domain fact, missing rule dependency, invalid tuple combination, circular proof, unjustified uniqueness and truncated proof. Each must be rejected.
3. Scheduler comparison against fixed-order and event-driven fixed-priority baselines on identical profiles/corpora and both deterministic work budgets and elapsed-time budgets. Report solved logically, fallback rate, nodes/work, p50/p95 wall time, wasted detector scans, cache hit rate, scheduler cost, peak bytes and proof complexity. No composite average may hide correctness or timeout regressions.
4. Compare optional rollout enabled/disabled, including its discovery and verification cost. Train/calibrate any estimates on one corpus and test on held-out puzzles; include adversarial structures where frequent-technique priors are misleading. Begin without machine learning.
5. Replay the same fixed profile/scheduler version for deterministic completed-path behavior. Timing-dependent incomplete prefixes may differ; accepted deductions must remain valid. No new persistent runtime learning should change Explain silently.
6. Rule-composition contract tests before shipping the classic engine: tiny synthetic domains with sum/order/all-different interactions, permutation of constraint registration order, unsupported-constraint rejection, full-house versus small all-different distinction, proof dependency propagation and exact checking against all active mock rules. These are architecture tests, not variant feature delivery.
7. Real worker tests: cancellation during proof discovery, transmission and verification; out-of-order/missing batches; retained-memory/worker cleanup; secondary-analysis identity; and no writes to personal play state. Every incomplete proof leaves the last accepted board intact.
8. Perfect regressions in both modes: unconditional complete path + independent uniqueness can qualify; search completion, uniqueness-dependent path, unfinished proof or unsupported rules cannot. Finding two distinct valid completions still means at least two; finding one alone still leaves uniqueness unknown.

No speedup is claimed yet. Event scheduling is well supported by primary engineering references, but our exact features/weights, deeper path search and proposed limits are hypotheses for this implementation to test.

## 10. Completed detailed planning and review

The original ten-task plan has been replaced by the [27-task expanded plan](../plans/2026-09-12-m2-classic-solver.md). Its reviewable sequence covers:

1. Normalize the internal constraint problem, capability assembly and snapshot identity; retain the existing classic input adapter.
2. Build proof primitives/checker and shared candidate/fact/index infrastructure; test mock mixed constraints now.
3. Establish independent classic oracle, proof tests and the family/alias/coverage manifest.
4. Implement the elementary/subset kernel with event invalidation and fixed-order reference scheduling.
5. Add short patterns, wings, fish and coloring with exact bounded coverage.
6. Add shared implication/group/ALS structures, then chain/loop/ALS techniques and their named explanations.
7. Add advanced forcing, generalized chain, combination/overlay and specialized-pattern families, each with separate proof/coverage gates. Keep all catalogue rows tracked; do not quietly drop expensive families.
8. Add independent exact evidence and isolated uniqueness-dependent analysis with complete assumption tracking.
9. Add Explain/Analyze scheduling and measure the benefit of bounded deduction-path rollout.
10. Finalize bounded proof transport, worker/controller lifecycle and cancellation during checking.
11. Integrate the English solver screen, profile/coverage display, explanation tree and separate conditional analysis without adding gameplay hints.
12. Differential correctness, mixed-rule contract tests, production worker acceptance and benchmark-driven limits; then record actual release coverage.

The sequence above is a reading summary; the linked plan supplies exact files, interface ownership, dependencies, failing assertions, implementation algorithms, test commands, integration, focused commit boundaries and acceptance gates. The [coverage matrix](2026-09-12-m2-technique-coverage.md) specifies 33 primary and five conditional rows, names/aliases, prerequisites, proof grammars, finite bounds and independently labeled fixture requirements. No fixture or technique is claimed implemented by writing this plan.

The two product choices raised during research remain answered: Explain is the default of two modes, and Perfect excludes uniqueness-dependent paths. No new product question blocks this proposal. Technical choices are now concrete recommendations: singleton filled domains; proof-derived shared capabilities; permanent uniqueness provenance; separate chunk ACK and atomic step acceptance; fixed-work fair scheduling; rollout initially off; configurable proof/work caps; and a proposed 70% human ceiling within the total budget. The ceiling preserves an opportunity for independent classification and reports incomplete logical coverage on expiry. See [contracts §§6–9](2026-09-12-m2-engine-contracts.md#6-scheduling-determinism-and-bounded-lookahead).

Remaining empirical questions are calibrated cost tables, phase share, practical time/proof/heap defaults and whether Analyze rollout helps on held-out cases. The plan defines comparisons and release gates; none is a measured speedup. General non-Junior Exocet and other unbounded/generalized extensions are explicitly outside the finite matrix, while every requested family retains a planned bounded form. Review the completed design and plan before authorizing implementation; do not reopen the completed first-release interview.
