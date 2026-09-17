# Tridagon guardians — C32

`tridagonTechniques` registers `c32@1` for `Tridagon`, `Thor's Hammer`,
`Degenerate Tridagon`, and `Tridagon guardians`. The
[matrix](../../history/superpowers/specs/2026-09-12-m2-technique-coverage.md) fixes four
boxes in a two-band/two-stack rectangle, three cells in each box, three core
symbols, and at most four guardian occurrences. The terminology follows
[SudokuWiki: Tridagons](https://www.sudokuwiki.org/Tridagons), consulted
2026-09-14. No source puzzle, picture, or code was copied.

`TridagonSearch` enumerates the bounded core and geometry. `compileTridagon`
accepts a `TridagonPlan` and enumerates every current-domain-compatible distinct
core assignment to each box triple, at most six per box. Every product of those
lists, at most 1,296, needs a specific equal-symbol peer conflict. A surviving
core assignment ends this attempted proof. Sparse triples are allowed, and the
degenerate alias requires an actual reduced permutation list. A parity diagram
does not replace this complete check.

The compiler also builds complete tables using the actual domains, including
every guardian, and joins all four boxes with every actual cross-box conflict.
The complete nonempty final relation projects the OR of all non-core candidate
occurrences. `checkTridagonPattern` independently reconstructs geometry,
permutations, each rejection, all local tables/joins, and the exact theorem root.
The theorem establishes a logical obstruction when all guardians are denied;
it is neither an XOR nor a uniqueness or solution-count claim.

One guardian produces a placement with explicit peer removals and domain
closures. Two to four guardians produce a checked effect-free native clause
publication with that theorem as its sole proof root. Existing authentic clause
retention preserves its exact Fact identity and extends the accepted prefix
without changing candidate revision. C28's `ProvedClauseIndex` then resolves the
complete alternatives and composes its existing OR-chain proof. No special
Tridagon cache issuer, invented cover, or implicit implication-index import is
used. Stale-prefix consumers and repeated source retention remain rejected.

The filtered table primitive has exactly two authentic complete relation/table
sources followed by checked all-different or canonical clause filters. Every
filter cell and every clause literal belongs to the union of at most sixteen
cells. It reconstructs compatible pairs, applies every filter, and authenticates
the exact count. Definition depth is at most 64. Later projection recomputes
filtered semantics and checks conservative nested scratch before allocation;
no expanded rows are retained. Both join kinds are excluded from partition
union. The new primitive IDs are excluded from T14's local net grammar and
branch importer because that importer does not remap table-definition metadata.

[C32.json](../../../web/tests/solver/fixtures/C32.json) contains guardian1/2/4 and
degenerate original-given examples; [C32-negative.json](../../../web/tests/solver/fixtures/C32-negative.json)
contains a genuine surviving-core counterexample.
[C32-guardian-or.json](../../../web/tests/solver/fixtures/C32-guardian-or.json)
contains actual guardian2/3/4 sources and inserted C28 consumers. Tests check
independent and production source proofs, authentic retention, same-revision
index rebuilding, complete consumption, original-clue source-plus-consumer
replay, and actual C28 discovery. The unchanged exact oracle finds witnesses
with two guardians simultaneously true and exhausts joint guardian denial.
See [provenance](../../../web/tests/solver/README.md) for commands and ownership.
