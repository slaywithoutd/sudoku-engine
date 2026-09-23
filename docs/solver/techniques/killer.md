# Killer families (M2.5)

Reasoning that exists only because a problem declares `cage@1` rules. Both families are ordinary named techniques: discovery proposes, the closed grammar in `web/src/solver/techniques/variant-grammar.ts` reconstructs the computation, and the table/linear primitives check every node again.

## K01 Killer combinations (`k01@1`, profile `k01-profile@1`)

A cage is a `sum` fact whose cells equal an `all-different` fact of the same rule. K01 lists every tuple of the cage's current domains that is distinct and reaches the total, then removes each candidate no tuple supports — "a 3-cell cage totalling 7 is {1,2,4}".

- **Profile:** 2–5 unsolved cells and an input box (product of the current domain sizes) of at most 16,384 Cartesian tuples. Both numbers are versioned parameters; raising them is a profile change with new fixtures, not a redesign. Larger cages end discovery with `excluded: cage-box-out-of-profile` when no cage fits; bounds maintenance (`rule-sum@1`) and K02 still apply to them.
- **Proof:** a binary union tree of `table-filter@1` leaves, each over at most 256 tuples (D068), whose premises are the cage's all-different fact, its sum fact and the current domain fact of every cage cell. `table-filter@1` evaluates the sum on each row exactly as lemma LS does. The root table is complete (its box equals the domains), and each effect is a single-literal `table-project@1` from that root followed by ordinary domain closure.
- **Grammar:** recomputes the surviving rows and removals from the retained facts and current domains, pins every leaf's premises, parameters and box, requires one complete root table (its count equal to the recomputed rows) cited by all projections and a binary tree shape (`unions = leaves − 1`). Leaf counts, the union partition and root completeness are verified by the table primitives, not restated by the grammar.
- **Evidence:** `web/tests/unit/solver/killer.test.ts` and the fixtures in `web/tests/solver/fixtures/K01.json` (four-cell full box, five-cell out of profile, five-cell narrowed by peers), replay from original clues, and an oracle property over generated killer grids.

## K02 Innies/outies (`k02@1`, profile `k02-profile@1`)

The 45 rule. A container is a full-cover scope sum — every `all-different@1` rule spanning the symbol set publishes one (lemma M4) — and a combination subtracts any subset of the `cage@1` sums that intersect it. Cells covered exactly once by both sides cancel; what remains is the residual equation: uncovered container cells with `+1` (innies), cage cells outside the container with `−1` (outies), and the total `45 − Σ cage totals`.

- **Profile:** one container touched by at most 9 cages, combining 1–7 of them in one `linear-combine@1` node (≤ 8 premises, multipliers `+1`/`−1`), residual ≤ 16 nonzero cells. Discovery streams the cage subsets by increasing size (at most 501 per container, one work unit each, preemptible) and proposes only when lemma-LS bounds on the residual remove a candidate. A container touched by more than 9 cages is excluded with `container-too-crowded`; two-house containers are outside the profile.
- **Proof:** the `linear-combine@1` node, then one `linear-sum@1` node per removed candidate over the residual's current domain facts, then domain closure.
- **Grammar:** recomputes the residual from the retained facts, pins the combination's premises, multipliers and conclusion, recomputes the removals, and requires every effect root to be a bound on that exact residual.
- **Evidence:** `web/tests/unit/solver/killer.test.ts` with the fixtures in `web/tests/solver/fixtures/K02.json` (single innie, outie, five touching cages with an untouched far cage, an eight-cage house where only seven-cage combinations are admissible), replay from original clues, and an oracle property over generated killer grids.

## Profiles

`variantEntries` (`techniques/manifest.ts`) is the catalogue of the K families and
`techniques/profiles.ts` the leaf module holding `variants-expanded@1` and
`variants-conditional@1`, which append the K rows to the classic profile.
`profileFor(problem)` selects a variant profile exactly when the problem declares
a variant rule, so a classic board keeps `classic-expanded@1` and its trace. A
problem whose profile is not ready yields an `error` result with code
`profile-incomplete` instead of a rejected promise.
