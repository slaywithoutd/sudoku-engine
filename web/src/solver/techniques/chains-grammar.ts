import type { ReadView, Literal } from "../state/types";
import type { DeductionProposal, ProofNode } from "../proof/types";
import { clause, requireProof, sameValue } from "../proof/primitives";
import type { ChainEvent, ChainPattern, StrongSource } from "./chains-certificate";
import { findHouse, symbolMask } from "../state/read";
import { claimed, defined } from "../invariants";

const key = (literal: Literal): string => `${literal.cell}:${literal.symbol}`;
const neg = (literal: Literal): Literal => ({ ...literal, positive: false });
const fields = (value: object, names: string[]) =>
  requireProof(sameValue(Object.keys(value).sort(), names.sort()), "invalid-chain-fields");
const distinct = (xs: number[]) =>
  xs.every((x, i) => Number.isSafeInteger(x) && (!i || x > xs[i - 1]));
function current(view: ReadView, literal: Literal | undefined): boolean {
  return (
    !!literal &&
    literal.positive === true &&
    view.assembly.problem.cells.includes(literal.cell) &&
    view.assembly.problem.symbols.includes(literal.symbol) &&
    !view.state.values[literal.cell] &&
    !!(view.state.domains[literal.cell] & symbolMask(literal.symbol))
  );
}
function classic(cells: readonly number[]): boolean {
  return (
    cells.length === 9 &&
    (new Set(cells.map((cell) => Math.floor(cell / 9))).size === 1 ||
      new Set(cells.map((cell) => cell % 9)).size === 1 ||
      new Set(cells.map((cell) => Math.floor(cell / 27) * 3 + Math.floor((cell % 9) / 3))).size ===
        1)
  );
}

/** Exact source reconstruction. No graph, detector, compiler or caller-supplied validator participates. */
export class ChainSources {
  constructor(
    readonly view: ReadView,
    readonly available: ReadonlyMap<number, ProofNode>,
  ) {}
  strong(source: StrongSource | undefined, members: Literal[], root: number): void {
    requireProof(source && typeof source === "object", "missing-chain-source");
    const node = this.available.get(root);
    requireProof(
      node && node.scope.length === 0 && sameValue(node.conclusion, clause(members)),
      "invalid-chain-source-root",
    );
    if (source.kind === "cell") {
      fields(source, ["kind", "cell"]);
      const all = this.view.assembly.problem.symbols
        .filter((symbol) => this.view.state.domains[source.cell] & symbolMask(symbol))
        .map((symbol) => ({ cell: source.cell, symbol, positive: true }));
      requireProof(
        all.length === 2 &&
          sameValue(clause(all), clause(members)) &&
          node.rule === "cover-clause@1" &&
          sameValue(node.premises, [this.view.state.domainFacts[source.cell]]),
        "invalid-cell-strong-source",
      );
    } else if (source.kind === "house" || source.kind === "proved-cover") {
      fields(
        source,
        source.kind === "house"
          ? ["kind", "house", "symbol"]
          : ["kind", "house", "symbol", "source"],
      );
      const house = findHouse(this.view, source.house);
      requireProof(house && classic(house.cells), "invalid-chain-house");
      const support = this.available.get(node.premises[0]),
        fact = support ? this.view.facts.get(support.premises[0]) : undefined;
      requireProof(
        fact?.openAssumptions.length === 0 &&
          fact.proposition.kind === "cover" &&
          (source.kind === "house"
            ? sameValue(fact.proposition.cells, house.cells)
            : fact.id === source.source &&
              fact.proposition.cells.every((cell) => house.cells.includes(cell))),
        "invalid-proved-cover-source",
      );
      const all = fact.proposition.cells
        .filter((cell) => this.view.state.domains[cell] & symbolMask(source.symbol))
        .map((cell) => ({ cell, symbol: source.symbol, positive: true }));
      requireProof(
        sameValue(clause(all), clause(members)) &&
          node.rule === "cover-clause@1" &&
          node.premises.length === 1 &&
          support?.rule === "support@1" &&
          fact.proposition.symbol === source.symbol &&
          sameValue(
            support.premises.slice(1),
            fact.proposition.cells.map((cell) => this.view.state.domainFacts[cell]),
          ),
        "invalid-house-strong-source",
      );
    } else {
      requireProof(claimed(source).kind === "als", "unknown-chain-source");
      fields(source, ["kind", "cells", "house", "symbols"]);
      const cells = source.cells,
        house = findHouse(this.view, source.house);
      requireProof(
        Array.isArray(cells) &&
          distinct(cells) &&
          cells.length >= 1 &&
          cells.length <= 5 &&
          house &&
          classic(house.cells) &&
          cells.every((cell) => house.cells.includes(cell) && !this.view.state.values[cell]),
        "als-out-of-profile",
      );
      const union = cells.reduce((mask, cell) => mask | this.view.state.domains[cell], 0);
      const symbols = this.view.assembly.problem.symbols.filter(
        (symbol) => union & symbolMask(symbol),
      );
      requireProof(
        symbols.length === cells.length + 1 &&
          sameValue(symbols, source.symbols) &&
          new Set(members.map((literal) => literal.symbol)).size === 2 &&
          members.every((literal) => cells.includes(literal.cell)) &&
          node.rule === "table-project@1" &&
          node.premises.length === 1,
        "invalid-als-strong-source",
      );
      for (const symbol of new Set(members.map((literal) => literal.symbol)))
        requireProof(
          sameValue(
            members
              .filter((literal) => literal.symbol === symbol)
              .map((literal) => literal.cell)
              .sort((left, right) => left - right),
            cells.filter((cell) => this.view.state.domains[cell] & symbolMask(symbol)),
          ),
          "incomplete-als-occurrences",
        );
      const complete = this.table(node.premises[0], cells, house.cells);
      const table = defined(this.available.get(node.premises[0]), "available").conclusion;
      requireProof(
        table.kind === "table" &&
          table.count > 0 &&
          sameValue(
            complete,
            cells.map((cell) => this.view.state.domains[cell]),
          ),
        "incomplete-als-table",
      );
    }
  }
  private table(root: number, cells: number[], houseCells: readonly number[]): number[] {
    const node = this.available.get(root);
    requireProof(
      node?.conclusion.kind === "table" &&
        node.conclusion.definition === root &&
        sameValue(node.conclusion.cells, cells) &&
        node.scope.length === 0,
      "invalid-als-table",
    );
    if (node.rule === "table-union@1") {
      requireProof(node.premises.length === 2, "invalid-als-table");
      const left = this.table(node.premises[0], cells, houseCells),
        right = this.table(node.premises[1], cells, houseCells);
      const changed = left.map((mask, i) => (mask !== right[i] ? i : -1)).filter((i) => i >= 0);
      requireProof(
        changed.length === 1 && (left[changed[0]] & right[changed[0]]) === 0,
        "invalid-als-partition",
      );
      return left.map((mask, i) => mask | right[i]);
    }
    const pattern = node.parameters as { cells: number[]; box: number[] };
    requireProof(
      node.rule === "table-filter@1" &&
        sameValue(pattern.cells, cells) &&
        Array.isArray(pattern.box) &&
        pattern.box.length === cells.length &&
        pattern.box.every(
          (mask, i) =>
            Number.isSafeInteger(mask) &&
            mask >= 0 &&
            (mask & this.view.state.domains[cells[i]]) === mask,
        ) &&
        sameValue(
          node.premises.slice(0, cells.length),
          cells.map((cell) => this.view.state.domainFacts[cell]),
        ) &&
        node.premises.length === cells.length + 1,
      "incomplete-als-table-sources",
    );
    const subset = this.available.get(node.premises[cells.length]),
      source = subset && this.view.facts.get(subset.premises[0]);
    requireProof(
      subset?.rule === "all-different-subset@1" &&
        subset.premises.length === 1 &&
        sameValue(subset.conclusion, { kind: "all-different", cells }) &&
        source?.openAssumptions.length === 0 &&
        source.proposition.kind === "all-different" &&
        sameValue(source.proposition.cells, houseCells),
      "invalid-als-table-house",
    );
    return pattern.box;
  }
  weak(root: number, left: Literal, right: Literal): void {
    const node = this.available.get(root);
    requireProof(
      node &&
        node.scope.length === 0 &&
        ["weak-link@1", "table-project@1"].includes(node.rule) &&
        sameValue(node.conclusion, clause([neg(left), neg(right)])),
      "invalid-chain-weak-source",
    );
  }
}

/** Follow only exact conjunction projections; the other conjuncts never confer lineage bits. */
export function projectedSource(id: number, available: ReadonlyMap<number, ProofNode>): number {
  const selections: number[] = [];
  for (;;) {
    const node = available.get(id);
    if (
      node?.rule === "conjunction@1" &&
      node.premises.length === 1 &&
      node.parameters &&
      typeof node.parameters === "object" &&
      Object.hasOwn(node.parameters, "index")
    ) {
      selections.push((node.parameters as { index: number }).index);
      id = node.premises[0];
      continue;
    }
    if (!selections.length) return id;
    requireProof(
      node?.rule === "conjunction@1" &&
        node.parameters &&
        typeof node.parameters === "object" &&
        !Object.hasOwn(node.parameters, "index"),
      "invalid-chain-package",
    );
    id = node.premises[defined(selections.pop(), "selection")];
  }
}

function checkEvent(view: ReadView, event: ChainEvent | undefined): void {
  requireProof(event && typeof event === "object", "invalid-chain-event");
  fields(event, ["members", "als"]);
  requireProof(
    Array.isArray(event.members) &&
      event.members.length > 0 &&
      event.members.every((literal) => current(view, literal)) &&
      new Set(event.members.map(key)).size === event.members.length,
    "invalid-chain-members",
  );
  event.members.forEach((literal) => fields(literal, ["cell", "symbol", "positive"]));
  if (event.als !== null) {
    requireProof(
      Array.isArray(event.als) &&
        distinct(event.als) &&
        event.als.length <= 5 &&
        event.als.length > 0 &&
        new Set(event.members.map((literal) => literal.symbol)).size === 1,
      "invalid-als-event",
    );
    return;
  }
  if (event.members.length === 1) return;
  requireProof(
    event.members.length <= 3 && new Set(event.members.map((literal) => literal.symbol)).size === 1,
    "group-out-of-profile",
  );
  const symbol = event.members[0].symbol,
    cells = event.members.map((literal) => literal.cell).sort((left, right) => left - right);
  const houses = view.assembly.allDifferent.filter((house) => classic(house.cells));
  requireProof(
    houses.some((left) =>
      houses.some(
        (right) =>
          left.id !== right.id &&
          left.cells.filter((cell) => right.cells.includes(cell)).length === 3 &&
          sameValue(
            left.cells.filter(
              (cell) => right.cells.includes(cell) && view.state.domains[cell] & symbolMask(symbol),
            ),
            cells,
          ),
      ),
    ),
    "invalid-group-intersection",
  );
}

/** Named path admission includes every effect root, preventing a valid small proof from decorating a longer path. */
export function checkChainPattern(
  proposal: DeductionProposal,
  view: ReadView,
  available: ReadonlyMap<number, ProofNode>,
): void {
  const pattern = proposal.pattern as unknown as ChainPattern;
  requireProof(proposal.effects.length > 0, "unproductive-chain-pattern");
  fields(pattern, [
    "kind",
    "alias",
    "vertices",
    "links",
    "closed",
    "polarity",
    "inferenceLinks",
    "cuts",
  ]);
  requireProof(
    claimed(pattern).kind === "chain" &&
      Array.isArray(pattern.vertices) &&
      Array.isArray(pattern.links) &&
      pattern.links.length >= 3 &&
      pattern.links.length <= 24 &&
      pattern.inferenceLinks === pattern.links.length &&
      typeof pattern.closed === "boolean" &&
      pattern.vertices.length === pattern.links.length + (pattern.closed ? 0 : 1),
    "chain-out-of-profile",
  );
  pattern.vertices.forEach((e) => checkEvent(view, e));
  requireProof(
    new Set(pattern.vertices.flatMap((e) => e.members.map(key))).size ===
      pattern.vertices.reduce((n, e) => n + e.members.length, 0),
    "repeated-chain-vertex",
  );
  const visits = new Set(
      pattern.vertices.filter((e) => e.als).map((e) => defined(e.als, "als").join()),
    ),
    groups = pattern.vertices.filter((e) => !e.als && e.members.length > 1).length;
  requireProof(visits.size + groups <= 4, "special-node-out-of-profile");
  for (const visit of visits) {
    const at = pattern.vertices.flatMap((e, i) => (e.als?.join() === visit ? [i] : []));
    requireProof(
      at.length === 2 &&
        (at[1] === at[0] + 1 ||
          (pattern.closed && at[0] === 0 && at[1] === pattern.vertices.length - 1)),
      "repeated-als-visit",
    );
    const edge = at[1] === at[0] + 1 ? at[0] : at[1];
    requireProof(
      pattern.links[edge].kind === "strong" &&
        pattern.links[edge].source?.kind === "als" &&
        pattern.links[edge].source.cells.join() === visit,
      "missing-als-transition",
    );
  }
  const c16 = proposal.technique === "c16@1",
    special = visits.size + groups;
  requireProof(
    c16
      ? ["X-Chains", "XY-Chains", "AICs"].includes(pattern.alias) && !pattern.closed && !special
      : [
          "Continuous Nice Loops",
          "Discontinuous Nice Loops",
          "Grouped AIC",
          "Grouped loops",
          "ALS links",
        ].includes(pattern.alias),
    "invalid-chain-alias",
  );
  if (pattern.alias === "X-Chains")
    requireProof(
      new Set(pattern.vertices.flatMap((e) => e.members.map((literal) => literal.symbol))).size ===
        1,
      "invalid-x-chain",
    );
  if (pattern.alias === "XY-Chains")
    requireProof(
      pattern.links.every((link) => link.kind === "weak" || link.source?.kind === "cell"),
      "invalid-xy-chain",
    );
  if (pattern.alias === "Grouped AIC")
    requireProof(!pattern.closed && groups > 0, "invalid-grouped-aic");
  if (pattern.alias === "Grouped loops")
    requireProof(pattern.closed && groups > 0, "invalid-grouped-loop");
  if (pattern.alias === "ALS links") requireProof(visits.size > 0, "missing-als-visit");
  if (pattern.alias === "Continuous Nice Loops")
    requireProof(
      pattern.closed && pattern.polarity === null && !special,
      "invalid-continuous-loop",
    );
  if (pattern.alias === "Discontinuous Nice Loops")
    requireProof(
      pattern.closed && pattern.polarity !== null && !special,
      "invalid-discontinuous-loop",
    );
  const polarity = claimed(pattern).polarity;
  requireProof(
    polarity === null || polarity === "on" || polarity === "off",
    "invalid-chain-polarity",
  );
  requireProof(
    pattern.links.every(
      (link, i) =>
        (claimed(link).kind === "strong" || claimed(link).kind === "weak") &&
        (!i || link.kind !== pattern.links[i - 1].kind),
    ),
    "broken-chain-alternation",
  );
  if (!pattern.closed)
    requireProof(
      pattern.polarity === null &&
        pattern.links[0].kind === "strong" &&
        defined(pattern.links.at(-1), "link").kind === "strong",
      "unproductive-chain-parity",
    );
  else if (pattern.polarity === null)
    requireProof(
      pattern.links[0].kind !== defined(pattern.links.at(-1), "link").kind,
      "broken-loop-closure",
    );
  else
    requireProof(
      pattern.links[0].kind === defined(pattern.links.at(-1), "link").kind &&
        pattern.links[0].kind === (pattern.polarity === "on" ? "strong" : "weak") &&
        pattern.vertices[0].members.length === 1 &&
        !pattern.vertices[0].als,
      "wrong-discontinuity-polarity",
    );
  const sources = new ChainSources(view, available);
  pattern.links.forEach((link, i) => {
    fields(link, ["kind", "source", "roots"]);
    const a = pattern.vertices[i],
      b = pattern.vertices[(i + 1) % pattern.vertices.length];
    requireProof(Array.isArray(link.roots), "missing-link-roots");
    if (link.kind === "strong") {
      requireProof(link.roots.length === 1 && link.source !== null, "missing-strong-root");
      if (link.source.kind === "als")
        requireProof(
          sameValue(a.als, link.source.cells) && sameValue(b.als, link.source.cells),
          "unbound-als-source",
        );
      sources.strong(link.source, [...a.members, ...b.members], link.roots[0]);
    } else {
      requireProof(
        link.source === null && link.roots.length === a.members.length * b.members.length,
        "incomplete-group-weak-link",
      );
      let at = 0;
      for (const x of a.members) for (const y of b.members) sources.weak(link.roots[at++], x, y);
    }
  });
  requireProof(
    Array.isArray(pattern.cuts) && pattern.cuts.length === proposal.effects.length,
    "missing-effect-paths",
  );
  for (const [index, effect] of proposal.effects.entries()) {
    const cut = pattern.cuts[index];
    requireProof(
      Number.isSafeInteger(cut) &&
        (pattern.closed && pattern.polarity === null
          ? cut >= 0 && cut < pattern.links.length && pattern.links[cut].kind === "weak"
          : cut === -1),
      "invalid-loop-effect-cut",
    );
    const selected = pattern.links.flatMap((link, i) => (i === cut ? [] : link.roots));
    const labels = new Map<number, bigint>();
    selected.forEach((id, i) => labels.set(id, (labels.get(id) ?? 0n) | (1n << BigInt(i))));
    const target = { cell: effect.cell, symbol: effect.symbol, positive: effect.kind === "place" };
    const ends =
      pattern.polarity === null
        ? pattern.closed
          ? [pattern.vertices[cut], pattern.vertices[(cut + 1) % pattern.vertices.length]]
          : [pattern.vertices[0], defined(pattern.vertices.at(-1), "vertice")]
        : [pattern.vertices[0]];
    if (pattern.polarity === null)
      requireProof(effect.kind === "remove", "wrong-chain-effect-polarity");
    else {
      const endpoint = pattern.vertices[0].members[0],
        own = effect.cell === endpoint.cell && effect.symbol === endpoint.symbol;
      requireProof(
        own
          ? effect.kind === (pattern.polarity === "on" ? "place" : "remove")
          : pattern.polarity === "on" && effect.kind === "remove",
        "wrong-chain-effect-polarity",
      );
    }
    const conflicts = new Set(
      ends.flatMap((e) =>
        e.members.map((literal) => JSON.stringify(clause([neg(literal), neg(target)]))),
      ),
    );
    const valid = new Map<number, bigint>();
    for (const node of proposal.proof.nodes) {
      const raw = projectedSource(node.id, available);
      if (labels.has(raw)) valid.set(node.id, defined(labels.get(raw), "label"));
      else if (
        ["weak-link@1", "table-project@1"].includes(node.rule) &&
        conflicts.has(JSON.stringify(node.conclusion))
      )
        valid.set(node.id, 0n);
      else if (node.rule === "resolution@1" && node.premises.every((id) => valid.has(id)))
        valid.set(
          node.id,
          node.premises.reduce((mask, id) => mask | defined(valid.get(id), "valid"), 0n),
        );
    }
    const required = (1n << BigInt(selected.length)) - 1n;
    const roots = proposal.proof.roots.filter((id) =>
      sameValue(available.get(id)?.conclusion, clause([target])),
    );
    requireProof(
      roots.length > 0 && roots.every((id) => valid.get(id) === required),
      "incomplete-chain-effect-lineage",
    );
  }
  const permitted = new Set([
    "support@1",
    "cover-clause@1",
    "weak-link@1",
    "resolution@1",
    "domain-restrict@1",
    "conjunction@1",
    "all-different-subset@1",
    "table-filter@1",
    "table-union@1",
    "table-project@1",
    "table-join@1",
  ]);
  requireProof(
    proposal.proof.nodes.every((n) => n.scope.length === 0 && permitted.has(n.rule)),
    "outside-chain-grammar",
  );
}
