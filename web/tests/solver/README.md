# Independent classic Sudoku oracle

This directory contains test-only correctness tools. `oracle.ts` is a
set-based Algorithm X implementation built from the classic Sudoku definition:
729 cell-digit rows cover 324 cell, row-digit, column-digit, and box-digit
columns. It imports no production solver, topology, domain-mask, or grid-check
code. `grid-check.ts` independently validates witnesses with direct loops.

The search object copies its active-row and uncovered-column sets for each
branch and chooses the uncovered column with the fewest active rows. A node is
counted when its state is entered. Reaching `maxNodes` before entering another
state sets `interrupted`; reaching `limit` stops with `exhausted: false` but is
not an interruption. A complete traversal, including an immediate dead column,
sets `exhausted: true`. These distinctions prevent a bounded result from being
mistaken for uniqueness evidence.

`domains` contains 81 independent nine-bit restrictions: bit 0 permits digit 1
and bit 8 permits digit 9. The oracle decodes them with integer division rather
than production bit helpers. `force` and `forbid` are `[cell, digit]` pairs with
zero-based cells and digits 1 through 9. Malformed grids, domains, restrictions,
limits, and node budgets throw before search.

## Count fixture provenance

The fixtures in `fixtures/counts.json` are repository-owned test data. They do
not come from an external puzzle collection and carry no third-party puzzle
license. Their seed is the existing `SOLUTION` in `tests/fixtures.ts`, SHA-256
`4c5e72057519c48e1a2430cbedb7cff3a4a1d244eb28b8d865f85141f643017d`.
The remaining cases are constructed locally and asserted against those
constructions in the test:

- one hole replaces seed index 0 with zero;
- duplicate replaces index 1 with 5;
- no-place concatenates `123456780`, `000000009`, and 63 zeros;
- two-rectangle clears indices 3, 4, 30, and 31;
- empty is 81 zeros.

Re-establish the labels and validate every returned witness with:

```text
npm test -- tests/unit/solver/oracle.test.ts
```

## Foundation fixture provenance

`C01.json`–`C05.json` are repository-owned original-clue examples. An independent
fixture author labeled 46 productive examples and 11 negative examples using
plain Python sets and house geometry; no production discovery, topology or mask
helpers participated. The original author independently verified 158 positive
force/forbid counterfactuals. Two equivalent C03 presentation records and two
additional named negatives were subsequently added without changing the source
geometry/effects. Per-record origin, original clues, exact pre-state/pattern,
expected effects and independent oracle metadata are retained in the JSON.

The original construction witness only generated/sanity-checked clue boards;
it never seeds candidate restrictions. `fixtureView` starts from those clues
and proves every peer exclusion through real maintenance. The independently
authored test certificate compiler uses fixture geometry, never discovery output
or the production CertificateBuilder. Mutations change that independent
certificate. Every productive fixture runs the separate Algorithm X witness and
exhaustive counterfactual gate on both the detected and independently compiled
certificate. Unsatisfiable negatives are rejection diagnostics, not deductions.

Durable reproduction from `web/`:

```text
npm test -- tests/unit/solver/foundation.test.ts tests/unit/solver/coverage.test.ts
```

Original-clue replay covers every advertised foundation alias. Additional
repository-owned one-hole constructions cover all 81 cells and all 27 houses ×
nine symbols. Named C02 fixtures retain a multivalue target before the deduction,
so the independent C02 evidence is not merely a relabeled naked single. The
negative small-cage contract also has an actual three-cell all-different test
with nine symbols and no cover capability.

`verifyCertificate` and CertificateSession tests exercise primitive algebra only.
Their distinct opaque results cannot enter owned candidate state, production
replay or quality. Mixed-rule table tests do not advertise an unimplemented
production technique. The approved grammar/cache boundary is documented in
`docs/solver/techniques/foundation.md`.
