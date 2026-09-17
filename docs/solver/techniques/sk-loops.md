# SK Loops — C30

`skLoopTechniques` registers `c30@1` and the `SK Loops` alias. The exact
[matrix profile](../../history/superpowers/specs/2026-09-12-m2-technique-coverage.md)
selects four boxes at two bands and two stacks, with eight two-cell groups around
their rectangle. Adjacent groups share a declared row, column, or box. Each link
has one to three symbols and total multiplicity is at most sixteen. The source
mapping is [SudokuWiki: SK Loops](https://www.sudokuwiki.org/SK_Loops), consulted
2026-09-14. The implementation and fixtures were written independently.

Each group's full current domains, including solved singleton members, produce
its complete pair table. Seven filtered joins add every actual peer conflict
between the new group and all prior groups. The final join includes the last
group's conflicts with the first, so it is the actual ring closure. No visual
rectangle or incomplete path is accepted as a locked set.

Every group candidate belongs to an incident link. A complete assignment gives
sixteen cell truths, each counted by at least one link. Each link-symbol has
capacity one by its common house. Thus a nonempty relation with total capacity
at most sixteen must have capacity exactly sixteen and saturate every link.
This justifies the search's exact-sixteen pruning while preserving the stated
at-most-sixteen admission bound. All supported one/two/three-link distributions
are enumerated; a failed first distribution does not exhaust a rectangle.

For an outside removal, a clause projection from the complete ring proves that
the symbol occurs in the link's four cells. Four explicit house exclusions and
resolution prove the removal. `checkSkPattern` reconstructs all eight local
tables, all seven joins, the closing conflicts, every link, and every supplied
effect root. It rejects non-ring generalizations, incomplete domains, reused
partial tables, unsupported aliases, and valid effect proofs with substituted
named lineage.

`SkLoopsSearch` owns rectangle/link enumeration, `skGeometry` is a pure geometry
helper, and `compileSkLoop` accepts a `SkPlan`. It composes `SpecializedProof`
instead of granting authority to a pattern class. The shared strategy adapter
owns search and compilation leases and reports cooperative interruption. The
checker independently recomputes finite tables with complete sources and
bounded nested scratch; no expanded rows persist in the accepted prefix.

[C30.json](../../../web/tests/solver/fixtures/C30.json) contains all-double,
mixed 3/1, and solved-singleton examples. Independent complete joins have
2,304, 8,096, and 288 survivors respectively and check every saturated link.
The singleton example first admits a real C01 step and its explicit peer
effects from the original givens. Independent and production certificates then
replay that prefix. Exact-oracle force/forbid tests check all production effects.
Actual discovery separately reaches a complete sixteen-link ring; seed maximum
certificates do not imply measured discovery of every presentation within
default limits. See [provenance](../../../web/tests/solver/README.md).
