import type { DeductionProposal, ProofNode, Effect } from "../proof/types";
import type { Literal, ReadView } from "../state/types";
import { clause, requireProof, sameValue } from "../proof/primitives";
import { ChainSources, projectedSource } from "./chains-grammar";
import type { AlsSet, AlsProjection, AlsPattern, BlossomPattern } from "./als-certificate";
import { findHouse, symbolMask } from "../state/read";
import { claimed, defined } from "../invariants";

const fields = (pattern: object | null | undefined, names: string[]) =>
  requireProof(
    pattern && sameValue(Object.keys(pattern).sort(), names.sort()),
    "invalid-als-fields",
  );
const ordered = (xs: number[]) =>
  Array.isArray(xs) && xs.every((x, i) => Number.isSafeInteger(x) && (!i || x > xs[i - 1]));
const positive = (cell: number, symbol: number): Literal => ({ cell, symbol, positive: true });

/** Named authority reconstructs set geometry, source tables and actual effect lineage.
 * It imports no production search/compiler function and never trusts RCC cache metadata. */
class AlsAdmission {
  readonly sources: ChainSources;
  constructor(
    readonly proposal: DeductionProposal,
    readonly view: ReadView,
    readonly available: ReadonlyMap<number, ProofNode>,
    readonly sets: AlsSet[],
  ) {
    this.sources = new ChainSources(view, available);
    requireProof(Array.isArray(sets) && sets.length > 0 && sets.length <= 6, "als-set-count");
    requireProof(
      new Set(sets.map((set) => set.cells.join())).size === sets.length,
      "repeated-als-set",
    );
    for (const set of sets) {
      fields(set, ["cells", "symbols", "house", "occurrences"]);
      const house = findHouse(view, set.house);
      requireProof(
        ordered(set.cells) &&
          set.cells.length >= 1 &&
          set.cells.length <= 5 &&
          house &&
          house.cells.length === 9 &&
          set.cells.every((cell) => house.cells.includes(cell) && !view.state.values[cell]),
        "als-size-or-house",
      );
      const union = set.cells.reduce((mask, cell) => mask | view.state.domains[cell], 0);
      const symbols = view.assembly.problem.symbols.filter((symbol) => union & symbolMask(symbol));
      requireProof(
        symbols.length === set.cells.length + 1 &&
          sameValue(symbols, set.symbols) &&
          sameValue(
            Object.keys(set.occurrences)
              .map(Number)
              .sort((left, right) => left - right),
            symbols,
          ),
        "invalid-als-union",
      );
      for (const symbol of symbols)
        requireProof(
          sameValue(
            set.occurrences[symbol],
            set.cells.filter((cell) => view.state.domains[cell] & symbolMask(symbol)),
          ),
          "missing-als-occurrence",
        );
    }
  }
  members(set: number, symbol: number): Literal[] {
    requireProof(
      Number.isSafeInteger(set) && this.sets[set]?.symbols.includes(symbol),
      "missing-als-symbol",
    );
    return this.sets[set].occurrences[symbol].map((cell) => positive(cell, symbol));
  }
  projection(projection: AlsProjection, set: number, symbols: number[]): void {
    fields(projection, ["set", "symbols", "root"]);
    requireProof(
      projection.set === set &&
        sameValue(projection.symbols, symbols) &&
        symbols.length === 2 &&
        symbols[0] !== symbols[1],
      "invalid-als-projection",
    );
    const source = this.sets[set];
    this.sources.strong(
      { kind: "als", cells: source.cells, symbols: source.symbols, house: source.house },
      symbols.flatMap((symbol) => this.members(set, symbol)),
      projection.root,
    );
  }
  weak(roots: number[], pairs: [Literal, Literal][]): void {
    requireProof(Array.isArray(roots) && roots.length === pairs.length, "incomplete-als-conflicts");
    pairs.forEach(([literal, b], i) => {
      requireProof(
        literal.cell !== b.cell || literal.symbol !== b.symbol,
        "overlap-in-rcc-or-visibility",
      );
      this.sources.weak(roots[i], literal, b);
    });
  }
  /** Only selected conjunction projections and resolution carry named lineage. */
  lineage(root: number, sources: number[], scope: number[]): void {
    const labels = new Map<number, bigint>();
    sources.forEach((id, i) => labels.set(id, (labels.get(id) ?? 0n) | (1n << BigInt(i))));
    const valid = new Map<number, bigint>();
    for (const n of this.proposal.proof.nodes) {
      const raw = projectedSource(n.id, this.available);
      if (labels.has(raw)) valid.set(n.id, defined(labels.get(raw), "label"));
      else if (
        n.rule === "resolution@1" &&
        sameValue(n.scope, scope) &&
        n.premises.every((id) => valid.has(id))
      )
        valid.set(
          n.id,
          n.premises.reduce((mask, id) => mask | defined(valid.get(id), "valid"), 0n),
        );
    }
    requireProof(
      valid.get(root) === (1n << BigInt(sources.length)) - 1n,
      "incomplete-als-effect-lineage",
    );
  }
  roots(effect: Effect): number[] {
    const target = clause([{ cell: effect.cell, symbol: effect.symbol, positive: false }]);
    const roots = this.proposal.proof.roots.filter((id) =>
      sameValue(this.available.get(id)?.conclusion, target),
    );
    requireProof(roots.length > 0, "missing-als-effect-root");
    return roots;
  }
}

export function checkAlsPattern(
  proposal: DeductionProposal,
  view: ReadView,
  available: ReadonlyMap<number, ProofNode>,
): void {
  const pattern = proposal.pattern as unknown as AlsPattern | BlossomPattern;
  requireProof(
    proposal.effects.length > 0 && proposal.effects.every((effect) => effect.kind === "remove"),
    "unproductive-als",
  );
  const check = new AlsAdmission(proposal, view, available, pattern.sets);
  const expectedOverlaps = pattern.sets.flatMap((a, left) =>
    pattern.sets.flatMap((b, right) =>
      left < right
        ? [{ left, right, cells: a.cells.filter((cell) => b.cells.includes(cell)) }]
        : [],
    ),
  );
  requireProof(sameValue(pattern.overlaps, expectedOverlaps), "incomplete-als-overlap");
  if (pattern.kind === "als") {
    fields(pattern, ["kind", "alias", "sets", "overlaps", "rccs", "routes"]);
    const count = pattern.sets.length,
      xz = pattern.alias === "ALS-XZ",
      double = xz && pattern.rccs.length === 2;
    requireProof(
      proposal.technique === "c18@1"
        ? (xz && count === 2) || (pattern.alias === "ALS-XY-Wing" && count === 3)
        : proposal.technique === "c19@1" &&
            pattern.alias === "ALS chains" &&
            count >= 2 &&
            count <= 6,
      "invalid-als-family",
    );
    requireProof(
      Array.isArray(pattern.rccs) &&
        pattern.rccs.length === (double ? 2 : count - 1) &&
        2 * count - 1 <= 24,
      "invalid-als-links",
    );
    pattern.rccs.forEach((rcc, i) => {
      fields(rcc, ["left", "right", "symbol", "roots"]);
      requireProof(
        rcc.left === (double ? 0 : i) && rcc.right === (double ? 1 : i + 1),
        "invalid-rcc-order",
      );
      if (i) requireProof(rcc.symbol !== pattern.rccs[i - 1].symbol, "repeated-adjacent-rcc");
      check.weak(
        rcc.roots,
        check
          .members(rcc.left, rcc.symbol)
          .flatMap((left) =>
            check
              .members(rcc.right, rcc.symbol)
              .map((right) => [left, right] as [Literal, Literal]),
          ),
      );
    });
    requireProof(
      Array.isArray(pattern.routes) && pattern.routes.length === proposal.effects.length,
      "missing-als-effect-routes",
    );
    for (const [i, effect] of proposal.effects.entries()) {
      const route = pattern.routes[i];
      fields(route, ["form", "projections", "rccs", "witnesses", "visibility", "root"]);
      let expected: { set: number; symbols: number[] }[], witnesses: Literal[], edges: number[];
      const restricted = pattern.rccs.map((rcc) => rcc.symbol);
      if (double && !restricted.includes(effect.symbol)) {
        requireProof(
          route.form === "locked" && route.projections.length === 3,
          "missing-double-locked-route",
        );
        const set = route.projections[0].set;
        requireProof(set === 0 || set === 1, "invalid-locked-set");
        expected = [
          { set, symbols: [restricted[0], effect.symbol] },
          { set, symbols: [restricted[1], effect.symbol] },
          { set: 1 - set, symbols: restricted },
        ];
        witnesses = check.members(set, effect.symbol);
        edges = [0, 1];
      } else {
        requireProof(route.form === (double ? "rcc" : "path"), "invalid-als-route-class");
        edges = double ? [1 - restricted.indexOf(effect.symbol)] : pattern.rccs.map((_, j) => j);
        const symbols = edges.map((j) => restricted[j]);
        expected = pattern.sets.map((_, j) => ({
          set: j,
          symbols: [
            j ? symbols[j - 1] : effect.symbol,
            j === count - 1 ? effect.symbol : symbols[j],
          ],
        }));
        witnesses = [
          ...check.members(0, effect.symbol),
          ...check.members(count - 1, effect.symbol),
        ];
      }
      requireProof(
        sameValue(route.rccs, edges) && route.projections.length === expected.length,
        "incomplete-als-route",
      );
      expected.forEach((e, j) => check.projection(route.projections[j], e.set, e.symbols));
      witnesses = [
        ...new Map(
          witnesses.map((literal) => [literal.cell + ":" + literal.symbol, literal]),
        ).values(),
      ];
      requireProof(sameValue(route.witnesses, witnesses), "incomplete-als-target-visibility");
      check.weak(
        route.visibility,
        witnesses.map((literal) => [literal, positive(effect.cell, effect.symbol)]),
      );
      const selected = [
        ...route.projections.map((projection) => projection.root),
        ...edges.flatMap((j) => pattern.rccs[j].roots),
        ...route.visibility,
      ];
      const roots = check.roots(effect);
      requireProof(roots.includes(route.root), "substituted-als-route-root");
      for (const root of roots) check.lineage(root, selected, []);
    }
  } else {
    fields(pattern, [
      "kind",
      "alias",
      "sets",
      "overlaps",
      "stem",
      "symbols",
      "petals",
      "cover",
      "branches",
    ]);
    requireProof(
      claimed(pattern).kind === "blossom" &&
        claimed(pattern).alias === "Death Blossom" &&
        proposal.technique === "c19@1" &&
        view.assembly.problem.cells.includes(pattern.stem) &&
        !view.state.values[pattern.stem],
      "invalid-blossom-stem",
    );
    const symbols = view.assembly.problem.symbols.filter(
      (symbol) => view.state.domains[pattern.stem] & symbolMask(symbol),
    );
    requireProof(
      symbols.length >= 2 &&
        symbols.length <= 4 &&
        sameValue(pattern.symbols, symbols) &&
        pattern.petals.length === symbols.length &&
        pattern.petals.every((i) => Number.isSafeInteger(i) && i >= 0 && i < pattern.sets.length) &&
        new Set(pattern.petals).size === pattern.sets.length &&
        pattern.sets.every((set) => !set.cells.includes(pattern.stem)),
      "incomplete-blossom-petals",
    );
    const cover = available.get(pattern.cover);
    requireProof(
      cover?.rule === "cover-clause@1" &&
        sameValue(cover.premises, [view.state.domainFacts[pattern.stem]]) &&
        sameValue(
          cover.conclusion,
          clause(symbols.map((symbol) => positive(pattern.stem, symbol))),
        ) &&
        cover.scope.length === 0,
      "invalid-blossom-cover",
    );
    requireProof(pattern.branches.length === proposal.effects.length, "incomplete-blossom-effects");
    for (const [i, effect] of proposal.effects.entries()) {
      const branches = pattern.branches[i];
      requireProof(branches.length === symbols.length, "incomplete-blossom-branches");
      branches.forEach((branch, j) => {
        fields(branch, [
          "symbol",
          "petal",
          "projection",
          "conflicts",
          "visibility",
          "assumption",
          "root",
        ]);
        requireProof(
          branch.symbol === symbols[j] && branch.petal === pattern.petals[j],
          "wrong-blossom-alternative",
        );
        check.projection(branch.projection, branch.petal, [branch.symbol, effect.symbol]);
        check.weak(
          branch.conflicts,
          check
            .members(branch.petal, branch.symbol)
            .map((literal) => [positive(pattern.stem, branch.symbol), literal]),
        );
        check.weak(
          branch.visibility,
          check
            .members(branch.petal, effect.symbol)
            .map((literal) => [literal, positive(effect.cell, effect.symbol)]),
        );
        const assumption = available.get(branch.assumption);
        requireProof(
          assumption?.rule === "assume@1" &&
            assumption.scope.length === 0 &&
            sameValue(assumption.conclusion, clause([positive(pattern.stem, branch.symbol)])),
          "invalid-blossom-assumption",
        );
        requireProof(
          sameValue(
            available.get(branch.root)?.conclusion,
            clause([{ cell: effect.cell, symbol: effect.symbol, positive: false }]),
          ),
          "wrong-blossom-consequence",
        );
        check.lineage(
          branch.root,
          [branch.projection.root, ...branch.conflicts, ...branch.visibility, branch.assumption],
          [branch.assumption],
        );
      });
      for (const root of check.roots(effect)) {
        const n = available.get(root);
        requireProof(
          n?.rule === "cases@1" &&
            n.scope.length === 0 &&
            sameValue(n.premises, [
              pattern.cover,
              ...branches.flatMap((right) => [right.assumption, right.root]),
            ]),
          "missing-blossom-case-tree",
        );
      }
    }
  }
  const permitted = new Set([
    "cover-clause@1",
    "weak-link@1",
    "table-filter@1",
    "table-union@1",
    "table-project@1",
    "table-join@1",
    "all-different-subset@1",
    "conjunction@1",
    "resolution@1",
    "domain-restrict@1",
    ...(pattern.kind === "blossom" ? ["assume@1", "cases@1"] : []),
  ]);
  requireProof(
    proposal.proof.nodes.every(
      (n) =>
        permitted.has(n.rule) &&
        (pattern.kind === "blossom" ? n.scope.length <= 1 : n.scope.length === 0),
    ),
    "outside-als-grammar",
  );
}
