# M2.6 Engine hardening — fast exact count, bounded Explain tiers, honest results

Status: **approved under D103, 2026-10-16**. Produced from the solver evaluation of 2026-09-21 and a Socratic session the same day. Sequenced **after** M2.5, which merged into `master` at `c3ced37` on 2026-10-16; no code exists for it yet.

Related: [M2.5 engine design](2026-09-17-engine-design.md), [M2.5 plan](../plans/2026-09-18-m25-engine.md), [M2.5 verification](../history/m25-verification.md), [engine architecture](../solver/architecture.md), [decisions](../decisions.md) D042, D049, D052, D055, D057, D063, D094, D099, D100, D101, D102, D103.

## 1. Objective

Make the shipped solver answer three questions reliably within the user's time limit, on any 9×9 classic (and, by construction, on the M2.5 variant problems):

1. **How many solutions?** — verified 0 / 1 / ≥ 2 for every 9×9 in the corpus in under a second, including grids that are pathological for search.
2. **Which logical steps?** — Explain reaches the tier a puzzle needs instead of stalling inside tier 4, and its result is the same on every run of the same input (deterministic by work, not by wall clock).
3. **Why did it stop?** — the Solve screen states the stop reason and which techniques were exhausted, cut by budget, or never started.

No new techniques, no new variants. Proof checking, count independence (D049 as restated in §4.3) and Perfect semantics (D056) do not change.

## 2. Findings that shape this milestone (2026-09-21 evaluation)

Measured on `feat/merged-selection-outline` = `master` + UI work, Node 24, single process, no other load unless noted. Probe scripts and raw outputs are kept outside the repo (session scratchpad `solver-audit/`); §7 turns them into repository tests.

| Finding | Evidence | Where |
| --- | --- | --- |
| The exact count is **correct** on everything tried: 123 random/poisoned grids + Escargot, Inkala 2012, Golden Nugget, 17-clue, empty grid; 0 disagreements with an independent bitmask DFS; median 13 ms. | `solver-diff.json` | `exact.ts` |
| The exact count is **slow on pathological grids**: Norvig `hard1` (17 clues, ≥ 2 solutions) took 367 s / 658k nodes ≈ 0.55 ms per node. Cause: one `yield` per cell per propagation pass, one naked single applied per full rescan, no locked-candidates pruning, a `Set` of seen witnesses. | `solver-diff.json`, `exact.ts:214-247` | `ExactSearchSession.propagate` |
| With the 60 s default that grid shows **"Inconclusive"** in the app: precount gets 10 % (6 s) → inconclusive → logical phase burns 42 s → final exact phase runs out → `count: "unknown"`. Reproduced in the browser (65.4 s, "Time limit reached"). | browser session | `classic-run.ts:88`, `run.ts:80` |
| The precount result is **discarded**: `solveClassic` never passes `priorCount`, so the exact search runs twice per solve. | `classic-run.ts:243` | |
| A **basic elimination step costs 70–90 ms and ≈ 87k work units**; a singles-only puzzle takes 5.5 s (78 steps). Profile: `checkedEffectState` 14 %, `performance.now()` 13.5 % (called in every `#charge`), `runSolver` 9.5 % (one `await` per work event), `SourceIndex` rebuild 11 %, canonical JSON 6 %. After every accepted step the scheduler discards every cursor and the source index. | `solver-audit-profile.json`, `select.ts:503`, `run.ts:80` | |
| `AllDifferentRule.propagate` scans **all retained facts** for every (source, cell) pair of every house, per pass. | `rules/all-different.ts:107` | |
| `NakedSingles` emits **1 + 2 × houses** proposals per cell (Naked Single, Full House, Last Digit), each fully checked. | `techniques/singles.ts:20` | |
| **Explain stalls inside tier 4.** 5-minute probe on AI Escargot: 26 basic + 1 hidden single in 2.5 s, one finned fish at 14 s, then 286 s with no step. `c08` Franken/Mutant fish consumed 61 M units without exhausting; `c09`, `c12`, `c17` 5.5 M each; the 14 tier-5/6 jobs (chains, forcing, ALS, uniqueness) stayed `pending`. Explain only climbs when every lower-tier job is `exhausted`/`excluded`. | `solver-ledger.json`, `select.ts:357`, `policy.ts:19` | |
| Results depend on **machine load**: the same easy puzzle solved in 5.5 s in one run and stopped `incomplete` after 17 singles at 44 s in an earlier run, because the logical phase is cut at 70 % of wall-clock time. | `solver-audit-results.json` vs `solver-eval.json` | `run.ts:53` |
| **Engine Analyze mode returns 0 steps** in 0.3–1.6 s: its 4,096-unit selection window is smaller than one rule pass (≈ 87k units). Disabled in the UI (D063), but broken rather than merely uncalibrated. | `solver-audit-results.json` | `select.ts:369` |
| The Solve screen maps `count: "unknown"` → "Inconclusive" and `human: "incomplete"` → "stopped at its limit" without the reason; `outcome`, the `logical-stop` reason and the ledger are dropped before the `result` event. Direct clue conflicts disable Solve, so "No solution" never shows for them. | `ui/solver-copy.ts`, `classic-run.ts:275` | |
| M2.5 (`feat/m25-engine`, 25 commits, T01–T14 done) already edits `exact.ts`, `select.ts`, `policy.ts`, `ledger.ts`, `all-different.ts`, `classic-run.ts`, and T10 pins **golden Explain traces** under `explain-fair@1`. | worktree `.claude/worktrees/m25-engine` | |

Reference behaviour in open-source solvers (HoDoKu, Sudoku Explainer, tdoku, SudokuWiki, sudoku-core): validity/uniqueness is a separate exact pass run **before** the logic and never repeated; the cheapest technique that produces a change wins and the loop restarts from the easiest; no solver requires a tier to be *exhausted* before trying the next one; candidate/position sets and expensive structures are cached with a dirty flag per state change; fast exact solvers propagate singles + locked candidates before every branch.

## 3. Decisions taken (Socratic session, 2026-09-21)

| # | Decision | Why | Alternatives rejected |
| --- | --- | --- | --- |
| 3.1 | **Sequence:** M2.6 starts from `master` after M2.5 T17 merges. | Same files; D100 stays intact; M2.5's ablation is in work units and stays valid. | Parallel trace-preserving branch (rebase cost); extending M2.5 (scope creep on D100). |
| 3.2 | **Explain tier rule:** each job of tier ≥ 3 has a per-state work cap; when every remaining job of the current tier is exhausted, excluded **or capped**, Explain moves to the next tier and marks the resulting steps `budgetLimited: true`. Lower tiers 0–2 keep strict exhaustion. | Preserves D055 (simpler proofs first). Revises D063's "completes lower tiers before claiming exhaustion" into "claims exhaustion only when proved; otherwise says so". | Strict rule + faster detectors (fish search space is combinatorial by nature); time-based fallback to Analyze ordering (clock-dependent traces). |
| 3.3 | **Exact engine:** same resumable MRV DFS with **bulk naked + hidden singles and locked candidates per node**, one work event per node, prune hooks (T06) kept. | One engine for classic and variants; D049 only reworded ("singles propagation" → "singles and locked-candidates propagation plus module forward checking"). | DLX / exact cover in production: the test oracle is already Algorithm X (D052 independence lost) and exact cover cannot express sums/orders (M2.5 spec §2), so it would be a second production engine, which D049 excludes. The user initially chose DLX and reverted after this confrontation. |
| 3.4 | **Budget order:** exact count runs **first** with up to 30 % of the budget; a conclusive result becomes `priorCount` and is never recomputed. The logical phase gets the remainder and is cut by **work units** (deterministic); wall-clock is a safety stop only. A final exact phase runs only when the precount was inconclusive. | Determinism (D094 spirit), no double search, matches every reference solver. D049's "after the human pass" is restated (§4.3). | Keep 10/70/rest and only pass `priorCount` (still clock-cut); exact until done (violates D042). |
| 3.5 | **Traces:** new policy ids `explain-fair@3` / `analyze-fair@3` carry the behavioural changes (tier cap, one alias per single). `@1`/`@2` keep their golden traces byte-identical (D094). New golden traces are recorded for `@3` and reviewed once. | D094: same policy id ⇒ same trace. | Byte-identical under `@1` with dual code paths; changing traces without a new id. |
| 3.6 | **Front:** the result carries `stopReason` and a ledger summary (exhausted / capped / not started per technique); Analyze shows count verification with its time and the logical stop with tier and untried techniques; direct clue conflicts run and report "No solution". | The user's core complaint was not knowing what happened. | Text-only fix; engine-only milestone. |
| 3.7 | **Acceptance targets (aggressive):** see §6. | D063/D042 require measured limits. | Moderate targets; "better than baseline". |

## 4. Design

### 4.1 Exact phase (`exact.ts`)

- **Propagation per node.** Compute all masks once; apply every naked single and every hidden single found in the pass; then locked candidates (pointing/claiming between each box and its rows/columns) for classic-shaped covers; repeat until a fixed point or a contradiction. Module `prune` hooks (T06) run in the same loop, after singles, as today.
- **Granularity.** One `work` event per node with `units` = counted primitive operations of that node (masks computed + assignments + prune calls), not per cell. Work units remain the accounting currency of D042/D063; the reservation event stays.
- **Data.** Keep the explicit frontier and `Frame` copies (resumability, D049), drop the `seen` set (identical witnesses cannot arise from disjoint branches of a DFS over a fixed value order), keep two-witness cap semantics (`cap-reached`).
- **Value order.** MRV cell choice stays; value order stays ascending (determinism). No random restarts.
- **Contract.** `ExactStats` unchanged; `EXACT_METHOD` bumps to `original-dfs@2` (evidence ids embed it, D094).
- **Not done.** No DLX, no bitboard rewrite, no SIMD; the target in §6 is reachable with the above (reference bitmask DFS took 5.3 M nodes in seconds on `hard1`; the engine needs fewer nodes with locked candidates).

### 4.2 Logical phase cost (`select.ts`, `source-index.ts`, `rules/all-different.ts`, `singles.ts`, `run.ts`)

Trace-preserving under every policy id:

- `SourceIndex` becomes **incremental**: `advance()` applies the accepted `ChangeSet` (new facts, superseded facts) instead of `dispose()` + `prepare()`; a cold rebuild remains available and is differential-tested against the incremental one (D061 already requires cold-rebuild tests).
- Cursors of jobs whose `dependencies` are untouched by the change set are **kept** across `advance()` instead of cleared; the ledger already computes invalidation, the selection just does not use it.
- `#charge` reads the clock **once per quantum** (`QUANTUM = 256`), not per unit; `runSolver` awaits `publish`/`yieldTask` once per quantum.
- `AllDifferentRule.propagate` looks up the value fact through the view's literal index (`matchingFacts`) instead of scanning `view.facts`.
- `checkedEffectState` derives peers from a per-assembly peer table computed once, not from `allDifferent.filter(...)` per effect.

Behavioural, behind `@3` only:

- `NakedSingles` emits **one** proposal per cell with the most specific alias (Full House > Last Digit > Naked Single); `@1`/`@2` keep the three.

### 4.3 Phase order and budgets (`classic-run.ts`, `run.ts`, `evidence.ts`)

- Order: assemble → **exact count (≤ 30 % work, ≤ 30 % time)** → logical phase (remaining work; time as safety) → exact phase **only if** the count is still `unknown` (remaining budget).
- `priorCount` is passed from the precount; `mergeEvidence` already accepts it. A `unique` precount also supplies the `precount` solution event as today.
- Logical phase stop conditions, in order: solved / profile stall / **work limit** (`phaseWorkUnits`, deterministic) / time safety stop (`reason: "time-limit"`, reported distinctly). Default `workUnits` and the 30/70 split are re-derived from the §6 benchmarks and recorded (D063's "await production benchmarks").
- D049 restatement (for D103): "resumable MRV depth-first exact enumeration with singles and locked-candidates propagation plus module forward checking, from the original givens, run before the human pass and reused by it; the human pass never feeds the count."

### 4.4 Explain tier cap (`policy.ts`, `ledger.ts`, `select.ts`)

- New ledger status `capped` with `reason: "tier-work-cap"`; per-job `stateWork` reset on `advance()`.
- Policy parameter `tierCap: { fromTier: 3, unitsPerJobPerState: N }` (N from benchmarks; provisional 2,000,000) on `explain-fair@3`. `simplerExhausted(tier)` gains a sibling `simplerSettled(tier)` = every lower job exhausted, excluded or capped; Explain under `@3` uses `settled` for tiers ≥ `fromTier` and strict `exhausted` below.
- A capped job is **reopened** on the next `advance()` (its state changed) and on every 4th rotation ticket if the tier above also settles without a step, so a capped detector still gets served before the phase stalls.
- `checked-step.canClaimSimplerExhausted` stays truthful (false when any lower job is capped); `budgetLimited` is true for such steps and surfaces in the UI as "a simpler step may exist".
- Analyze mode: the 4,096-unit selection window is replaced by a window of `max(4096, 2 × cost of one rule pass)` measured at `prepare`, so Analyze produces steps again; `@3` only.

### 4.5 Result contract and UI (`classic-run.ts`, `solver.worker.ts`, `ui/solver.ts`, `ui/solver-copy.ts`)

- `ClassicSolveEvent.result` gains: `stopReason: "solved" | "profile-stall" | "work-limit" | "time-limit" | "tier-cap" | "contradiction" | "not-started"`, `countVerifiedMs?: number`, `coverage: { exhausted: string[]; capped: string[]; notStarted: string[]; highestTierTried: number }` (technique display names, ≤ 60 entries), and `budgetLimitedSteps: number`.
- Analyze panel: headline unchanged; detail lines become "Count: verified in 0.3 s" / "Count: not verified (time limit)"; "Logic: solved" / "stalled at tier 4 (work cap); 14 techniques not tried" / "stopped by time limit". Technique list shows ×count and a "capped" badge.
- Explain panel: steps with `budgetLimited` get a small "simpler step may exist" note.
- Solve with direct conflicts: the button stays enabled; the engine's assembly/duplicate check returns `zero` and the UI shows "No solution" with the conflicting cells highlighted (already computed by `clueSummary`).
- Settings copy for the time limit states that the limit is a safety stop and the result is otherwise deterministic.

## 5. Tasks

One reviewed commit per task, blocks reviewed as in M2.5. Every task's acceptance runs in isolation (memory note: the suite takes 25–35 min; probes are background shards).

| Task | Deliverable | Acceptance |
| --- | --- | --- |
| T01 | **Evaluation corpus and reference solver in-repo**: `tests/solver/bench/eval-corpus.json` (easy, hidden-singles, 17-clue, Escargot, Inkala 2012, Golden Nugget, anti-brute-force, Norvig `hard1`, empty, 17-minus-one, poisoned Escargot, 120 seeded random/poisoned grids), `tests/solver/reference-dfs.ts` (bitmask DFS, imports nothing from `src/solver`), `tests/unit/solver/exact-reference.test.ts`. | Engine count = reference count and solution on every case; the test records nodes and ms per case to `docs/history/m26-baseline.md` **before** any engine change (baseline row). |
| T02 | **Exact propagation** (§4.1): bulk singles, locked candidates, per-node work events, `original-dfs@2`. | T01 green; `hard1` < 5 s and every other corpus case < 1 s in vitest; T06 exact-variants tests green (prune hooks); node counts ≤ baseline on every case; `exact.test.ts` stats fixtures re-pinned with justification. |
| T03 | **Count-first pipeline** (§4.3): 30 % precount, `priorCount`, final exact only when unknown, work-unit cut for the logical phase, distinct `time-limit` safety stop. | Norvig `hard1` at the 15 s UI limit reports `multiple`; three consecutive runs of every corpus case at 60 s produce identical `result` (minus timings); no case runs the exact search twice (spy on `exactSteps`). |
| T04 | **Trace-preserving cost reductions** (§4.2): incremental `SourceIndex`, retained cursors, clock/await per quantum, fact lookup in `propagate`, peer table in the checker. | Golden traces `@1`/`@2` byte-identical; cold-rebuild vs incremental differential on 300 generated states; easy puzzle < 1 s, 17-clue < 3 s; mean basic step < 10 ms and < 10k units on the easy puzzle. |
| T05 | **`explain-fair@3` / `analyze-fair@3`** (§4.4): tier cap, `capped` status, reopen rules, one alias per single, Analyze window fix. | Escargot, Inkala, Golden Nugget reach tier ≥ 5 within 15 s and produce at least one tier-5/6 step each; tiers 0–2 traces identical to `@1` on the golden fixtures; `canClaimSimplerExhausted` false whenever a lower job is capped (property test); engine Analyze yields ≥ 1 step on every unique corpus case; determinism test for all eight policies. |
| T06 | **Result contract** (§4.5 engine side): `stopReason`, `coverage`, `countVerifiedMs`, `budgetLimitedSteps`; worker passthrough; protocol tests. | Every corpus run has a `stopReason` consistent with the human/count status (table-driven test); `coverage` lists exactly the ledger's rows; structured-clone round-trip. |
| T07 | **Solve screen** (§4.5 UI side): copy, Analyze detail lines, capped badge, budget-limited note, conflicts run to "No solution". | Playwright: Norvig `hard1` at 15 s shows "Multiple solutions"; Escargot at 15 s shows "Unique solution, verified in < 1 s" and "stalled at tier N"; a grid with two 5s in a row shows "No solution"; existing solver-screen specs updated, not removed. |
| T08 | **Default limits** re-derived (D063): `CLASSIC_SOLVE_LIMITS.workUnits`, precount share, `tierCap.unitsPerJobPerState`, UI presets, from the §6 benchmark on the Playwright matrix. | `docs/history/m26-benchmark.md` with the numbers per browser; defaults chosen so the 15 s preset meets §6 on the slowest browser measured. |
| T09 | **Golden traces for `@3`** and ablation refresh: record `@3` traces on the T10 fixtures; rerun M2.5's `bench/ablate.ts` with `@3` as a policy set. | Traces reviewed once and committed; ablation report appended to `docs/history/m25-ablation.md` with `@3` rows; D101's default decision revisited only if `@3` changes its conclusion. |
| T10 | **Docs**: `docs/solver/architecture.md` (exact propagation, phase order, tier cap, result contract), `docs/decisions.md` D103 outcome, roadmap row, this spec's status line. | Docs describe only what T01–T09 verified. |
| T11 | **Whole-suite acceptance and merge**: `npm test`, `typecheck`, `lint` sequentially; `docs/history/m26-verification.md`; merge `feat/m26-hardening` into `master`. | Zero failures except documented, pre-existing ones; the D097 timeouts re-run in isolation. |

Ordering: T01 → T02 → T03 → T04 → T05 → T06 → T07 → T08 → T09 → T10 → T11. T04 can run in parallel with T02/T03 (different files) once T01 exists.

## 6. Acceptance targets (aggressive, chosen 2026-09-21)

Measured in vitest in isolation on the development machine and confirmed on the Playwright benchmark matrix (D063) with T08's defaults.

| Metric | Target |
| --- | --- |
| Exact count, every corpus case | < 1 s; Norvig `hard1` < 5 s; Escargot < 50 ms |
| Exact vs reference DFS and vs Algorithm X oracle | 0 disagreements on the corpus and 120 seeded grids |
| Easy (singles-only) puzzle, Explain | < 1 s end to end |
| 17-clue singles puzzle, Explain | < 3 s |
| Escargot, Inkala 2012, Golden Nugget, Explain at the 15 s preset | reach tier ≥ 5 and record ≥ 1 tier-5/6 step each |
| Engine Analyze mode | ≥ 1 step on every unique corpus case |
| Determinism | identical `result` (minus timings) on 3 consecutive runs of every case at 60 s |
| UI | `hard1` shows "Multiple solutions" at 15 s; every result shows a stop reason and coverage |

## 7. Risks and open items

- **Locked candidates in the exact phase** touch D049's wording; the property test "prune never removes a value present in any oracle solution" (M2.5 T06) is extended to the new propagation.
- **Tier cap value** is provisional until T08; too low reintroduces "only singles", too high reproduces today's stall. T05's acceptance uses the provisional value and T08 may retune it with a version bump of the parameter set (D094).
- **Incremental `SourceIndex`** is the riskiest trace-preserving change; the cold-rebuild differential is the gate, and the cold path stays as fallback.
- **M2.5 review state**: resolved. Block 5 (T11–T15) and the closing block were reviewed and M2.5 merged after the whole-suite gate ([verification](../history/m25-verification.md)); decision 3.1 is satisfied. D102 (checker bounds sized by the problem) landed in M2.5 and leaves rule propagation cost on kropki/mixed boards (≈ 250k units per step) to §4.2.
- Out of scope: new techniques, DLX, bitboards, custom geometry, hint UI (M6), the conditional profile's own budgets.

## 8. Entries to apply on approval

**D103 — Approve M2.6 engine hardening** (applied): "Confirmed user instruction, 2026-10-16. Source: evaluation of 2026-09-21 and Socratic session. Decision: implement M2.6 after M2.5 T17 as `feat/m26-hardening`, one reviewed commit per task (§5). Exact phase keeps the D049 DFS with singles, locked-candidates and module forward checking, method `original-dfs@2`, run before the human pass and reused (D049 restated §4.3). Explain under `explain-fair@3` claims tier exhaustion only when proved and otherwise climbs with `budgetLimited` steps (D063 revised; D055 preserved). The logical phase is cut by work units; time is a safety stop (D042). Results expose stop reason and technique coverage. `@1`/`@2` traces unchanged (D094). Targets §6 are the exit gate."

**Roadmap row** (insert after M2.5): "M2.6 | Engine hardening: fast exact count (singles + locked candidates, count-first, reused), bounded Explain tiers under `explain-fair@3`, deterministic work-unit budgets, stop reason and technique coverage in the Solve screen. | §6 targets met in vitest and on the benchmark matrix; 0 count disagreements vs two oracles; `@1`/`@2` golden traces unchanged; `@3` traces reviewed. | This spec under D103."
