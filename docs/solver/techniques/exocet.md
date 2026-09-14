# Junior and Double Exocet — C31

`exocetTechniques` registers `c31@1`. `Exocet` means the bounded Junior form;
`Junior Exocet` and `Double Exocet` have their own complete named certificates.
The [matrix](../../superpowers/specs/2026-09-12-m2-technique-coverage.md) is the
binding profile. Primary terminology references are
[Exocet](https://www.sudokuwiki.org/Exocet) and
[Double Exocet](https://www.sudokuwiki.org/Double_Exocet), consulted 2026-09-14.
The latter discusses wider interpretations; this implementation admits exactly
two independently proved Junior relations. It does not infer mirror, escape,
or general Exocet variants from a label. No external puzzle or code was copied.

A Junior has two base cells with three or four possible symbols, two nonseeing
targets, complete companions, three cross-lines, and the eighteen S cells
outside the base band or stack. For each symbol, every S occurrence—including
assigned values—must be covered by one or two declared houses. Both row and
transposed column orientations are supported.

For a true base digit, three cross-line covers compete against the cited S
capacities, base line, and base box. `cover-count-clause@1` proves the signed
implication from that base occurrence to the target OR. One S cover gives a
separate implication to each target. Repeated capacity scopes are represented
once with their exact integer weight. Every nonzero incidence and clause cell
has exact domain evidence. If a target singleton already entails a clause, the
certificate explicitly uses a complete local-table projection instead of
mislabeling a vacuous count.

The new count strategy reconstructs `a = upper incidence − lower incidence`
and `b = upper weights − lower weights`. Falsifying a positive literal fixes its
occupancy to zero; falsifying a negative literal fixes it to one. Over the
nonempty compatible unary product, it sums the exact minimum of each signed
term and requires that minimum to exceed `b`. Incompatible domain/fixing pairs
are rejected. Signed clauses have 2–64 alternatives of the counted symbol;
all weighted premises are consumed, integer weights are 1–81, and all taint,
assumption scopes, and original-rule provenance survive. The existing
`cover-count@1` keeps its conclusion semantics and shares only the incidence
validator. Count arithmetic alone never establishes the Junior geometry.

`ExocetSearch` enumerates base/target geometries, complete minimal S covers,
each Junior, and compatible prior Double components. `compileExocet` accepts
`JuniorPlan`/`ExocetPlan` values and composes the common wire and finite-table
builder. `ExocetAdmission` separately reconstructs every component count before
admitting its table. A Double has four targets, at most four base cells and four
symbols; its effects project from the full join of both relations and all actual
shared conflicts. Every supplied effect root must have that lineage.

[C31.json](../../../web/tests/solver/fixtures/C31.json) retains five original-clue
examples: Junior three/four-symbol, one-cover, shared-base Double, and exact
four-base Double. The Double expected effects require the joint relation.
Independent algebra, an independent proof assembler, both-orientation replay,
and force/forbid oracle checks cover every example. Discovery separately reaches
Junior and Double proposals. Assigned-S omission, component reuse, every-root
substitution, bounds, and interruption have focused regressions. See
[provenance](../../../web/tests/solver/README.md). Limits remain honest incomplete
outcomes; fixture test budgets are not production defaults.
