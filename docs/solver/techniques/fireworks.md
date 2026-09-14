# Fireworks — C29

`fireworksTechniques` registers `c29@1`. `Fireworks`, `Triple Fireworks`, and
`Quadruple Fireworks` use the exact finite
[matrix profile](../../superpowers/specs/2026-09-12-m2-technique-coverage.md).
The triple has one intersection and two outside-box wings. The canonical quad
has two opposite intersections, the same two wings, and disjoint symbol pairs.
It is the conjunction of two double fireworks. These names and geometry follow
[SudokuWiki's Fireworks description](https://www.sudokuwiki.org/Fireworks)
(consulted 2026-09-14); no source puzzle, image, or code was copied.

For each selected symbol the certificate starts with the complete row and column
covers, including current domains for every house cell. Box exclusions and
resolution prove both directional consequences on the three selected cells.
This can be stronger than simply recording their three-cell OR. A singleton
consequence becomes an explicit domain restriction whose original domain and
cover proof remain ancestors; it is never silently dropped.

Complete local tables preserve the two intersection–wing exclusions. The
component joins its domain table with a one-cell identity and every nonsingleton
cover clause. The quad joins both independently established component relations,
including all actual cross-component peer exclusions. Only unsupported values
in that complete, nonempty final relation become removals. Every supplied
removal root must project directly from it. A copied component or a valid but
substituted effect proof cannot establish the named explanation.

`FireworksSearch` implements the common `SpecializedStrategy` interface and
services triples and quads per intersection. `compileFireworks` consumes a
`FireworksPlan` of `FireworkComponent` values and returns a cooperative generator
of work events, ending in an untrusted proposal or `null`. `SpecializedProof`
composes the wire allocator, exact classic-scope resolver, and operation-owned
finite rows. `checkFireworksPattern` and `SpecializedAdmission` reconstruct
lineage independently; neither imports the detector or compiler. Familiar
house IDs confer no authority: declared cell scopes and proved cover facts do.

The runtime reserves search scratch and a separate compilation lease before
expansion, charges retained rows/nodes, and releases both on cancellation,
limits, cursor closure, and normal completion. Time/work/byte interruption is
reported as incomplete. Large local products partition into complete leaves of
at most 256 tuples. Filtered joins and later projections recompute their rows
with accounted iterator scratch; they retain no expanded-row cache.

Repository-owned fixtures are in
[C29.json](../../../web/tests/solver/fixtures/C29.json) and
[C29-singleton.json](../../../web/tests/solver/fixtures/C29-singleton.json).
They retain original givens and exact peer-derived prestates. Independent finite
enumeration, a separate test proof assembler, original-clue replay, and the
unchanged exact oracle check every returned effect. Discovery tests separately
reach triple and quad geometry. See
[fixture provenance](../../../web/tests/solver/README.md) and
[negative/resource tests](../../../web/tests/unit/solver/specialized-negatives.test.ts).
These are implementation acceptance records, not a claim of essential puzzle
difficulty, default-limit performance, or completed expanded application release.
