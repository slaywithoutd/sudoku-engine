import { preparedSources, sourceFacts } from "../state/source-index";
import type { ReadView, Literal } from "../state/types";
import type { DeductionProposal, Effect, ProofNode } from "../proof/types";
import { clause, literals, requireProof, sameValue } from "../proof/primitives";
import { requireBentEffectLineage, requireDualRootLineage } from "./pattern-proof-lineage";
import { findHouse, symbolMask } from "../state/read";
import { defined } from "../invariants";

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
  view.assembly.problem.symbols.filter((symbol) => view.state.domains[cell] & symbolMask(symbol));
export const row = (cell: number) => Math.floor(cell / 9),
  column = (cell: number) => cell % 9,
  box = (cell: number) => Math.floor(cell / 27) * 3 + Math.floor((cell % 9) / 3);
/** Empty-corner labels do not create another inference with the same vertices and covers. */
export function shortPathIdentity(view: ReadView, path: ShortPath): string {
  return JSON.stringify({
    symbol: path.symbol,
    vertices: path.vertices,
    strongScopes: path.strongHouses.map((id) => findHouse(view, id)?.cells ?? null),
  });
}
function exact(pattern: object, keys: string[]) {
  requireProof(sameValue(Object.keys(pattern).sort(), keys.sort()), "invalid-technique-pattern");
}
function distinct(cells: number[], min: number, max: number, view: ReadView) {
  requireProof(
    Array.isArray(cells) &&
      cells.length >= min &&
      cells.length <= max &&
      new Set(cells).size === cells.length &&
      cells.every(
        (cell) =>
          Number.isSafeInteger(cell) &&
          view.assembly.problem.cells.includes(cell) &&
          !view.state.values[cell],
      ),
    "pattern-out-of-profile",
  );
}
function sorted(values: number[]) {
  requireProof(
    values.every((value, i) => !i || value > values[i - 1]),
    "invalid-pattern-order",
  );
}
function house(view: ReadView, id: string) {
  const scope = findHouse(view, id);
  requireProof(scope && scope.cells.length === 9, "invalid-pattern-house");
  return scope;
}
function current(view: ReadView, literal: Literal) {
  return !!(view.state.domains[literal.cell] & symbolMask(literal.symbol));
}
function requirement(): PatternRequirements {
  return { clauses: [], vocabulary: [], paths: [] };
}
export function conflict(view: ReadView, left: Literal, right: Literal): boolean {
  if (left.cell === right.cell) return left.symbol !== right.symbol;
  const prepared = preparedSources(view, "complete");
  if (prepared) return !!prepared.conflictSource(left, right);
  for (const fact of view.facts.values()) {
    if (fact.openAssumptions.length) continue;
    const proposition = fact.proposition;
    if (
      proposition.kind === "all-different" &&
      left.symbol === right.symbol &&
      proposition.cells.includes(left.cell) &&
      proposition.cells.includes(right.cell)
    )
      return true;
    if (
      proposition.kind === "relation" &&
      proposition.cells.includes(left.cell) &&
      proposition.cells.includes(right.cell) &&
      !proposition.tuples.some(
        (tuple) =>
          tuple[proposition.cells.indexOf(left.cell)] === left.symbol &&
          tuple[proposition.cells.indexOf(right.cell)] === right.symbol &&
          proposition.cells.every((cell, i) => view.state.domains[cell] & symbolMask(tuple[i])),
      )
    )
      return true;
  }
  return false;
}
function addWeak(requirements: PatternRequirements, view: ReadView, left: Literal, right: Literal) {
  requireProof(conflict(view, left, right), "missing-pattern-conflict");
  requireProof(left.cell !== right.cell || left.symbol !== right.symbol, "self-conflict");
  requirements.clauses.push({
    source: "weak",
    literals: [
      { ...left, positive: false },
      { ...right, positive: false },
    ],
  });
  requirements.vocabulary.push(left, right);
}
function addCell(requirements: PatternRequirements, view: ReadView, cell: number) {
  const values = digits(view, cell).map((symbol) => pos(cell, symbol));
  requirements.clauses.push({ source: "cell", cells: [cell], literals: values });
  requirements.vocabulary.push(...values);
}
function addHouse(
  requirements: PatternRequirements,
  view: ReadView,
  id: string,
  symbol: number,
  groups: number[][],
) {
  const scope = house(view, id),
    expected = scope.cells.filter((cell) => current(view, pos(cell, symbol)));
  requireProof(
    sameValue(
      [...groups.flat()].sort((left, right) => left - right),
      expected,
    ),
    "nonexhaustive-strong-link",
  );
  const values = expected.map((cell) => pos(cell, symbol));
  requirements.clauses.push({ source: "house", cells: scope.cells, symbol, literals: values });
  requirements.vocabulary.push(...values);
}
function targets(
  requirements: PatternRequirements,
  view: ReadView,
  effects: readonly Effect[],
  occurrences: Literal[],
) {
  requireProof(effects.length > 0, "unproductive-pattern");
  for (const effect of effects) {
    requireProof(
      effect.kind === "remove" &&
        !view.state.values[effect.cell] &&
        current(view, pos(effect.cell, effect.symbol)) &&
        occurrences.every(
          (literal) => literal.symbol === effect.symbol && literal.cell !== effect.cell,
        ),
      "invalid-pattern-effect",
    );
    occurrences.forEach((literal) =>
      addWeak(requirements, view, literal, pos(effect.cell, effect.symbol)),
    );
  }
}
/** C10 counts three internal links. ER arm membership is exhaustive, not a guessed group. */
export function validateShortPattern(
  view: ReadView,
  pattern: ShortPattern,
  effects: readonly Effect[],
): PatternRequirements {
  exact(pattern, ["alias", "paths"]);
  requireProof(
    [
      "Turbot Fish",
      "Skyscraper",
      "Two-String Kite",
      "Empty Rectangle",
      "Dual Empty Rectangle",
    ].includes(pattern.alias),
    "unknown-alias",
  );
  requireProof(
    Array.isArray(pattern.paths) &&
      pattern.paths.length === (pattern.alias === "Dual Empty Rectangle" ? 2 : 1),
    "invalid-short-paths",
  );
  requireProof(
    new Set(pattern.paths.map((path) => shortPathIdentity(view, path))).size ===
      pattern.paths.length,
    "duplicate-short-root",
  );
  const requirements = requirement(),
    paths: Literal[][][] = [];
  const covered = new Set<string>();
  for (const path of pattern.paths) {
    const er = pattern.alias.includes("Empty Rectangle");
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
    const [cellA, cellB, cellC, cellD] = path.vertices;
    path.vertices.forEach((value) => {
      distinct(value, 1, er ? 3 : 1, view);
      sorted(value);
    });
    requireProof(
      new Set(path.vertices.flat()).size === path.vertices.flat().length,
      "repeated-path-vertex",
    );
    if (er) {
      const scope = house(view, path.strongHouses[0]),
        intersection = defined(path.emptyIntersection, "emptyIntersection");
      requireProof(
        scope.cells.every((x) => box(x) === box(scope.cells[0])) &&
          scope.cells.includes(intersection) &&
          !current(view, pos(intersection, path.symbol)) &&
          ((cellA.every((x) => row(x) === row(intersection)) &&
            cellB.every((x) => column(x) === column(intersection))) ||
            (cellB.every((x) => row(x) === row(intersection)) &&
              cellA.every((x) => column(x) === column(intersection)))) &&
          cellC.length === 1 &&
          cellD.length === 1,
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
    if (pattern.alias === "Skyscraper")
      requireProof(
        orientation(h0.cells) !== "box" && orientation(h0.cells) === orientation(h1.cells),
        "invalid-skyscraper",
      );
    if (pattern.alias === "Two-String Kite")
      requireProof(
        new Set([orientation(h0.cells), orientation(h1.cells)]).size === 2 &&
          orientation(h0.cells) !== "box" &&
          orientation(h1.cells) !== "box" &&
          box(cellB[0]) === box(cellC[0]),
        "invalid-kite",
      );
    addHouse(requirements, view, path.strongHouses[0], path.symbol, [cellA, cellB]);
    addHouse(requirements, view, path.strongHouses[1], path.symbol, [cellC, cellD]);
    cellB.forEach((x) =>
      cellC.forEach((y) => addWeak(requirements, view, pos(x, path.symbol), pos(y, path.symbol))),
    );
    const eligible = effects.filter(
      (effect) =>
        effect.symbol === path.symbol &&
        [...cellA, ...cellD].every(
          (cell) =>
            cell !== effect.cell &&
            conflict(view, pos(cell, path.symbol), pos(effect.cell, effect.symbol)),
        ),
    );
    // Each dual path proves its own roots; the proof grammar below requires its premises.
    requireProof(eligible.length > 0, "unproductive-short-root");
    eligible.forEach((effect) => {
      targets(
        requirements,
        view,
        [effect],
        [...cellA, ...cellD].map((x) => pos(x, path.symbol)),
      );
      covered.add(`${effect.cell}:${effect.symbol}`);
    });
    paths.push(path.vertices.map((group) => group.map((x) => pos(x, path.symbol))));
  }
  requireProof(
    pattern.paths.every((path) => path.symbol === pattern.paths[0].symbol) &&
      effects.every((effect) => covered.has(`${effect.cell}:${effect.symbol}`)),
    "invalid-short-effects",
  );
  return { ...requirements, paths };
}
export function validateWingPattern(
  view: ReadView,
  pattern: WingPattern,
  effects: readonly Effect[],
): PatternRequirements {
  const requirements = requirement();
  if (pattern.alias === "W-Wing" && "endpoints" in pattern) {
    exact(pattern, ["alias", "endpoints", "bridge", "cover", "bridgeSymbol", "eliminationSymbol"]);
    distinct([...pattern.endpoints, ...pattern.bridge], 4, 4, view);
    requireProof(
      pattern.endpoints.length === 2 &&
        pattern.bridge.length === 2 &&
        pattern.bridgeSymbol !== pattern.eliminationSymbol,
      "invalid-w-wing",
    );
    const [cellA, cellD] = pattern.endpoints,
      [cellB, cellC] = pattern.bridge,
      x = pattern.bridgeSymbol,
      zDigit = pattern.eliminationSymbol;
    requireProof(
      pattern.endpoints.every((cell) =>
        sameValue(
          digits(view, cell),
          [x, zDigit].sort((left, right) => left - right),
        ),
      ),
      "invalid-wing-domain",
    );
    pattern.endpoints.forEach((cell) => addCell(requirements, view, cell));
    addHouse(requirements, view, pattern.cover, x, [[cellB], [cellC]]);
    addWeak(requirements, view, pos(cellA, x), pos(cellB, x));
    addWeak(requirements, view, pos(cellC, x), pos(cellD, x));
    targets(requirements, view, effects, [pos(cellA, zDigit), pos(cellD, zDigit)]);
    return {
      ...requirements,
      paths: [
        [
          [pos(cellA, zDigit)],
          [pos(cellA, x)],
          [pos(cellB, x)],
          [pos(cellC, x)],
          [pos(cellD, x)],
          [pos(cellD, zDigit)],
        ],
      ],
    };
  }
  requireProof("pivot" in pattern, "invalid-wing-pattern");
  exact(pattern, ["alias", "pivot", "wings", "x", "y", "z"]);
  requireProof(
    ["XY-Wing", "Y-Wing", "XYZ-Wing"].includes(pattern.alias) &&
      new Set([pattern.x, pattern.y, pattern.z]).size === 3 &&
      pattern.wings.length === 2,
    "invalid-wing-pattern",
  );
  distinct([pattern.pivot, ...pattern.wings], 3, 3, view);
  const pivot = [pattern.x, pattern.y, ...(pattern.alias === "XYZ-Wing" ? [pattern.z] : [])].sort(
    (left, right) => left - right,
  );
  requireProof(
    sameValue(digits(view, pattern.pivot), pivot) &&
      sameValue(
        digits(view, pattern.wings[0]),
        [pattern.x, pattern.z].sort((left, right) => left - right),
      ) &&
      sameValue(
        digits(view, pattern.wings[1]),
        [pattern.y, pattern.z].sort((left, right) => left - right),
      ),
    "invalid-wing-domain",
  );
  [pattern.pivot, ...pattern.wings].forEach((cell) => addCell(requirements, view, cell));
  addWeak(requirements, view, pos(pattern.pivot, pattern.x), pos(pattern.wings[0], pattern.x));
  addWeak(requirements, view, pos(pattern.pivot, pattern.y), pos(pattern.wings[1], pattern.y));
  targets(
    requirements,
    view,
    effects,
    [...pattern.wings, ...(pattern.alias === "XYZ-Wing" ? [pattern.pivot] : [])].map((cell) =>
      pos(cell, pattern.z),
    ),
  );
  return requirements;
}
export function validateRemotePattern(
  view: ReadView,
  pattern: RemotePattern,
  effects: readonly Effect[],
): PatternRequirements {
  exact(pattern, ["alias", "cells", "symbols", "inferenceLinks", "chute"]);
  distinct(pattern.cells, 4, 12, view);
  requireProof(
    pattern.cells.length % 2 === 0 &&
      pattern.inferenceLinks === 2 * pattern.cells.length - 1 &&
      pattern.inferenceLinks <= 24 &&
      pattern.symbols.length === 2 &&
      pattern.symbols[0] < pattern.symbols[1] &&
      pattern.cells.every((cell) => sameValue(digits(view, cell), pattern.symbols)),
    "invalid-remote-parity-or-domain",
  );
  if (pattern.alias === "Remote Pairs")
    requireProof(pattern.chute === null, "invalid-remote-alias");
  else
    requireProof(
      pattern.alias === "Chute Remote Pairs" &&
        (pattern.chute === "band" || pattern.chute === "stack") &&
        new Set(
          pattern.cells.map((cell) =>
            pattern.chute === "band" ? Math.floor(cell / 27) : Math.floor((cell % 9) / 3),
          ),
        ).size === 1,
      "invalid-chute",
    );
  const requirements = requirement(),
    paths: Literal[][][] = [];
  pattern.cells.forEach((cell) => addCell(requirements, view, cell));
  for (let i = 1; i < pattern.cells.length; i++)
    pattern.symbols.forEach((symbol) =>
      addWeak(requirements, view, pos(pattern.cells[i - 1], symbol), pos(pattern.cells[i], symbol)),
    );
  for (const symbol of pattern.symbols) {
    const local = effects.filter((effect) => effect.symbol === symbol);
    if (!local.length) continue;
    targets(requirements, view, local, [
      pos(pattern.cells[0], symbol),
      pos(defined(pattern.cells.at(-1), "cell"), symbol),
    ]);
    paths.push(
      pattern.cells.flatMap((cell, i) => [
        [pos(cell, pattern.symbols[(pattern.symbols.indexOf(symbol) + i) % 2])],
        [pos(cell, pattern.symbols[(pattern.symbols.indexOf(symbol) + i + 1) % 2])],
      ]),
    );
  }
  requireProof(
    effects.length > 0 && effects.every((effect) => pattern.symbols.includes(effect.symbol)),
    "invalid-remote-effect",
  );
  return { ...requirements, paths };
}
export function validateBentPattern(
  view: ReadView,
  pattern: BentPattern,
  effects: readonly Effect[],
): PatternRequirements {
  exact(pattern, ["alias", "cells", "symbols", "nonrestrictedSymbol", "occurrences", "conflicts"]);
  distinct(pattern.cells, 4, 6, view);
  sorted(pattern.cells);
  sorted(pattern.symbols);
  requireProof(
    pattern.symbols.length === pattern.cells.length &&
      pattern.alias === (pattern.cells.length === 4 ? "WXYZ-Wing" : "Bent almost-locked subsets") &&
      pattern.cells.every((cell) => digits(view, cell).length >= 2) &&
      sameValue(
        [...new Set(pattern.cells.flatMap((cell) => digits(view, cell)))].sort(
          (left, right) => left - right,
        ),
        pattern.symbols,
      ),
    "invalid-bent-size",
  );
  const occurrences = Object.fromEntries(
    pattern.symbols.map((symbol) => [
      symbol,
      pattern.cells.filter((cell) => current(view, pos(cell, symbol))),
    ]),
  );
  requireProof(
    sameValue(pattern.occurrences, occurrences) &&
      pattern.symbols.includes(pattern.nonrestrictedSymbol),
    "invalid-bent-occurrences",
  );
  requireProof(
    Array.isArray(pattern.conflicts) &&
      pattern.conflicts.every(
        (pair) =>
          pair.length === 2 &&
          pair[0] < pair[1] &&
          pair.every((cell) => pattern.cells.includes(cell)),
      ) &&
      new Set(pattern.conflicts.map((pair) => pair.join())).size === pattern.conflicts.length,
    "invalid-bent-conflicts",
  );
  const actual: number[][] = [];
  for (let i = 0; i < pattern.cells.length; i++)
    for (let j = i + 1; j < pattern.cells.length; j++)
      if (
        sourceFacts(view, "all-different").some(
          (fact) =>
            !fact.openAssumptions.length &&
            fact.proposition.kind === "all-different" &&
            fact.proposition.cells.includes(pattern.cells[i]) &&
            fact.proposition.cells.includes(pattern.cells[j]),
        )
      )
        actual.push([pattern.cells[i], pattern.cells[j]]);
  requireProof(sameValue(pattern.conflicts, actual), "incomplete-bent-conflicts");
  const conflict = (left: number, right: number) =>
    pattern.conflicts.some((pair) => pair.includes(left) && pair.includes(right));
  for (const symbol of pattern.symbols) {
    const occ = occurrences[symbol],
      pairs = occ.flatMap((left, i) => occ.slice(i + 1).map((right) => [left, right]));
    requireProof(
      symbol === pattern.nonrestrictedSymbol
        ? pairs.some(([left, right]) => !conflict(left, right))
        : pairs.every(([left, right]) => conflict(left, right)),
      "invalid-bent-restriction",
    );
  }
  const requirements = requirement();
  pattern.cells.forEach((cell) => addCell(requirements, view, cell));
  pattern.conflicts.forEach(([left, right]) =>
    pattern.symbols
      .filter((symbol) => current(view, pos(left, symbol)) && current(view, pos(right, symbol)))
      .forEach((symbol) => addWeak(requirements, view, pos(left, symbol), pos(right, symbol))),
  );
  targets(
    requirements,
    view,
    effects,
    occurrences[pattern.nonrestrictedSymbol].map((cell) => pos(cell, pattern.nonrestrictedSymbol)),
  );
  return { ...requirements, table: pattern };
}

/** Independent admission: no detector, registry, builder, index, or exact solver imports. */
export function checkPatternProof(
  proposal: DeductionProposal,
  view: ReadView,
  available: ReadonlyMap<number, ProofNode>,
): void {
  const pattern = proposal.pattern as unknown;
  requireProof(
    pattern !== null && typeof pattern === "object" && !Array.isArray(pattern),
    "invalid-technique-pattern",
  );
  const requirements =
    proposal.technique === "c10@1"
      ? validateShortPattern(view, pattern as ShortPattern, proposal.effects)
      : proposal.technique === "c11@1"
        ? validateWingPattern(view, pattern as WingPattern, proposal.effects)
        : proposal.technique === "c12@1"
          ? validateBentPattern(view, pattern as BentPattern, proposal.effects)
          : validateRemotePattern(view, pattern as RemotePattern, proposal.effects);
  const permittedClauses = new Set(
    requirements.clauses.map((req) => JSON.stringify(clause(req.literals))),
  );
  const seenClauses = new Set<string>(),
    vocabulary = new Set(
      [
        ...requirements.vocabulary,
        ...proposal.effects.map((effect) => pos(effect.cell, effect.symbol)),
      ].map((literal) => `${literal.cell}:${literal.symbol}`),
    );
  const relationCells = new Set<number>();
  const allowedPairs = requirements.clauses
    .filter((req) => req.source === "weak")
    .map((req) => req.literals);
  for (const id of proposal.proof.imports) {
    const fact = view.facts.get(id);
    requireProof(fact && fact.openAssumptions.length === 0, "invalid-pattern-import");
    const proposition = fact.proposition;
    if (proposition.kind === "relation") {
      requireProof(
        allowedPairs.some((pair) =>
          pair.every((literal) => proposition.cells.includes(literal.cell)),
        ),
        "outside-relation-grammar",
      );
      proposition.cells.forEach((cell) => relationCells.add(cell));
    }
  }
  const tableCells = new Set([...(requirements.table?.cells ?? []), ...relationCells]);
  const signatures = new Set<string>();
  for (const node of proposal.proof.nodes) {
    requireProof(node.scope.length === 0, "outside-technique-grammar");
    const sig = JSON.stringify([node.rule, node.premises, node.conclusion, node.parameters]);
    requireProof(!signatures.has(sig), "redundant-technique-work");
    signatures.add(sig);
    const proposition = node.conclusion,
      premises = node.premises.map((id) => defined(available.get(id), "available"));
    if (node.rule === "weak-link@1" || node.rule === "cover-clause@1") {
      const key = JSON.stringify(proposition);
      requireProof(permittedClauses.has(key), "outside-pattern-clause");
      seenClauses.add(key);
      if (node.rule === "cover-clause@1")
        requireProof(
          premises[0]?.rule === "support@1" ||
            requirements.clauses.some(
              (req) =>
                req.source === "cell" &&
                node.premises[0] === view.state.domainFacts[defined(req.cells, "cells")[0]] &&
                sameValue(proposition, clause(req.literals)),
            ),
          "outside-pattern-domain",
        );
    } else if (node.rule === "support@1") {
      const source = premises.at(0)?.conclusion;
      requireProof(
        source?.kind === "cover" &&
          requirements.clauses.some(
            (req) =>
              req.source === "house" &&
              req.symbol === source.symbol &&
              sameValue(req.cells, source.cells),
          ) &&
          sameValue(
            node.premises.slice(1),
            source.cells.map((cell) => view.state.domainFacts[cell]),
          ),
        "outside-pattern-support",
      );
    } else if (node.rule === "resolution@1") {
      requireProof(
        literals(proposition).every((literal) =>
          vocabulary.has(`${literal.cell}:${literal.symbol}`),
        ) && premises.every((n) => !view.facts.has(n.id)),
        "outside-pattern-resolution",
      );
    } else if (node.rule === "domain-restrict@1") {
      requireProof(
        proposition.kind === "domain" &&
          proposal.effects.some((effect) => effect.cell === proposition.cell) &&
          premises[1]?.conclusion.kind === "literal" &&
          proposal.effects.some((effect) =>
            sameValue(premises[1].conclusion, {
              kind: "literal",
              value: neg(effect.cell, effect.symbol),
            }),
          ) &&
          (node.premises[0] === view.state.domainFacts[proposition.cell] ||
            premises[0]?.rule === "domain-restrict@1"),
        "outside-domain-closure",
      );
    } else if (node.rule === "all-different-subset@1") {
      requireProof(
        requirements.table &&
          proposition.kind === "all-different" &&
          proposition.cells.length === 2 &&
          requirements.table.conflicts.some((pair) => sameValue(pair, proposition.cells)),
        "outside-local-conflict",
      );
    } else if (node.rule === "table-filter@1") {
      const params = node.parameters as { cells: number[]; box: number[] };
      requireProof(
        proposition.kind === "table" &&
          proposition.cells.every((cell) => tableCells.has(cell)) &&
          ((requirements.table && sameValue(proposition.cells, requirements.table.cells)) ||
            proposition.cells.length === 1) &&
          premises.every((n) =>
            n.conclusion.kind === "all-different"
              ? n.rule === "all-different-subset@1"
              : n.conclusion.kind === "domain" &&
                node.premises.includes(view.state.domainFacts[n.conclusion.cell]),
          ) &&
          params.cells.length === proposition.cells.length,
        "outside-pattern-table",
      );
    } else if (node.rule === "table-union@1" || node.rule === "table-join@1") {
      requireProof(
        proposition.kind === "table" && proposition.cells.every((cell) => tableCells.has(cell)),
        "outside-pattern-table",
      );
    } else if (node.rule === "table-project@1") {
      const key = JSON.stringify(proposition),
        bent =
          requirements.table &&
          clause(
            requirements.table.occurrences[requirements.table.nonrestrictedSymbol].map((cell) =>
              pos(cell, defined(requirements.table, "table").nonrestrictedSymbol),
            ),
          );
      if (bent && sameValue(proposition, bent))
        requireProof(
          premises[0]?.conclusion.kind === "table" && premises[0].conclusion.count > 0,
          "empty-local-pattern",
        );
      requireProof(
        permittedClauses.has(key) || (bent && sameValue(proposition, bent)),
        "outside-pattern-projection",
      );
      seenClauses.add(key);
    } else requireProof(false, "outside-technique-grammar");
  }
  // A named label cannot hide an unrelated inference: every designated cell/house
  // cover must occur, and effects must be reached from these elementary clauses.
  for (const req of requirements.clauses.filter((item) => item.source !== "weak"))
    if (!requirements.table)
      requireProof(
        seenClauses.has(JSON.stringify(clause(req.literals))),
        "missing-pattern-premise",
      );
  if (requirements.table) requireBentEffectLineage(proposal, view, available, requirements.table);
  if (proposal.technique === "c10@1" && (pattern as ShortPattern).alias === "Dual Empty Rectangle")
    requireDualRootLineage(proposal, view, available, pattern as ShortPattern);
  requireProof(
    proposal.proof.nodes.length <= 512 + proposal.effects.length * 160,
    "technique-work-bound",
  );
}
