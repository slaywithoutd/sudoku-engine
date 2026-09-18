# Killer families (M2.5)

Reasoning that exists only because a problem declares `cage@1` rules. Both families are ordinary named techniques: discovery proposes, the closed grammar in `web/src/solver/techniques/variant-grammar.ts` reconstructs the computation, and the table/linear primitives check every node again.

## K01 Killer combinations (`k01@1`, profile `k01-profile@1`)

A cage is a `sum` fact whose cells equal an `all-different` fact of the same rule. K01 lists every tuple of the cage's current domains that is distinct and reaches the total, then removes each candidate no tuple supports — "a 3-cell cage totalling 7 is {1,2,4}".

- **Profile:** 2–5 unsolved cells and an input box (product of the current domain sizes) of at most 16,384 Cartesian tuples. Both numbers are versioned parameters; raising them is a profile change with new fixtures, not a redesign. Larger cages end discovery with `excluded: cage-box-out-of-profile` when no cage fits; bounds maintenance (`rule-sum@1`) and K02 still apply to them.
- **Proof:** a binary union tree of `table-filter@1` leaves, each over at most 256 tuples (D068), whose premises are the cage's all-different fact, its sum fact and the current domain fact of every cage cell. `table-filter@1` evaluates the sum on each row exactly as lemma LS does. The root table is complete (its box equals the domains), and each effect is a single-literal `table-project@1` from that root followed by ordinary domain closure.
- **Grammar:** recomputes the surviving rows and removals from the retained facts and current domains, pins every leaf's premises, parameters and box, requires one complete root table cited by all projections and a binary tree shape (`unions = leaves − 1`).
- **Evidence:** `web/tests/unit/solver/killer.test.ts` and the fixtures in `web/tests/solver/fixtures/K01.json` (four-cell full box, five-cell out of profile, five-cell narrowed by peers), replay from original clues, and an oracle property over generated killer grids.

## K02 Innies/outies (`k02@1`)

Recorded when T09 lands.
