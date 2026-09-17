import { uniqueSourceFacts } from "../state/source-index";
import type { ReadView, Literal } from "../state/types";
import type { DeductionProposal, ProofNode } from "../proof/types";
import { clause, requireProof, sameValue } from "../proof/primitives";
import { ForcingLineage, checkForcingRoots } from "./forcing-grammar";
import type { UniqueGeometry, UniquePlan, UniqueCertificate } from "./unique-compiler";
import { findHouse, houseCells, symbolMask } from "../state/read";
import { claimed, defined, unverified } from "../invariants";

const symbols = (mask: number): number[] =>
  Array.from({ length: 9 }, (_, i) => i + 1).filter((symbol) => mask & symbolMask(symbol));
const row = (cell: number): number => Math.floor(cell / 9),
  col = (cell: number): number => cell % 9;
const box = (cell: number): number => Math.floor(cell / 27) * 3 + Math.floor((cell % 9) / 3);
const count = (values: readonly number[]): number => new Set(values).size;
const opposite = (literal: Literal): Literal => ({ ...literal, positive: !literal.positive });
const aliases = {
  type1: "Unique Rectangle type 1",
  type2: "Unique Rectangle type 2",
  type3: "Unique Rectangle type 3",
  type4: "Unique Rectangle type 4",
  type5: "Unique Rectangle type 5",
  type6: "Unique Rectangle type 6",
  hidden: "Hidden Rectangle",
  avoidable1: "Avoidable Rectangle",
  avoidable2: "Avoidable Rectangle",
  extended: "Extended Rectangle",
  loop: "Unique Loops",
} as const;

/** Coordinate annotation is checked against declared classic house capabilities. */
function scaffold(view: ReadView): void {
  requireProof(
    view.assembly.problem.cells.length === 81 && view.assembly.problem.symbols.length === 9,
    "unique-classic-geometry",
  );
  for (const coordinate of [row, col, box])
    for (let n = 0; n < 9; n++) {
      const cells = view.assembly.problem.cells.filter((cell) => coordinate(cell) === n);
      requireProof(
        view.assembly.allDifferent.some((house) => sameValue(house.cells, cells)),
        "unique-classic-capability",
      );
    }
}

/** Named semantics are independent of production geometry enumeration and compilation. */
export function checkUniqueGeometry(
  geometry: UniqueGeometry | undefined,
  view: ReadView,
  effect: DeductionProposal["effects"][number],
): void {
  // Reject unknown forms before alias lookup: two absent values must never
  // compare equal and let a rectangle skip every named-form restriction.
  requireProof(
    geometry && (geometry.kind === "bug" || Object.hasOwn(aliases, geometry.kind)),
    "unique-named-kind",
  );
  requireProof(
    sameValue(
      Object.keys(geometry).sort(),
      [
        "row",
        "kind",
        "alias",
        "cells",
        "coreMasks",
        "permutation",
        "guardians",
        "loopOrder",
        "auxiliaryCells",
        "subsetHouse",
        "strongSymbol",
        "strongHouses",
        "causalHouses",
      ].sort(),
    ),
    "unique-geometry-fields",
  );
  scaffold(view);
  const problem = view.assembly.problem,
    cells = geometry.cells,
    domains = view.state.domains;
  requireProof(
    Array.isArray(cells) &&
      cells.length >= 4 &&
      cells.length <= 81 &&
      cells.every((cell, i) => problem.cells.includes(cell) && (!i || cell > cells[i - 1])) &&
      cells.every((cell) => !problem.givens[cell]) &&
      geometry.coreMasks.length === cells.length,
    "unique-named-cells",
  );
  const guardians = cells.flatMap((cell, i) =>
    symbols(domains[cell] & ~geometry.coreMasks[i]).map((symbol) => ({
      cell,
      symbol,
      positive: true,
    })),
  );
  requireProof(
    sameValue(geometry.guardians, guardians) && guardians.length > 0 && guardians.length <= 64,
    "unique-named-guardians",
  );
  if (geometry.kind === "bug") {
    requireProof(
      (geometry.row === "U04" &&
        ["BUG", "BUG+1"].includes(geometry.alias) &&
        guardians.length === 1) ||
        (geometry.row === "U05" &&
          ["Generalized BUG", "BUG+n"].includes(geometry.alias) &&
          guardians.length >= 2 &&
          guardians.length <= 4),
      "unique-bug-bound",
    );
    requireProof(
      geometry.permutation === null &&
        sameValue(
          cells,
          problem.cells.filter((cell) => !view.state.values[cell]),
        ) &&
        cells.every(
          (cell, i) =>
            symbols(geometry.coreMasks[i]).length === 2 &&
            (domains[cell] & geometry.coreMasks[i]) === geometry.coreMasks[i],
        ),
      "unique-bug-entire-residual",
    );
    if (geometry.row === "U04")
      requireProof(
        effect.kind === "place" &&
          effect.cell === guardians[0].cell &&
          effect.symbol === guardians[0].symbol,
        "unique-bug-plus1-effect",
      );
    return;
  }
  requireProof(geometry.alias === aliases[geometry.kind], "unique-named-alias");
  requireProof(
    geometry.coreMasks.every((mask) => mask === geometry.coreMasks[0]),
    "unique-common-core",
  );
  const core = symbols(geometry.coreMasks[0]),
    roofs = cells.filter((cell) => guardians.some((left) => left.cell === cell));
  if (geometry.kind === "loop") {
    requireProof(
      geometry.row === "U03" &&
        cells.length <= 12 &&
        cells.length % 2 === 0 &&
        core.length === 2 &&
        guardians.length <= 4 &&
        geometry.permutation === null,
      "unique-loop-bound",
    );
    requireProof(
      geometry.loopOrder.length === cells.length &&
        new Set(geometry.loopOrder).size === cells.length &&
        geometry.loopOrder.every((cell) => cells.includes(cell)),
      "unique-loop-order",
    );
    for (let i = 0; i < cells.length; i++)
      requireProof(
        view.assembly.allDifferent.some(
          (house) =>
            house.cells.includes(geometry.loopOrder[i]) &&
            house.cells.includes(geometry.loopOrder[(i + 1) % cells.length]),
        ),
        "unique-loop-edge",
      );
    for (const house of view.assembly.allDifferent) {
      const selected = house.cells.filter((cell) => cells.includes(cell));
      requireProof(
        selected.length === 0 ||
          (selected.length === 2 &&
            geometry.loopOrder.indexOf(selected[0]) % 2 !==
              geometry.loopOrder.indexOf(selected[1]) % 2),
        "unique-loop-alternation",
      );
    }
    requireProof(
      cells.every(
        (cell) =>
          !view.state.values[cell] &&
          (domains[cell] & geometry.coreMasks[0]) === geometry.coreMasks[0],
      ),
      "unique-loop-core",
    );
    return;
  }
  if (geometry.kind === "extended") {
    requireProof(
      geometry.row === "U02" &&
        cells.length === 6 &&
        core.length === 3 &&
        count(cells.map(box)) === 3 &&
        ((count(cells.map(row)) === 2 && count(cells.map(col)) === 3) ||
          (count(cells.map(row)) === 3 && count(cells.map(col)) === 2)) &&
        geometry.permutation?.length === 6 &&
        guardians.length <= 36 &&
        cells.every(
          (cell) =>
            !view.state.values[cell] &&
            (domains[cell] & geometry.coreMasks[0]) === geometry.coreMasks[0],
        ),
      "unique-extended-geometry",
    );
    return;
  }
  requireProof(
    cells.length === 4 &&
      count(cells.map(row)) === 2 &&
      count(cells.map(col)) === 2 &&
      count(cells.map(box)) === 2 &&
      core.length === 2 &&
      geometry.permutation === null,
    "unique-rectangle-geometry",
  );
  const avoidable = geometry.kind === "avoidable1" || geometry.kind === "avoidable2";
  requireProof(
    geometry.row === (geometry.kind.startsWith("type") ? "U01" : "U02"),
    "unique-row-kind",
  );
  if (avoidable) {
    const derived = cells.filter((cell) => view.state.values[cell]);
    requireProof(
      derived.length === (geometry.kind === "avoidable1" ? 3 : 2) &&
        derived.every((cell) => core.includes(view.state.values[cell])) &&
        roofs.length === 4 - derived.length,
      "unique-avoidable-derived",
    );
  } else
    requireProof(
      cells.every(
        (cell) =>
          !view.state.values[cell] &&
          (domains[cell] & geometry.coreMasks[0]) === geometry.coreMasks[0],
      ),
      "unique-rectangle-core",
    );
  const peers = (left: number, right: number) =>
    left !== right &&
    view.assembly.allDifferent.some(
      (house) => house.cells.includes(left) && house.cells.includes(right),
    );
  const adjacent =
    roofs.length === 2 && (row(roofs[0]) === row(roofs[1]) || col(roofs[0]) === col(roofs[1]));
  if (geometry.kind === "type1" || geometry.kind === "avoidable1")
    requireProof(
      roofs.length === 1 &&
        effect.kind === "remove" &&
        effect.cell === roofs[0] &&
        core.includes(effect.symbol),
      "unique-type1-effect",
    );
  if (["type2", "type5", "avoidable2"].includes(geometry.kind)) {
    requireProof(
      count(guardians.map((left) => left.symbol)) === 1 &&
        effect.kind === "remove" &&
        effect.symbol === guardians[0].symbol &&
        !cells.includes(effect.cell) &&
        roofs.every((cell) => peers(cell, effect.cell)),
      "unique-common-extra-effect",
    );
    if (geometry.kind === "type2") requireProof(adjacent, "unique-type2-roofs");
    if (geometry.kind === "type5")
      requireProof(roofs.length === 3 || (roofs.length === 2 && !adjacent), "unique-type5-roofs");
  }
  if (geometry.kind === "type3") {
    const extra = [...new Set(guardians.map((left) => left.symbol))].sort(
        (left, right) => left - right,
      ),
      house = findHouse(view, geometry.subsetHouse);
    requireProof(
      adjacent &&
        extra.length >= 2 &&
        extra.length <= 4 &&
        house &&
        roofs.every((cell) => house.cells.includes(cell)) &&
        geometry.auxiliaryCells.length === extra.length - 1 &&
        new Set(geometry.auxiliaryCells).size === geometry.auxiliaryCells.length &&
        geometry.auxiliaryCells.every(
          (cell) =>
            house.cells.includes(cell) &&
            !cells.includes(cell) &&
            !view.state.values[cell] &&
            symbols(domains[cell]).every((symbol) => extra.includes(symbol)),
        ) &&
        effect.kind === "remove" &&
        house.cells.includes(effect.cell) &&
        !cells.includes(effect.cell) &&
        !geometry.auxiliaryCells.includes(effect.cell) &&
        extra.includes(effect.symbol),
      "unique-virtual-subset",
    );
  }
  if (["type4", "type6", "hidden"].includes(geometry.kind)) {
    requireProof(
      core.includes(defined(geometry.strongSymbol, "strongSymbol")) &&
        geometry.strongHouses.length ===
          (geometry.kind === "type4" ? 1 : geometry.kind === "type6" ? 4 : 2) &&
        new Set(geometry.strongHouses).size === geometry.strongHouses.length,
      "unique-strong-house-count",
    );
    const houses = geometry.strongHouses.map((id) => findHouse(view, id));
    requireProof(
      houses.every(
        (house) =>
          house &&
          house.cells.filter(
            (cell) => domains[cell] & symbolMask(defined(geometry.strongSymbol, "strongSymbol")),
          ).length === 2 &&
          house.cells
            .filter(
              (cell) => domains[cell] & symbolMask(defined(geometry.strongSymbol, "strongSymbol")),
            )
            .every((cell) => cells.includes(cell)),
      ),
      "unique-strong-supports",
    );
    if (geometry.kind === "type4")
      requireProof(
        adjacent &&
          roofs.every((cell) => defined(houses[0], "houses").cells.includes(cell)) &&
          effect.kind === "remove" &&
          roofs.includes(effect.cell) &&
          core.includes(effect.symbol) &&
          effect.symbol !== geometry.strongSymbol,
        "unique-type4-effect",
      );
    if (geometry.kind === "type6") {
      const causal = geometry.causalHouses.map((id) => findHouse(view, id));
      requireProof(
        roofs.length === 2 &&
          !adjacent &&
          effect.kind === "remove" &&
          roofs.includes(effect.cell) &&
          effect.symbol === geometry.strongSymbol &&
          houses.filter((house) => count(defined(house, "house").cells.map(row)) === 1).length ===
            2 &&
          houses.filter((house) => count(defined(house, "house").cells.map(col)) === 1).length ===
            2 &&
          geometry.causalHouses.length === 2 &&
          new Set(geometry.causalHouses).size === 2 &&
          geometry.causalHouses.every((id) => geometry.strongHouses.includes(id)) &&
          (causal.every((house) => count(defined(house, "house").cells.map(row)) === 1) ||
            causal.every((house) => count(defined(house, "house").cells.map(col)) === 1)),
        "unique-type6-effect",
      );
    }
    if (geometry.kind === "hidden")
      requireProof(
        effect.kind === "remove" &&
          cells.includes(effect.cell) &&
          cells.some(
            (cell) =>
              row(cell) !== row(effect.cell) &&
              col(cell) !== col(effect.cell) &&
              domains[cell] === geometry.coreMasks[0],
          ) &&
          core.includes(effect.symbol) &&
          effect.symbol !== geometry.strongSymbol &&
          houses.every((house) => defined(house, "house").cells.includes(effect.cell)) &&
          houses.some((house) => count(defined(house, "house").cells.map(row)) === 1) &&
          houses.some((house) => count(defined(house, "house").cells.map(col)) === 1),
        "unique-hidden-effect",
      );
  }
}

/** Exact trade/case ancestry for every root; valid unrelated roots cannot decorate the name. */
export function checkUniquePattern(
  proposal: DeductionProposal,
  view: ReadView,
  available: ReadonlyMap<number, ProofNode>,
): void {
  const pattern = proposal.pattern as unknown as UniquePlan & { certificate?: UniqueCertificate };
  if (unverified(pattern.geometry)?.kind !== "type6") {
    requireProof(
      !pattern.companion && !pattern.certificate?.companion,
      "unique-unexpected-companion",
    );
    checkUniqueOne(proposal, view, available);
    return;
  }
  requireProof(
    pattern.companion && pattern.certificate?.companion && proposal.effects.length === 2,
    "unique-type6-atomic-effects",
  );
  const roofs = pattern.geometry.cells.filter((cell) =>
    pattern.geometry.guardians.some((literal) => literal.cell === cell),
  );
  requireProof(
    new Set(proposal.effects.map((effect) => effect.cell)).size === 2 &&
      proposal.effects.every(
        (effect) =>
          effect.kind === "remove" &&
          roofs.includes(effect.cell) &&
          effect.symbol === pattern.geometry.strongSymbol,
      ) &&
      sameValue(proposal.effects[1], pattern.companion.effect),
    "unique-type6-atomic-effects",
  );
  const roots = new Set<number>();
  for (const [i, effect] of proposal.effects.entries()) {
    const certificate = i ? pattern.certificate.companion : pattern.certificate,
      consequence = i ? pattern.companion.consequence : pattern.consequence;
    const domainRoots = proposal.proof.roots.filter((id) => {
      const proposition = available.get(id)?.conclusion;
      return proposition?.kind === "domain" && proposition.cell === effect.cell;
    });
    const selected = [defined(certificate, "certificate").root, ...domainRoots];
    selected.forEach((id) => roots.add(id));
    checkUniqueOne(
      {
        ...proposal,
        effects: [effect],
        pattern: { geometry: pattern.geometry, consequence, certificate } as any,
        proof: { ...proposal.proof, roots: selected },
      },
      view,
      available,
    );
  }
  requireProof(
    roots.size === proposal.proof.roots.length && proposal.proof.roots.every((id) => roots.has(id)),
    "unique-type6-extraneous-root",
  );
}

function checkUniqueOne(
  proposal: DeductionProposal,
  view: ReadView,
  available: ReadonlyMap<number, ProofNode>,
): void {
  const pattern = proposal.pattern as unknown as UniquePlan & { certificate?: UniqueCertificate },
    cert = pattern.certificate;
  requireProof(
    claimed(pattern).geometry &&
      claimed(pattern).consequence &&
      cert &&
      proposal.technique === `${pattern.geometry.row.toLowerCase()}@1` &&
      proposal.effects.length > 0,
    "unique-pattern",
  );
  checkUniqueGeometry(pattern.geometry, view, proposal.effects[0]);
  const lineage = new ForcingLineage(view, available),
    trade = lineage.node(cert.trade),
    geometry = pattern.geometry;
  requireProof(
    trade.rule === "unique-transform@1" &&
      !trade.scope.length &&
      sameValue(trade.conclusion, clause(geometry.guardians)) &&
      sameValue((trade.parameters as any).cells, geometry.cells) &&
      sameValue((trade.parameters as any).coreMasks, geometry.coreMasks) &&
      sameValue((trade.parameters as any).permutation, geometry.permutation),
    "unique-trade-lineage",
  );
  const expected = new Set(view.state.domainFacts);
  const originals = uniqueSourceFacts(view);
  requireProof(originals.length <= 1105, "proof-import-limit");
  for (const fact of originals) expected.add(fact.id);
  const leaves = new Set<number>();
  const source = (id: number, depth = 0): void => {
    requireProof(depth <= 3, "unique-source-depth");
    if (view.facts.has(id)) {
      requireProof(expected.has(id), "unique-source-substitution");
      leaves.add(id);
      return;
    }
    const node = lineage.node(id);
    requireProof(
      node.rule === "conjunction@1" && !node.scope.length && sameValue(node.parameters, {}),
      "unique-source-conjunction",
    );
    node.premises.forEach((id) => source(id, depth + 1));
  };
  trade.premises.forEach((id) => source(id));
  requireProof(
    leaves.size === expected.size && [...expected].every((id) => leaves.has(id)),
    "unique-source-incomplete",
  );
  const effect = proposal.effects[0],
    target = { cell: effect.cell, symbol: effect.symbol, positive: effect.kind === "place" };
  const root = lineage.node(cert.root);
  requireProof(!root.scope.length && sameValue(root.conclusion, clause([target])), "unique-root");
  if (pattern.consequence.kind === "denial") {
    requireProof(
      cert.branches.length === 1 && pattern.consequence.paths.length === geometry.guardians.length,
      "unique-denial-complete",
    );
    const right = cert.branches[0],
      node = lineage.node(right.assumption),
      result = lineage.node(right.result);
    requireProof(
      node.rule === "assume@1" &&
        !node.scope.length &&
        sameValue(node.conclusion, clause([opposite(target)])) &&
        right.paths.length === geometry.guardians.length,
      "unique-denial-assumption",
    );
    pattern.consequence.paths.forEach((path, i) => {
      lineage.path(node.id, path, right.paths[i], [node.id]);
      requireProof(
        sameValue(
          lineage.node(right.paths[i].end).conclusion,
          clause([opposite(geometry.guardians[i])]),
        ),
        "unique-denial-alternative",
      );
    });
    requireProof(
      new Set(right.paths.flatMap((certificate) => certificate.links)).size <= 24 &&
        result.rule === "contradiction@1" &&
        sameValue(result.premises, [
          trade.id,
          ...right.paths.map((certificate) => certificate.end),
        ]) &&
        root.rule === "discharge@1" &&
        sameValue(root.premises, [node.id, result.id]),
      "unique-denial-lineage",
    );
  } else {
    requireProof(
      claimed(pattern.consequence).kind === "cases" &&
        pattern.consequence.branches.length === geometry.guardians.length &&
        cert.branches.length === geometry.guardians.length,
      "unique-incomplete-cases",
    );
    const seen = new Set<string>();
    for (const [i, branch] of pattern.consequence.branches.entries()) {
      const certificate = cert.branches[i],
        node = lineage.node(certificate.assumption),
        result = lineage.node(certificate.result),
        key = JSON.stringify(branch.assumption);
      requireProof(
        !seen.has(key) &&
          geometry.guardians.some((v) => sameValue(v, branch.assumption)) &&
          node.rule === "assume@1" &&
          !node.scope.length &&
          sameValue(node.conclusion, clause([branch.assumption])),
        "unique-case-assumption",
      );
      seen.add(key);
      requireProof(
        branch.paths.length === (branch.result === "false" ? 2 : 1) &&
          certificate.paths.length === branch.paths.length &&
          new Set(certificate.paths.flatMap((p) => p.links)).size <= 24,
        "unique-case-bound",
      );
      branch.paths.forEach((path, j) =>
        lineage.path(node.id, path, certificate.paths[j], [node.id]),
      );
      if (branch.result === "false")
        requireProof(
          result.rule === "contradiction@1" &&
            sameValue(
              result.premises,
              certificate.paths.map((p) => p.end),
            ),
          "unique-case-contradiction",
        );
      else
        requireProof(
          result.id === certificate.paths[0].end && sameValue(branch.result, target),
          "unique-case-target",
        );
    }
    const order = pattern.consequence.branches
      .map((branch, i) => ({ b: branch, c: cert.branches[i] }))
      .sort(
        (left, right) =>
          left.b.assumption.cell - right.b.assumption.cell ||
          left.b.assumption.symbol - right.b.assumption.symbol,
      );
    requireProof(
      root.rule === "cases@1" &&
        sameValue(root.premises, [
          trade.id,
          ...order.flatMap(({ c: branch }) => [branch.assumption, branch.result]),
        ]),
      "unique-cases-lineage",
    );
  }
  // Claimed strong houses and virtual auxiliaries must participate in this root's actual derivation.
  const ancestors = new Set<number>(),
    stack = [cert.root];
  while (stack.length) {
    const id = defined(stack.pop(), "stack");
    if (ancestors.has(id)) continue;
    ancestors.add(id);
    if (!view.facts.has(id)) stack.push(...lineage.node(id).premises);
  }
  const neededHouses =
    geometry.kind === "type6"
      ? geometry.causalHouses.filter((id) => !houseCells(view, id).includes(effect.cell))
      : geometry.strongHouses;
  if (geometry.kind === "type6")
    requireProof(neededHouses.length === 1, "unique-type6-opposite-house");
  for (const id of neededHouses)
    requireProof(
      [...ancestors].some((n) => {
        const node = available.get(n),
          support = node?.rule === "cover-clause@1" ? available.get(node.premises[0]) : undefined;
        return (
          support?.rule === "support@1" &&
          support.conclusion.kind === "cover" &&
          support.conclusion.symbol === geometry.strongSymbol &&
          sameValue(view.facts.get(support.premises[0])?.proposition, {
            kind: "cover",
            cells: houseCells(view, id),
            symbol: geometry.strongSymbol,
          })
        );
      }),
      "unique-unused-strong-house",
    );
  if (geometry.kind === "type3")
    for (const cell of geometry.auxiliaryCells)
      requireProof(
        [...ancestors].some((id) => {
          const n = available.get(id);
          return (
            n?.rule === "cover-clause@1" && sameValue(n.premises, [view.state.domainFacts[cell]])
          );
        }),
        "unique-unused-auxiliary",
      );
  checkForcingRoots(proposal, view, available, cert.root);
}
