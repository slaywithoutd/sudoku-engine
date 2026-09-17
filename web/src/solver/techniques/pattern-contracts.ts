import { preparedSources, sourceFacts } from "../state/source-index";
import type { ReadView, Literal } from "../state/types";
import type { DeductionProposal, Effect, ProofNode } from "../proof/types";
import { clause, literals, requireProof, sameValue } from "../proof/primitives";
import { requireBentEffectLineage, requireDualRootLineage } from "./pattern-proof-lineage";
import { findHouse, symbolMask } from "../state/read";

export interface ShortPath {
  symbol: number;
  vertices: number[][];
  strongHouses: string[];
  emptyIntersection?: number;
}
export type ShortPattern = { alias: string; paths: ShortPath[] };
export type WingPattern =
  | { alias: string; pivot: number; wings: number[]; x: number; y: number; z: number }
  | {
      alias: "W-Wing";
      endpoints: number[];
      bridge: number[];
      cover: string;
      bridgeSymbol: number;
      eliminationSymbol: number;
    };
export interface BentPattern {
  alias: string;
  cells: number[];
  symbols: number[];
  nonrestrictedSymbol: number;
  occurrences: Record<string, number[]>;
  conflicts: number[][];
}
export interface RemotePattern {
  alias: string;
  cells: number[];
  symbols: number[];
  inferenceLinks: number;
  chute: null | "band" | "stack";
}
export interface ClauseRequirement {
  readonly literals: readonly Literal[];
  readonly source: "cell" | "house" | "weak";
  readonly cells?: readonly number[];
  readonly symbol?: number;
}
/** Named geometry produces a finite set of admissible elementary proof premises. */
export interface PatternRequirements {
  readonly clauses: ClauseRequirement[];
  readonly vocabulary: Literal[];
  readonly table?: BentPattern;
  readonly paths: readonly (readonly Literal[][])[];
}
export const pos = (cell: number, symbol: number): Literal => ({ cell, symbol, positive: true });
export const neg = (cell: number, symbol: number): Literal => ({ cell, symbol, positive: false });
export const digits = (view: ReadView, cell: number) =>
  view.assembly.problem.symbols.filter((s) => view.state.domains[cell] & symbolMask(s));
export const row = (c: number) => Math.floor(c / 9),
  column = (c: number) => c % 9,
  box = (c: number) => Math.floor(c / 27) * 3 + Math.floor((c % 9) / 3);
/** Empty-corner labels do not create another inference with the same vertices and covers. */
export function shortPathIdentity(view: ReadView, path: ShortPath): string {
  return JSON.stringify({
    symbol: path.symbol,
    vertices: path.vertices,
    strongScopes: path.strongHouses.map((id) => findHouse(view, id)?.cells ?? null),
  });
}
function exact(p: object, keys: string[]) {
  requireProof(sameValue(Object.keys(p).sort(), keys.sort()), "invalid-technique-pattern");
}
function distinct(cells: number[], min: number, max: number, view: ReadView) {
  requireProof(
    Array.isArray(cells) &&
      cells.length >= min &&
      cells.length <= max &&
      new Set(cells).size === cells.length &&
      cells.every(
        (c) =>
          Number.isSafeInteger(c) &&
          view.assembly.problem.cells.includes(c) &&
          !view.state.values[c],
      ),
    "pattern-out-of-profile",
  );
}
function sorted(values: number[]) {
  requireProof(
    values.every((v, i) => !i || v > values[i - 1]),
    "invalid-pattern-order",
  );
}
function house(view: ReadView, id: string) {
  const h = findHouse(view, id);
  requireProof(h && h.cells.length === 9, "invalid-pattern-house");
  return h;
}
function current(view: ReadView, l: Literal) {
  return !!(view.state.domains[l.cell] & symbolMask(l.symbol));
}
function requirement(): PatternRequirements {
  return { clauses: [], vocabulary: [], paths: [] };
}
export function conflict(view: ReadView, a: Literal, b: Literal): boolean {
  if (a.cell === b.cell) return a.symbol !== b.symbol;
  const prepared = preparedSources(view, "complete");
  if (prepared) return !!prepared.conflictSource(a, b);
  for (const fact of view.facts.values()) {
    if (fact.openAssumptions.length) continue;
    const p = fact.proposition;
    if (
      p.kind === "all-different" &&
      a.symbol === b.symbol &&
      p.cells.includes(a.cell) &&
      p.cells.includes(b.cell)
    )
      return true;
    if (
      p.kind === "relation" &&
      p.cells.includes(a.cell) &&
      p.cells.includes(b.cell) &&
      !p.tuples.some(
        (tuple) =>
          tuple[p.cells.indexOf(a.cell)] === a.symbol &&
          tuple[p.cells.indexOf(b.cell)] === b.symbol &&
          p.cells.every((c, i) => view.state.domains[c] & symbolMask(tuple[i])),
      )
    )
      return true;
  }
  return false;
}
function addWeak(r: PatternRequirements, view: ReadView, a: Literal, b: Literal) {
  requireProof(conflict(view, a, b), "missing-pattern-conflict");
  requireProof(a.cell !== b.cell || a.symbol !== b.symbol, "self-conflict");
  r.clauses.push({
    source: "weak",
    literals: [
      { ...a, positive: false },
      { ...b, positive: false },
    ],
  });
  r.vocabulary.push(a, b);
}
function addCell(r: PatternRequirements, view: ReadView, cell: number) {
  const values = digits(view, cell).map((s) => pos(cell, s));
  r.clauses.push({ source: "cell", cells: [cell], literals: values });
  r.vocabulary.push(...values);
}
function addHouse(
  r: PatternRequirements,
  view: ReadView,
  id: string,
  symbol: number,
  groups: number[][],
) {
  const h = house(view, id),
    expected = h.cells.filter((c) => current(view, pos(c, symbol)));
  requireProof(
    sameValue(
      [...groups.flat()].sort((a, b) => a - b),
      expected,
    ),
    "nonexhaustive-strong-link",
  );
  const values = expected.map((c) => pos(c, symbol));
  r.clauses.push({ source: "house", cells: h.cells, symbol, literals: values });
  r.vocabulary.push(...values);
}
function targets(
  r: PatternRequirements,
  view: ReadView,
  effects: readonly Effect[],
  occurrences: Literal[],
) {
  requireProof(effects.length > 0, "unproductive-pattern");
  for (const e of effects) {
    requireProof(
      e.kind === "remove" &&
        !view.state.values[e.cell] &&
        current(view, pos(e.cell, e.symbol)) &&
        occurrences.every((l) => l.symbol === e.symbol && l.cell !== e.cell),
      "invalid-pattern-effect",
    );
    occurrences.forEach((l) => addWeak(r, view, l, pos(e.cell, e.symbol)));
  }
}
/** C10 counts three internal links. ER arm membership is exhaustive, not a guessed group. */
export function validateShortPattern(
  view: ReadView,
  p: ShortPattern,
  effects: readonly Effect[],
): PatternRequirements {
  exact(p, ["alias", "paths"]);
  requireProof(
    [
      "Turbot Fish",
      "Skyscraper",
      "Two-String Kite",
      "Empty Rectangle",
      "Dual Empty Rectangle",
    ].includes(p.alias),
    "unknown-alias",
  );
  requireProof(
    Array.isArray(p.paths) && p.paths.length === (p.alias === "Dual Empty Rectangle" ? 2 : 1),
    "invalid-short-paths",
  );
  requireProof(
    new Set(p.paths.map((path) => shortPathIdentity(view, path))).size === p.paths.length,
    "duplicate-short-root",
  );
  const r = requirement(),
    paths: Literal[][][] = [];
  const covered = new Set<string>();
  for (const path of p.paths) {
    const er = p.alias.includes("Empty Rectangle");
    exact(
      path,
      er
        ? ["symbol", "vertices", "strongHouses", "emptyIntersection"]
        : ["symbol", "vertices", "strongHouses"],
    );
    requireProof(
      Array.isArray(path.vertices) &&
        path.vertices.length === 4 &&
        path.strongHouses.length === 2 &&
        path.strongHouses[0] !== path.strongHouses[1] &&
        view.assembly.problem.symbols.includes(path.symbol),
      "invalid-short-path",
    );
    const [a, b, c, d] = path.vertices;
    path.vertices.forEach((v) => {
      distinct(v, 1, er ? 3 : 1, view);
      sorted(v);
    });
    requireProof(
      new Set(path.vertices.flat()).size === path.vertices.flat().length,
      "repeated-path-vertex",
    );
    if (er) {
      const h = house(view, path.strongHouses[0]),
        intersection = path.emptyIntersection!;
      requireProof(
        h.cells.every((x) => box(x) === box(h.cells[0])) &&
          h.cells.includes(intersection) &&
          !current(view, pos(intersection, path.symbol)) &&
          ((a.every((x) => row(x) === row(intersection)) &&
            b.every((x) => column(x) === column(intersection))) ||
            (b.every((x) => row(x) === row(intersection)) &&
              a.every((x) => column(x) === column(intersection)))) &&
          c.length === 1 &&
          d.length === 1,
        "invalid-empty-rectangle",
      );
    }
    const h0 = house(view, path.strongHouses[0]),
      h1 = house(view, path.strongHouses[1]);
    const orientation = (cells: readonly number[]) =>
      cells.every((x) => row(x) === row(cells[0]))
        ? "row"
        : cells.every((x) => column(x) === column(cells[0]))
          ? "column"
          : "box";
    if (er) requireProof(orientation(h1.cells) !== "box", "invalid-empty-rectangle-line");
    if (p.alias === "Skyscraper")
      requireProof(
        orientation(h0.cells) !== "box" && orientation(h0.cells) === orientation(h1.cells),
        "invalid-skyscraper",
      );
    if (p.alias === "Two-String Kite")
      requireProof(
        new Set([orientation(h0.cells), orientation(h1.cells)]).size === 2 &&
          orientation(h0.cells) !== "box" &&
          orientation(h1.cells) !== "box" &&
          box(b[0]) === box(c[0]),
        "invalid-kite",
      );
    addHouse(r, view, path.strongHouses[0], path.symbol, [a, b]);
    addHouse(r, view, path.strongHouses[1], path.symbol, [c, d]);
    b.forEach((x) => c.forEach((y) => addWeak(r, view, pos(x, path.symbol), pos(y, path.symbol))));
    const eligible = effects.filter(
      (e) =>
        e.symbol === path.symbol &&
        [...a, ...d].every(
          (cell) =>
            cell !== e.cell && conflict(view, pos(cell, path.symbol), pos(e.cell, e.symbol)),
        ),
    );
    // Each dual path proves its own roots; the proof grammar below requires its premises.
    requireProof(eligible.length > 0, "unproductive-short-root");
    eligible.forEach((e) => {
      targets(
        r,
        view,
        [e],
        [...a, ...d].map((x) => pos(x, path.symbol)),
      );
      covered.add(`${e.cell}:${e.symbol}`);
    });
    paths.push(path.vertices.map((g) => g.map((x) => pos(x, path.symbol))));
  }
  requireProof(
    p.paths.every((path) => path.symbol === p.paths[0].symbol) &&
      effects.every((e) => covered.has(`${e.cell}:${e.symbol}`)),
    "invalid-short-effects",
  );
  return { ...r, paths };
}
export function validateWingPattern(
  view: ReadView,
  p: WingPattern,
  effects: readonly Effect[],
): PatternRequirements {
  const r = requirement();
  if (p.alias === "W-Wing" && "endpoints" in p) {
    exact(p, ["alias", "endpoints", "bridge", "cover", "bridgeSymbol", "eliminationSymbol"]);
    distinct([...p.endpoints, ...p.bridge], 4, 4, view);
    requireProof(
      p.endpoints.length === 2 && p.bridge.length === 2 && p.bridgeSymbol !== p.eliminationSymbol,
      "invalid-w-wing",
    );
    const [a, d] = p.endpoints,
      [b, c] = p.bridge,
      x = p.bridgeSymbol,
      z = p.eliminationSymbol;
    requireProof(
      p.endpoints.every((cell) =>
        sameValue(
          digits(view, cell),
          [x, z].sort((a, b) => a - b),
        ),
      ),
      "invalid-wing-domain",
    );
    p.endpoints.forEach((cell) => addCell(r, view, cell));
    addHouse(r, view, p.cover, x, [[b], [c]]);
    addWeak(r, view, pos(a, x), pos(b, x));
    addWeak(r, view, pos(c, x), pos(d, x));
    targets(r, view, effects, [pos(a, z), pos(d, z)]);
    return {
      ...r,
      paths: [[[pos(a, z)], [pos(a, x)], [pos(b, x)], [pos(c, x)], [pos(d, x)], [pos(d, z)]]],
    };
  }
  requireProof("pivot" in p, "invalid-wing-pattern");
  exact(p, ["alias", "pivot", "wings", "x", "y", "z"]);
  requireProof(
    ["XY-Wing", "Y-Wing", "XYZ-Wing"].includes(p.alias) &&
      new Set([p.x, p.y, p.z]).size === 3 &&
      p.wings.length === 2,
    "invalid-wing-pattern",
  );
  distinct([p.pivot, ...p.wings], 3, 3, view);
  const pivot = [p.x, p.y, ...(p.alias === "XYZ-Wing" ? [p.z] : [])].sort((a, b) => a - b);
  requireProof(
    sameValue(digits(view, p.pivot), pivot) &&
      sameValue(
        digits(view, p.wings[0]),
        [p.x, p.z].sort((a, b) => a - b),
      ) &&
      sameValue(
        digits(view, p.wings[1]),
        [p.y, p.z].sort((a, b) => a - b),
      ),
    "invalid-wing-domain",
  );
  [p.pivot, ...p.wings].forEach((c) => addCell(r, view, c));
  addWeak(r, view, pos(p.pivot, p.x), pos(p.wings[0], p.x));
  addWeak(r, view, pos(p.pivot, p.y), pos(p.wings[1], p.y));
  targets(
    r,
    view,
    effects,
    [...p.wings, ...(p.alias === "XYZ-Wing" ? [p.pivot] : [])].map((c) => pos(c, p.z)),
  );
  return r;
}
export function validateRemotePattern(
  view: ReadView,
  p: RemotePattern,
  effects: readonly Effect[],
): PatternRequirements {
  exact(p, ["alias", "cells", "symbols", "inferenceLinks", "chute"]);
  distinct(p.cells, 4, 12, view);
  requireProof(
    p.cells.length % 2 === 0 &&
      p.inferenceLinks === 2 * p.cells.length - 1 &&
      p.inferenceLinks <= 24 &&
      p.symbols.length === 2 &&
      p.symbols[0] < p.symbols[1] &&
      p.cells.every((c) => sameValue(digits(view, c), p.symbols)),
    "invalid-remote-parity-or-domain",
  );
  if (p.alias === "Remote Pairs") requireProof(p.chute === null, "invalid-remote-alias");
  else
    requireProof(
      p.alias === "Chute Remote Pairs" &&
        (p.chute === "band" || p.chute === "stack") &&
        new Set(
          p.cells.map((c) => (p.chute === "band" ? Math.floor(c / 27) : Math.floor((c % 9) / 3))),
        ).size === 1,
      "invalid-chute",
    );
  const r = requirement(),
    paths: Literal[][][] = [];
  p.cells.forEach((c) => addCell(r, view, c));
  for (let i = 1; i < p.cells.length; i++)
    p.symbols.forEach((s) => addWeak(r, view, pos(p.cells[i - 1], s), pos(p.cells[i], s)));
  for (const symbol of p.symbols) {
    const local = effects.filter((e) => e.symbol === symbol);
    if (!local.length) continue;
    targets(r, view, local, [pos(p.cells[0], symbol), pos(p.cells.at(-1)!, symbol)]);
    paths.push(
      p.cells.flatMap((cell, i) => [
        [pos(cell, p.symbols[(p.symbols.indexOf(symbol) + i) % 2])],
        [pos(cell, p.symbols[(p.symbols.indexOf(symbol) + i + 1) % 2])],
      ]),
    );
  }
  requireProof(
    effects.length > 0 && effects.every((e) => p.symbols.includes(e.symbol)),
    "invalid-remote-effect",
  );
  return { ...r, paths };
}
export function validateBentPattern(
  view: ReadView,
  p: BentPattern,
  effects: readonly Effect[],
): PatternRequirements {
  exact(p, ["alias", "cells", "symbols", "nonrestrictedSymbol", "occurrences", "conflicts"]);
  distinct(p.cells, 4, 6, view);
  sorted(p.cells);
  sorted(p.symbols);
  requireProof(
    p.symbols.length === p.cells.length &&
      p.alias === (p.cells.length === 4 ? "WXYZ-Wing" : "Bent almost-locked subsets") &&
      p.cells.every((c) => digits(view, c).length >= 2) &&
      sameValue(
        [...new Set(p.cells.flatMap((c) => digits(view, c)))].sort((a, b) => a - b),
        p.symbols,
      ),
    "invalid-bent-size",
  );
  const occurrences = Object.fromEntries(
    p.symbols.map((s) => [s, p.cells.filter((c) => current(view, pos(c, s)))]),
  );
  requireProof(
    sameValue(p.occurrences, occurrences) && p.symbols.includes(p.nonrestrictedSymbol),
    "invalid-bent-occurrences",
  );
  requireProof(
    Array.isArray(p.conflicts) &&
      p.conflicts.every(
        (pair) => pair.length === 2 && pair[0] < pair[1] && pair.every((c) => p.cells.includes(c)),
      ) &&
      new Set(p.conflicts.map((pair) => pair.join())).size === p.conflicts.length,
    "invalid-bent-conflicts",
  );
  const actual: number[][] = [];
  for (let i = 0; i < p.cells.length; i++)
    for (let j = i + 1; j < p.cells.length; j++)
      if (
        sourceFacts(view, "all-different").some(
          (f) =>
            !f.openAssumptions.length &&
            f.proposition.kind === "all-different" &&
            f.proposition.cells.includes(p.cells[i]) &&
            f.proposition.cells.includes(p.cells[j]),
        )
      )
        actual.push([p.cells[i], p.cells[j]]);
  requireProof(sameValue(p.conflicts, actual), "incomplete-bent-conflicts");
  const conflict = (a: number, b: number) =>
    p.conflicts.some((pair) => pair.includes(a) && pair.includes(b));
  for (const s of p.symbols) {
    const occ = occurrences[s],
      pairs = occ.flatMap((a, i) => occ.slice(i + 1).map((b) => [a, b]));
    requireProof(
      s === p.nonrestrictedSymbol
        ? pairs.some(([a, b]) => !conflict(a, b))
        : pairs.every(([a, b]) => conflict(a, b)),
      "invalid-bent-restriction",
    );
  }
  const r = requirement();
  p.cells.forEach((c) => addCell(r, view, c));
  p.conflicts.forEach(([a, b]) =>
    p.symbols
      .filter((s) => current(view, pos(a, s)) && current(view, pos(b, s)))
      .forEach((s) => addWeak(r, view, pos(a, s), pos(b, s))),
  );
  targets(
    r,
    view,
    effects,
    occurrences[p.nonrestrictedSymbol].map((c) => pos(c, p.nonrestrictedSymbol)),
  );
  return { ...r, table: p };
}

/** Independent admission: no detector, registry, builder, index, or exact solver imports. */
export function checkPatternProof(
  proposal: DeductionProposal,
  view: ReadView,
  available: ReadonlyMap<number, ProofNode>,
): void {
  const p = proposal.pattern as unknown;
  requireProof(
    p !== null && typeof p === "object" && !Array.isArray(p),
    "invalid-technique-pattern",
  );
  const r =
    proposal.technique === "c10@1"
      ? validateShortPattern(view, p as ShortPattern, proposal.effects)
      : proposal.technique === "c11@1"
        ? validateWingPattern(view, p as WingPattern, proposal.effects)
        : proposal.technique === "c12@1"
          ? validateBentPattern(view, p as BentPattern, proposal.effects)
          : validateRemotePattern(view, p as RemotePattern, proposal.effects);
  const permittedClauses = new Set(r.clauses.map((c) => JSON.stringify(clause(c.literals))));
  const seenClauses = new Set<string>(),
    vocabulary = new Set(
      [...r.vocabulary, ...proposal.effects.map((e) => pos(e.cell, e.symbol))].map(
        (l) => `${l.cell}:${l.symbol}`,
      ),
    );
  const relationCells = new Set<number>();
  const allowedPairs = r.clauses.filter((c) => c.source === "weak").map((c) => c.literals);
  for (const id of proposal.proof.imports) {
    const fact = view.facts.get(id);
    requireProof(fact && fact.openAssumptions.length === 0, "invalid-pattern-import");
    const q = fact.proposition;
    if (q.kind === "relation") {
      requireProof(
        allowedPairs.some((pair) => pair.every((l) => q.cells.includes(l.cell))),
        "outside-relation-grammar",
      );
      q.cells.forEach((c) => relationCells.add(c));
    }
  }
  const tableCells = new Set([...(r.table?.cells ?? []), ...relationCells]);
  const signatures = new Set<string>();
  for (const node of proposal.proof.nodes) {
    requireProof(node.scope.length === 0, "outside-technique-grammar");
    const sig = JSON.stringify([node.rule, node.premises, node.conclusion, node.parameters]);
    requireProof(!signatures.has(sig), "redundant-technique-work");
    signatures.add(sig);
    const q = node.conclusion,
      premises = node.premises.map((id) => available.get(id)!);
    if (node.rule === "weak-link@1" || node.rule === "cover-clause@1") {
      const key = JSON.stringify(q);
      requireProof(permittedClauses.has(key), "outside-pattern-clause");
      seenClauses.add(key);
      if (node.rule === "cover-clause@1")
        requireProof(
          premises[0]?.rule === "support@1" ||
            r.clauses.some(
              (c) =>
                c.source === "cell" &&
                node.premises[0] === view.state.domainFacts[c.cells![0]] &&
                sameValue(q, clause(c.literals)),
            ),
          "outside-pattern-domain",
        );
    } else if (node.rule === "support@1") {
      const source = premises[0]?.conclusion;
      requireProof(
        source?.kind === "cover" &&
          r.clauses.some(
            (c) =>
              c.source === "house" &&
              c.symbol === source.symbol &&
              sameValue(c.cells, source.cells),
          ) &&
          sameValue(
            node.premises.slice(1),
            source.cells.map((c) => view.state.domainFacts[c]),
          ),
        "outside-pattern-support",
      );
    } else if (node.rule === "resolution@1") {
      requireProof(
        literals(q).every((l) => vocabulary.has(`${l.cell}:${l.symbol}`)) &&
          premises.every((n) => !view.facts.has(n.id)),
        "outside-pattern-resolution",
      );
    } else if (node.rule === "domain-restrict@1") {
      requireProof(
        q.kind === "domain" &&
          proposal.effects.some((e) => e.cell === q.cell) &&
          premises[1]?.conclusion.kind === "literal" &&
          proposal.effects.some((e) =>
            sameValue(premises[1].conclusion, { kind: "literal", value: neg(e.cell, e.symbol) }),
          ) &&
          (node.premises[0] === view.state.domainFacts[q.cell] ||
            premises[0]?.rule === "domain-restrict@1"),
        "outside-domain-closure",
      );
    } else if (node.rule === "all-different-subset@1") {
      requireProof(
        r.table &&
          q.kind === "all-different" &&
          q.cells.length === 2 &&
          r.table.conflicts.some((pair) => sameValue(pair, q.cells)),
        "outside-local-conflict",
      );
    } else if (node.rule === "table-filter@1") {
      const params = node.parameters as { cells: number[]; box: number[] };
      requireProof(
        q.kind === "table" &&
          q.cells.every((c) => tableCells.has(c)) &&
          ((r.table && sameValue(q.cells, r.table.cells)) || q.cells.length === 1) &&
          premises.every((n) =>
            n.conclusion.kind === "all-different"
              ? n.rule === "all-different-subset@1"
              : n.conclusion.kind === "domain" &&
                node.premises.includes(view.state.domainFacts[n.conclusion.cell]),
          ) &&
          params.cells.length === q.cells.length,
        "outside-pattern-table",
      );
    } else if (node.rule === "table-union@1" || node.rule === "table-join@1") {
      requireProof(
        q.kind === "table" && q.cells.every((c) => tableCells.has(c)),
        "outside-pattern-table",
      );
    } else if (node.rule === "table-project@1") {
      const key = JSON.stringify(q),
        bent =
          r.table &&
          clause(
            r.table.occurrences[r.table.nonrestrictedSymbol].map((c) =>
              pos(c, r.table!.nonrestrictedSymbol),
            ),
          );
      if (bent && sameValue(q, bent))
        requireProof(
          premises[0]?.conclusion.kind === "table" && premises[0].conclusion.count > 0,
          "empty-local-pattern",
        );
      requireProof(
        permittedClauses.has(key) || (bent && sameValue(q, bent)),
        "outside-pattern-projection",
      );
      seenClauses.add(key);
    } else requireProof(false, "outside-technique-grammar");
  }
  // A named label cannot hide an unrelated inference: every designated cell/house
  // cover must occur, and effects must be reached from these elementary clauses.
  for (const c of r.clauses.filter((c) => c.source !== "weak"))
    if (!r.table)
      requireProof(seenClauses.has(JSON.stringify(clause(c.literals))), "missing-pattern-premise");
  if (r.table) requireBentEffectLineage(proposal, view, available, r.table);
  if (proposal.technique === "c10@1" && (p as ShortPattern).alias === "Dual Empty Rectangle")
    requireDualRootLineage(proposal, view, available, p as ShortPattern);
  requireProof(
    proposal.proof.nodes.length <= 512 + proposal.effects.length * 160,
    "technique-work-bound",
  );
}
