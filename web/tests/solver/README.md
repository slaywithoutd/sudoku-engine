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

## ALS fixture provenance

`C18.json` and `C19.json` retain the independent root-authored overlapping and
double-RCC seeds, independently reinterpreted C11/T11 clue geometry, and locally
authored chain/Blossom constructions. There are 14 productive examples and two
primitive-sound examples outside the named stem/petal bounds. Their 16 original
clue/domain input hashes and 18 forced-opposite checks reproduce through the
unchanged Algorithm X oracle. No solution-derived candidate axioms are used.

The separate test compiler is `tests/unit/solver/als-acceptance.ts`. Productive
fixtures run independent certificates, exact production compilation and original
clue replay. Production discovery also has family, overlap, double-RCC and stem
size gates. See `docs/solver/techniques/als.md` for the exact bounds, proof
substitution regressions, resource ownership tests and incomplete-search limits.

```text
npm test -- tests/unit/solver/als-patterns.test.ts
```

## Set-argument fixture provenance

`C20.json` contains seven independent original-clue Sue de Coq examples.
Six use only original-given peer exclusions; `C20-max11-symbol9` records a
replayable prefix of seventeen ordinary C01 placements and one C04 naked pair.
Those placements are outside its selected eleven cells and effect target.
`tests/unit/solver/set-acceptance.ts` checks each recorded domain change and
the final values/domains; none of the masks are installed as axioms.

`C21.json` contains eight aligned/count positives. The three selected-size
examples and two multi-symbol count examples honestly reuse the C11 XY clue
geometry. The five-cell auxiliary reinterprets C19's independently authored
shared-petal fixture. The one-symbol count uses a peer-derived singleton from
C20. The twelve-cell/nine-symbol count pads the external-target example with
nine original-given singleton terms; this is a bound-admission test, not an
essentiality or difficulty claim. All examples are repository-owned.

The independent interpreter never calls a production detector, index, builder
or named validator to author a certificate. Focused tests independently check
15 satisfiable pre-states, 15 exhausted forced-removal counterfactuals,
satisfiable forbids and complete original-clue replay. They also compile the
same exact geometries through production and test actual family discovery.
Read `docs/solver/techniques/set-arguments.md` for the sources, supported bounds,
scope/certificate mutation gates and honest incomplete-search limits.

```text
npm test -- tests/unit/solver/set-arguments.test.ts
```

## Forcing, net and Kraken fixture provenance

`C22.json` contains complete digit, cell2/cell9 and unit2/unit9 cases authored
from original-given domains by a separate coordinate/set signed-graph search.
The Nishio case honestly reuses C17's three-edge single-digit geometry with a
fresh C22 assumption/discharge proof. The positive24 example has25distinct
signed vertices on its long branch and a seven-link complementary branch;
both place49/2. A shorter proof exists, so24 is certificate-boundary evidence,
not a claim of minimal difficulty.

`C23.json` preserves separately authored finite basic operations and any
original-clue prefix. `C23-static-independent` is the corrected static label
for the original seed: merely creating a bivalue is not dynamic-link use.
Actual dynamic discovery on that prestate consumes the rebuilt cell23{2,8}
cover. The nested seed exhausts its actual inner alternatives at depth2.
Independent128 and129 examples use only original-given peer exclusions before
the branch. Every recorded domain change is checked separately. The128 proof
is admitted;129 is mathematically valid but rejected by the named profile.
The129 puzzle is an honest row/column/digit permutation of128, followed by a
fresh propagation schedule; neither proof inserts identity padding. Reachable
semantic dependency counting is confirmed against the actual primitive DAG.

`C24.json` reuses independently checked C07/C08 geometry with new fin paths:
basic, Franken size2 and Mutant size4 examples have targets that do not see the
fin. The four-fin case reuses C07's direct-visibility boundary and is explicitly
a one-link special case. The simple23 example thins original clues while
preserving all fish-symbol occurrences and uses24distinct signed vertices.
Every scalar edge flips sign, so23 is the attainable maximum below the stated
24-link cap for a target-positive to fin-negative path. It does not establish
that shorter fin paths are impossible.

`tests/solver/forcing-acceptance.ts` contains a separate mathematical operation
interpreter and certificate algebra. It does not call production forcing/net
builders or indexes to author certificates. Tests verify both independent and
production certificates, each prestate's satisfiability, every effect's
exhausted forced-opposite counterfactual and original-clue replay. Actual
discovery gates are separate from named maximum-length recipe acceptance.
Source, sibling, scope, complete-case, every-root and resource interruption
mutations are covered. See `docs/solver/techniques/forcing.md` for authority and
the exact semantic-versus-expanded proof budget contract.

```text
npm test -- tests/unit/solver/forcing.test.ts tests/unit/solver/nets.test.ts tests/unit/solver/candidates.test.ts
```
