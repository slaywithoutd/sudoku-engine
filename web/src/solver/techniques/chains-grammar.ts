import type { ReadView, Literal } from "../state/types";
import type { DeductionProposal, ProofNode } from "../proof/types";
import { clause, requireProof, sameValue } from "../proof/primitives";
import type { ChainEvent, ChainPattern, StrongSource } from "./chains-certificate";

const key = (l: Literal): string => `${l.cell}:${l.symbol}`;
const neg = (l: Literal): Literal => ({ ...l, positive: false });
const fields = (value: object, names: string[]) =>
  requireProof(sameValue(Object.keys(value).sort(), names.sort()), "invalid-chain-fields");
const distinct = (xs: number[]) =>
  xs.every((x, i) => Number.isSafeInteger(x) && (!i || x > xs[i - 1]));
function current(view: ReadView, l: Literal): boolean {
  return (
    l &&
    l.positive === true &&
    view.assembly.problem.cells.includes(l.cell) &&
    view.assembly.problem.symbols.includes(l.symbol) &&
    !view.state.values[l.cell] &&
    !!(view.state.domains[l.cell] & (1 << (l.symbol - 1)))
  );
}
function classic(cells: readonly number[]): boolean {
  return (
    cells.length === 9 &&
    (new Set(cells.map((c) => Math.floor(c / 9))).size === 1 ||
      new Set(cells.map((c) => c % 9)).size === 1 ||
      new Set(cells.map((c) => Math.floor(c / 27) * 3 + Math.floor((c % 9) / 3))).size === 1)
  );
}

/** Exact source reconstruction. No graph, detector, compiler or caller-supplied validator participates. */
export class ChainSources {
  constructor(
    readonly view: ReadView,
    readonly available: ReadonlyMap<number, ProofNode>,
  ) {}
  strong(source: StrongSource, members: Literal[], root: number): void {
    requireProof(source && typeof source === "object", "missing-chain-source");
    const node = this.available.get(root);
    requireProof(
      node && node.scope.length === 0 && sameValue(node.conclusion, clause(members)),
      "invalid-chain-source-root",
    );
    if (source.kind === "cell") {
      fields(source, ["kind", "cell"]);
      const all = this.view.assembly.problem.symbols
        .filter((s) => this.view.state.domains[source.cell] & (1 << (s - 1)))
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
      const house = this.view.assembly.allDifferent.find((h) => h.id === source.house);
      requireProof(house && classic(house.cells), "invalid-chain-house");
      const support = this.available.get(node.premises[0]),
        fact = support && this.view.facts.get(support.premises[0]);
      requireProof(
        fact?.openAssumptions.length === 0 &&
          fact.proposition.kind === "cover" &&
          (source.kind === "house"
            ? sameValue(fact.proposition.cells, house.cells)
            : fact.id === source.source &&
              fact.proposition.cells.every((c) => house.cells.includes(c))),
        "invalid-proved-cover-source",
      );
      const all = fact.proposition.cells
        .filter((c) => this.view.state.domains[c] & (1 << (source.symbol - 1)))
        .map((cell) => ({ cell, symbol: source.symbol, positive: true }));
      requireProof(
        sameValue(clause(all), clause(members)) &&
          node.rule === "cover-clause@1" &&
          node.premises.length === 1 &&
          support?.rule === "support@1" &&
          fact?.openAssumptions.length === 0 &&
          fact.proposition.kind === "cover" &&
          fact.proposition.symbol === source.symbol &&
          sameValue(
            support.premises.slice(1),
            fact.proposition.cells.map((c) => this.view.state.domainFacts[c]),
          ),
        "invalid-house-strong-source",
      );
    } else {
      requireProof(source.kind === "als", "unknown-chain-source");
      fields(source, ["kind", "cells", "house", "symbols"]);
      const cells = source.cells,
        house = this.view.assembly.allDifferent.find((h) => h.id === source.house);
      requireProof(
        Array.isArray(cells) &&
          distinct(cells) &&
          cells.length >= 1 &&
          cells.length <= 5 &&
          house &&
          classic(house.cells) &&
          cells.every((c) => house.cells.includes(c) && !this.view.state.values[c]),
        "als-out-of-profile",
      );
      const union = cells.reduce((m, c) => m | this.view.state.domains[c], 0);
      const symbols = this.view.assembly.problem.symbols.filter((s) => union & (1 << (s - 1)));
      requireProof(
        symbols.length === cells.length + 1 &&
          sameValue(symbols, source.symbols) &&
          new Set(members.map((l) => l.symbol)).size === 2 &&
          members.every((l) => cells.includes(l.cell)) &&
          node.rule === "table-project@1" &&
          node.premises.length === 1,
        "invalid-als-strong-source",
      );
      for (const symbol of new Set(members.map((l) => l.symbol)))
        requireProof(
          sameValue(
            members
              .filter((l) => l.symbol === symbol)
              .map((l) => l.cell)
              .sort((a, b) => a - b),
            cells.filter((c) => this.view.state.domains[c] & (1 << (symbol - 1))),
          ),
          "incomplete-als-occurrences",
        );
      const complete = this.table(node.premises[0], cells, house.cells);
      const table = this.available.get(node.premises[0])!.conclusion;
      requireProof(
        table.kind === "table" &&
          table.count > 0 &&
          sameValue(
            complete,
            cells.map((c) => this.view.state.domains[c]),
          ),
        "incomplete-als-table",
      );
    }
  }
  private table(root: number, cells: number[], house: readonly number[]): number[] {
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
      const a = this.table(node.premises[0], cells, house),
        b = this.table(node.premises[1], cells, house);
      const changed = a.map((m, i) => (m !== b[i] ? i : -1)).filter((i) => i >= 0);
      requireProof(
        changed.length === 1 && (a[changed[0]] & b[changed[0]]) === 0,
        "invalid-als-partition",
      );
      return a.map((m, i) => m | b[i]);
    }
    const p = node.parameters as { cells: number[]; box: number[] };
    requireProof(
      node.rule === "table-filter@1" &&
        sameValue(p.cells, cells) &&
        Array.isArray(p.box) &&
        p.box.length === cells.length &&
        p.box.every(
          (m, i) =>
            Number.isSafeInteger(m) && m >= 0 && (m & this.view.state.domains[cells[i]]) === m,
        ) &&
        sameValue(
          node.premises.slice(0, cells.length),
          cells.map((c) => this.view.state.domainFacts[c]),
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
        sameValue(source.proposition.cells, house),
      "invalid-als-table-house",
    );
    return p.box;
  }
  weak(root: number, a: Literal, b: Literal): void {
    const node = this.available.get(root);
    requireProof(
      node &&
        node.scope.length === 0 &&
        ["weak-link@1", "table-project@1"].includes(node.rule) &&
        sameValue(node.conclusion, clause([neg(a), neg(b)])),
      "invalid-chain-weak-source",
    );
  }
}

/** Follow only exact conjunction projections; the other conjuncts never confer lineage bits. */
export function projectedSource(id: number, available: ReadonlyMap<number, ProofNode>): number {
  const selections: number[] = [];
  while (true) {
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
    id = node.premises[selections.pop()!];
  }
}

function checkEvent(view: ReadView, event: ChainEvent): void {
  requireProof(event && typeof event === "object", "invalid-chain-event");
  fields(event, ["members", "als"]);
  requireProof(
    Array.isArray(event.members) &&
      event.members.length > 0 &&
      event.members.every((l) => current(view, l)) &&
      new Set(event.members.map(key)).size === event.members.length,
    "invalid-chain-members",
  );
  event.members.forEach((l) => fields(l, ["cell", "symbol", "positive"]));
  if (event.als !== null) {
    requireProof(
      Array.isArray(event.als) &&
        distinct(event.als) &&
        event.als.length <= 5 &&
        event.als.length > 0 &&
        new Set(event.members.map((l) => l.symbol)).size === 1,
      "invalid-als-event",
    );
    return;
  }
  if (event.members.length === 1) return;
  requireProof(
    event.members.length <= 3 && new Set(event.members.map((l) => l.symbol)).size === 1,
    "group-out-of-profile",
  );
  const symbol = event.members[0].symbol,
    cells = event.members.map((l) => l.cell).sort((a, b) => a - b);
  const houses = view.assembly.allDifferent.filter((h) => classic(h.cells));
  requireProof(
    houses.some((a) =>
      houses.some(
        (b) =>
          a.id !== b.id &&
          a.cells.filter((c) => b.cells.includes(c)).length === 3 &&
          sameValue(
            a.cells.filter(
              (c) => b.cells.includes(c) && view.state.domains[c] & (1 << (symbol - 1)),
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
  const p = proposal.pattern as unknown as ChainPattern;
  requireProof(proposal.effects.length > 0, "unproductive-chain-pattern");
  fields(p, ["kind", "alias", "vertices", "links", "closed", "polarity", "inferenceLinks", "cuts"]);
  requireProof(
    p.kind === "chain" &&
      Array.isArray(p.vertices) &&
      Array.isArray(p.links) &&
      p.links.length >= 3 &&
      p.links.length <= 24 &&
      p.inferenceLinks === p.links.length &&
      typeof p.closed === "boolean" &&
      p.vertices.length === p.links.length + (p.closed ? 0 : 1),
    "chain-out-of-profile",
  );
  p.vertices.forEach((e) => checkEvent(view, e));
  requireProof(
    new Set(p.vertices.flatMap((e) => e.members.map(key))).size ===
      p.vertices.reduce((n, e) => n + e.members.length, 0),
    "repeated-chain-vertex",
  );
  const visits = new Set(p.vertices.filter((e) => e.als).map((e) => e.als!.join())),
    groups = p.vertices.filter((e) => !e.als && e.members.length > 1).length;
  requireProof(visits.size + groups <= 4, "special-node-out-of-profile");
  for (const visit of visits) {
    const at = p.vertices.flatMap((e, i) => (e.als?.join() === visit ? [i] : []));
    requireProof(
      at.length === 2 &&
        (at[1] === at[0] + 1 || (p.closed && at[0] === 0 && at[1] === p.vertices.length - 1)),
      "repeated-als-visit",
    );
    const edge = at[1] === at[0] + 1 ? at[0] : at[1];
    requireProof(
      p.links[edge].kind === "strong" &&
        p.links[edge].source?.kind === "als" &&
        p.links[edge].source.cells.join() === visit,
      "missing-als-transition",
    );
  }
  const c16 = proposal.technique === "c16@1",
    special = visits.size + groups;
  requireProof(
    c16
      ? ["X-Chains", "XY-Chains", "AICs"].includes(p.alias) && !p.closed && !special
      : [
          "Continuous Nice Loops",
          "Discontinuous Nice Loops",
          "Grouped AIC",
          "Grouped loops",
          "ALS links",
        ].includes(p.alias),
    "invalid-chain-alias",
  );
  if (p.alias === "X-Chains")
    requireProof(
      new Set(p.vertices.flatMap((e) => e.members.map((l) => l.symbol))).size === 1,
      "invalid-x-chain",
    );
  if (p.alias === "XY-Chains")
    requireProof(
      p.links.every((l) => l.kind === "weak" || l.source?.kind === "cell"),
      "invalid-xy-chain",
    );
  if (p.alias === "Grouped AIC") requireProof(!p.closed && groups > 0, "invalid-grouped-aic");
  if (p.alias === "Grouped loops") requireProof(p.closed && groups > 0, "invalid-grouped-loop");
  if (p.alias === "ALS links") requireProof(visits.size > 0, "missing-als-visit");
  if (p.alias === "Continuous Nice Loops")
    requireProof(p.closed && p.polarity === null && !special, "invalid-continuous-loop");
  if (p.alias === "Discontinuous Nice Loops")
    requireProof(p.closed && p.polarity !== null && !special, "invalid-discontinuous-loop");
  requireProof(
    p.polarity === null || p.polarity === "on" || p.polarity === "off",
    "invalid-chain-polarity",
  );
  requireProof(
    p.links.every(
      (l, i) =>
        (l.kind === "strong" || l.kind === "weak") && (!i || l.kind !== p.links[i - 1].kind),
    ),
    "broken-chain-alternation",
  );
  if (!p.closed)
    requireProof(
      p.polarity === null && p.links[0].kind === "strong" && p.links.at(-1)!.kind === "strong",
      "unproductive-chain-parity",
    );
  else if (p.polarity === null)
    requireProof(p.links[0].kind !== p.links.at(-1)!.kind, "broken-loop-closure");
  else
    requireProof(
      p.links[0].kind === p.links.at(-1)!.kind &&
        p.links[0].kind === (p.polarity === "on" ? "strong" : "weak") &&
        p.vertices[0].members.length === 1 &&
        !p.vertices[0].als,
      "wrong-discontinuity-polarity",
    );
  const sources = new ChainSources(view, available);
  p.links.forEach((link, i) => {
    fields(link, ["kind", "source", "roots"]);
    const a = p.vertices[i],
      b = p.vertices[(i + 1) % p.vertices.length];
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
    Array.isArray(p.cuts) && p.cuts.length === proposal.effects.length,
    "missing-effect-paths",
  );
  for (const [index, effect] of proposal.effects.entries()) {
    const cut = p.cuts[index];
    requireProof(
      Number.isSafeInteger(cut) &&
        (p.closed && p.polarity === null
          ? cut >= 0 && cut < p.links.length && p.links[cut].kind === "weak"
          : cut === -1),
      "invalid-loop-effect-cut",
    );
    const selected = p.links.flatMap((link, i) => (i === cut ? [] : link.roots));
    const labels = new Map<number, bigint>();
    selected.forEach((id, i) => labels.set(id, (labels.get(id) ?? 0n) | (1n << BigInt(i))));
    const target = { cell: effect.cell, symbol: effect.symbol, positive: effect.kind === "place" };
    const ends =
      p.polarity === null
        ? p.closed
          ? [p.vertices[cut], p.vertices[(cut + 1) % p.vertices.length]]
          : [p.vertices[0], p.vertices.at(-1)!]
        : [p.vertices[0]];
    if (p.polarity === null) requireProof(effect.kind === "remove", "wrong-chain-effect-polarity");
    else {
      const endpoint = p.vertices[0].members[0],
        own = effect.cell === endpoint.cell && effect.symbol === endpoint.symbol;
      requireProof(
        own
          ? effect.kind === (p.polarity === "on" ? "place" : "remove")
          : p.polarity === "on" && effect.kind === "remove",
        "wrong-chain-effect-polarity",
      );
    }
    const conflicts = new Set(
      ends.flatMap((e) => e.members.map((l) => JSON.stringify(clause([neg(l), neg(target)])))),
    );
    const valid = new Map<number, bigint>();
    for (const node of proposal.proof.nodes) {
      const raw = projectedSource(node.id, available);
      if (labels.has(raw)) valid.set(node.id, labels.get(raw)!);
      else if (
        ["weak-link@1", "table-project@1"].includes(node.rule) &&
        conflicts.has(JSON.stringify(node.conclusion))
      )
        valid.set(node.id, 0n);
      else if (node.rule === "resolution@1" && node.premises.every((id) => valid.has(id)))
        valid.set(
          node.id,
          node.premises.reduce((mask, id) => mask | valid.get(id)!, 0n),
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
