# M2.6 implementation progress

Branch `feat/m26-hardening`, worktree `.claude/worktrees/gifted-feistel-d36469`, from 2026-10-16. Spec: [M2.6 engine hardening](../specs/2026-09-22-m26-engine-hardening.md), approved under D103. One reviewed commit per task, each followed by an independent review (`fix(solver): <task> review`). Every timing names its power state: the laptop (Intel Core i5-1345U, Windows 11, Node v24.19.0) runs about 2.7x slower on battery.

| Task | Commit | Acceptance evidence | Review |
| --- | --- | --- | --- |
| T01 evaluation corpus, reference DFS, baseline | `c51de80` | `exact-reference.test.ts`: engine = reference on 131 cases; baseline in [m26-baseline](m26-baseline.md) (battery) | `2883163` (assembly zero, full regeneration check, Node version, README scope); merged to `master` at `ffbd872` |
| T02 exact propagation (`original-dfs@2`) | `5b0ee1b` | see below; `npm test` 83 files, 2,010 passed, 6 skipped, 0 failed (2,379 s, mains then battery); typecheck clean | `fix(solver): T02 review`: no soundness defect (reviewer's 600-problem 4x4/6x6 variant differential matched the oracle); units now count only what §4.1 lists, reservation bounded by full-house pairs, per-node unit bound asserted, 6x6 in the property test |
| T03 count-first pipeline | `69040ae` | see below; `npm test` 84 files, 2,013 passed, 7 skipped, 0 failed (2,229 s, mains); typecheck clean | `fix(solver): T03 review`: logical cut made clock-independent when the precount is inconclusive, witnesses of an inconclusive precount re-checked against the logical path, step work counts logical work only, mid-search carry test |
| T04 trace-preserving cost reductions | `8612a7a` | see below; `npm test` 85 files, 2,018 passed, 7 skipped, 0 failed (1,193 s, mains); typecheck clean | `fix(solver): T04 review`: relation-board lease leak fixed (separate table lease), parent released on fallback, owed-debt and error-preserving pay fixes, plainEqual validity, trace claim restated as identical for complete runs and a prefix under a binding budget; suite rerun 85 files, 2,018 passed |
| T05 explain-fair@3 / analyze-fair@3 | `5e2c8ad` | see below; `npm test` 145 suites, 2,030 passed, 10 skipped, 0 failed (2,301 s, battery; an earlier slow run had 2 wall-clock flakes, among them forcing.test, which passes alone) | `fix(solver): T05 review`: reopen capped jobs only (an interrupted job no longer spins), Analyze @3 window closes only once a candidate is buffered (technique steps, not only rule maintenance), tests made independent of the ledger helpers; decisions recorded as accepted |

## T02

Exact search: bulk naked and hidden singles, locked candidates over every pair of full all-different houses that share two or more cells, module prune hooks in the same loop, child frames inherit the parent's fixed-point masks, one work event per node, the `seen` set dropped, `EXACT_METHOD = "original-dfs@2"`.

- T01 green with `norvig-hard1` included (no heavy case left): 133 tests, about 10 s, mains.
- `norvig-hard1` 2.95 s on mains, 7.1–7.5 s on battery (target < 5 s, met on mains), every other case < 20 ms (< 1 s), Escargot 14–16 ms; mains, two passes ([m26-baseline](m26-baseline.md) T02 row).
- `exact-variants.test.ts` green, plus a new property test: the exact fixed point never removes a value used by a known solution, on 40 generated mixed problems and the unique corpus grids; a deliberately unsound locked-candidate rule fails it.
- `exact.test.ts`: the accounting test is re-pinned (one work event per node; the empty root counts 82 units = 1 + 81 masks; every node at most 1 + 81 + 81 + 27) because `@2` reports a node's operations in one event instead of one unit per cell scan.
- **Accepted (user decision, option A):** the node gate reads "node counts ≤ baseline on every exhaustive case (count 0 or 1), and total nodes ≤ baseline", with the spec's plain MRV and lowest-index ties. Met: all 48 exhaustive cases at or below baseline (689 against 991 nodes) and 1,443 against 1,749 nodes in total without `hard1`. Evidence for the reading: the strict "every case" form fails on five multi-solution grids by 1–3 nodes (random-14, -23, -33, -41, -53), whose node count is the path length to the second witness, and none of four tie-break rules meets it (lowest index 5 misses, most unassigned peers 25, fewest 28, MRV on peer-only masks 1), while the tie-break alone moves `hard1` between 49 and 248,085 nodes.

## T03

Count first (spec §4.3): `runSolver` drives one exact search with up to 30 % of the work and 30 % of the time (`PRECOUNT_SHARE`), publishes a `precount` event, ends before the logical phase on zero or multiple, reuses a conclusive count (checked against the accepted logical path, never recomputed), and otherwise suspends the same generator and resumes it after the logical phase with the remaining budget. The logical phase gets the remaining work as its deterministic cut and the remaining time as a safety stop; `humanSteps` now reports `work-limit` and `time-limit` instead of folding both into `logical-budget`, and `runSolver` reports its own deadline stop as `time-limit`. `classic-run` drops its separate 10 % precount (`countClassic`, the correctness marks, now uses the same 30 % share). Exact work is published, and the clock read, once per 256 exact events (one work event per node).

Exact speed, needed for the 15 s check on this laptop's slower states: propagation is now incremental (a naked-single queue; only houses and locked pairs touched by a mask change are re-examined; module hooks rerun only after a change). Same fixed point, so node counts are identical on all 131 cases; `hard1` 2.1–2.8 s against 5.6–7.2 s for the T02 code, measured alternately in one process on mains.

- `count-first.test.ts`, mains: `hard1` at the 15 s preset reports `multiple`; every corpus case starts `exactSteps` exactly once (spy) and reports its label's count; an inconclusive precount (share below the reservation) is resumed after the logical phase, not restarted, and ends `multiple`.
- Determinism (`M26_DETERMINISM=1`, 851 s, mains): three runs of every corpus case at 60 s gave identical results and step sequences on all 131 (7 solved, 3 incomplete at 27–28 steps, 83 multiple and 38 zero at the precount).

Review fixes and recorded choices (T03):

- When the precount is inconclusive (its 30 % time cap usually binds first: about 0.5M exact units per second against an 18M work share at the defaults), the work it used depends on the clock. The logical phase is therefore cut at `workUnits` minus the whole precount share, not at a clock-dependent remainder, and the resumed search gets the unspent share plus whatever the logical phase leaves. Read literally, §4.3 gives the resume only the leftovers; the unspent share is the floor chosen here.
- After the logical phase the count is always merged against the accepted path, so a witness carried by an inconclusive precount is checked even when the resumed search gets no time.
- While a precount is suspended its exact workspace reservation (about 8 MB of 64 MB on 9x9) stays held through the logical phase. Exact setup failures (reservation, unsupported rule) now end the run before the logical phase.
- `hard1` at the 15 s preset depends on wall time: it passes when the precount finishes inside 4.5 s (2.1–2.8 s on mains here).

## T04

Trace-preserving cost reductions (spec §4.2). Baseline on the easy puzzle before T04: 14.3 s, 78 steps, 93k units and about 183 ms per step (mains).

What "trace-preserving" means here (recorded after the T04 review): job-level accounting is unchanged (the units each job is charged, quanta, `job.work`, the analyze window, the order of checks), so the sequence of accepted steps under a policy id is unchanged **whenever the work budget does not cut the run**. Source-index preparation now charges fewer units to the budget (one per cell pair and per visited equal symbol instead of every symbol pair, nothing for shared tables), which is what brings a basic step from 87k to about 7.5k units, the T04 target. Under a binding work budget a run therefore gets further: the old trace is a strict prefix of the new one, never a different sequence. D094's "same policy id, same trace" holds for complete runs and for the golden traces; for budget-cut runs it holds as a prefix. The spec asks for both "trace-preserving" and fewer units per step; this reading is the only one that satisfies both.

Changes:

- `SourceIndex.advance(parent, view)`: facts are append-only between an accepted parent and its successor, so the successor shares the parent's frozen tables, takes over its lease, adds only the new facts, and copies only the lists they touch. Relation facts (domain-dependent conflicts) rebuild the conflict map in publication order; any view that does not extend the parent falls back to a cold `prepare`. `StepSelection.advance()` keeps the index as the parent instead of disposing it.
- Cold incidence: one work event per cell pair instead of per unit, and an all-different pair visits only its equal symbols (the only ones that conflict).
- The checker re-measured every retained node with a full bounded copy per proposal; byte counts of frozen records are now cached (`boundedBytes`), copies stay fresh.
- `#pump` drains consecutive events of one cursor while the quantum loop would keep pumping it, and pays debt in one event; the checker reports the retained-node bookkeeping of a drain as one event (`batchUnits`) when every per-unit tick would pass. Charges, quanta and job work are unchanged.
- Clock reads once per quantum (selection) or per 64 ticks (checker); logical work published once per 256 units in `runSolver`.
- `humanSteps` skips the full witness check while a cell is open; the checker derives placement peers from a per-capability table; `sameValue` compares ordinary JSON structurally and caches canonical texts of frozen values; `AllDifferentRule.propagate` finds value facts through the source index.

Not done: keeping discovery cursors of untouched jobs across `advance()`. A retained cursor would skip proposals a restarted discovery yields again, so it is not trace-preserving under `@1`/`@2`; the targets were met without it.

Evidence:

- Golden traces byte-identical (`golden-traces.test.ts`, 6 tests).
- T04 review (independent): a relation-board lease leak (each conflict rebuild re-grew the inherited lease, so kropki boards stopped on the 100k-entry workspace cap after about 7 steps instead of about 36) was fixed by giving the conflict tables their own lease; an unextended parent is now released on the fallback and stopped-scan paths; `#owedBeforeLast` is set before anything in `#pump` can throw and a debt paid on a throw no longer checkpoints; `plainEqual` returns `false` only for fully valid JSON. The differential test now also compares the workspace usage of the incremental index with a cold one and requires variant trajectories longer than 20 states in the production workspace (a reintroduced leak fails it at 8).
- Variant trace comparison against `bad2593` (after the review fixes; 4 cases per family from the M2.5 bench corpus: arrow, classic, killer, kropki, mixed, thermometer; explain-fair@1, 8M units, fake clock): no mismatch on 24 cases, 4 identical, 20 where the old run is a strict prefix (for example kropki-103 now solves in 189 steps; the parent stopped at 79).
- Whole-corpus trace comparison against `bad2593` (temporary worktree, scratch dump outside the repository, fake clock): all 131 cases under `explain-fair@1` and `explain-fair@2`, at 40M work units, identical step sequences (technique, effects, cells) and results on 262 of 262; at 4M units 248 identical and 14 where the old run is a strict prefix (fewer units per step reach further).
- `logical-cost.test.ts`: incremental index equals a cold rebuild on more than 300 accepted states (6 classic grids and 4 kropki/mixed grids with relation facts, both index levels), with lease handover and fallback. Basic steps on the easy puzzle average 7.1–7.5k units (deterministic, always asserted; baseline 87k).
- Wall time (`M26_TIMING=1`, median of 3 after a warm-up, mains). This laptop runs in two states the session cannot control; the exact precount of the same easy grid is the calibrator (about 22 ms in the fast state, 50–130 ms in the slow one):
  - fast state: easy 0.35–0.47 s end to end (target < 1 s), basic steps 4.5–7 ms (< 10 ms), 17-clue 0.39–0.42 s (< 3 s): **met**;
  - slow state: easy 1.2–1.3 s, basic steps 15–17 ms, 17-clue 1.3–1.5 s: easy and basic step **missed**, 17-clue met.
  The time targets are therefore met only in the fast state; they are re-measured for the final report. The assertions run only with `M26_TIMING=1` so the deterministic suite does not depend on machine load.

## T05

`explain-fair@3` / `analyze-fair@3` (spec §4.4), now the `classic-run` defaults for Explain and Analyze (`@1`/`@2` stay selectable; the golden-trace test pins `@1`).

- Tier cap (`tierCap` in the canonical options of `explain-fair@3` only): from tier 3, a job that spends its cap on one state without a step becomes `capped` (`tier-work-cap`) and its cursor is closed, which frees its workspace. A job holding a checked step is not capped. Explain climbs when every lower job is exhausted, excluded, or (from tier 3) capped or interrupted on its own allowance (`simplerSettled`). Steps taken past a capped simpler job are `budgetLimited`, and `canClaimSimplerExhausted` stays the strict `simplerExhausted`.
- Reopening: a new state reopens everything (`invalidate` keeps only exhausted/excluded rows; `stateWork` and `capRounds` reset). On one state, when every job is settled and no step was found, the capped jobs from tier 3 up restart with twice their previous cap (iterative deepening, since a capped cursor was closed). Interrupted jobs are not reopened: an interruption (workspace or proof-size limit) recurs identically (T05 review). The spec's "every 4th rotation ticket" reopening is read as this settled-tier rule; a periodic reopen of a lower tier while upper tiers still run would hand most of the time back to the capped jobs.
- One alias per single (`revision3` in the discovery context): `NakedSingles` proposes Full House, else Last Digit, else Naked Single.
- Analyze window: `max(4096, 2 × units served to the original rules in this selection)`, read live, so a rule pass is never cut.
- Added for the targets, behind `@3` only: the basic fish (C06) enumerates only admissible cover sets (the supersets of the crossing lines of its base supports; the same candidates as a set, in a different order; 12k units instead of 944k on Inkala 2012), and interrupted jobs from tier 3 up count as settled whatever the interruption (workspace, proof size, own allowance); steps past them are budget-limited.
- Analyze window under `@3`: closes only once a candidate is buffered, then at `max(4096, 2 × the selection's rule pass)` (T05 review: with rules quiet a 4096-unit window could not complete one checked single).
- Cap value: the spec's provisional 2,000,000 units cannot reach tier 5 within 15 s here (tier-3/4 search costs about 5.5 µs per unit on mains; ten tier-3/4 jobs). Measured at 15 s, mains: with 50k–200k all three grids serve tier-5/6 jobs, and Golden Nugget's first tier-5 step (c31) comes at 3.7–7.1 s. The default is set to **100,000**, provisional until T08. **Accepted by the user (option A).**

Evidence:

- `policies-v3.test.ts`: under a 5k cap, every step taken past a capped simpler job has `canClaimSimplerExhausted` false and `budgetLimited` true, and `canClaimSimplerExhausted` holds exactly when every simpler job is exhausted or excluded (checked from the job statuses; Escargot, Golden Nugget, Inkala); `analyze-fair@3` yields at least one step on all 10 unique corpus cases and a technique step (not only rule maintenance) on every case singles solve; an interrupted job is opened once, and a capped job is reopened with a doubled cap until the work limit (review regressions); two runs give identical steps and results under each of the eight policies; with `M26_TIMING=1` all three grids serve a tier ≥ 5 job within 15 s (mains).
- `golden-traces.test.ts`: `@1` traces byte-identical; the `@3` tiers 0–2 prefix equals `@1` on both golden fixtures.
- "Reach tier ≥ 5 within 15 s": met on Escargot, Inkala 2012 and Golden Nugget.
- **"≥ 1 tier-5/6 step each": met on Golden Nugget only; the Escargot and Inkala misses are a user-accepted known limit of the current chain/forcing detectors (c22–c28), out of M2.6 scope under spec §7 (option A).** Evidence: Escargot finds one tier-4 fish (c07) and Inkala nothing above tier 0, also with the whole default 60M-unit budget (re-measured after the review fixes: the work cut ends the runs at 243 s and 319 s, mains); the chain and forcing detectors each spend 1.5M+ units without a step, and c22/c28 hit the workspace byte limit. Detector performance on tiers 5–6 is a candidate follow-up milestone.

