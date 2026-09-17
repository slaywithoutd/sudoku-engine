import { matchingFacts } from "../state/source-index";
import type { DeductionProposal, Effect, ProofNode } from "../proof/types";
import type { ReadView } from "../state/types";
import { domainAssertion, requireProof, sameValue } from "../proof/primitives";
import { checkPatternProof } from "./pattern-contracts";
import { checkFishPattern } from "./fish-certificate";
import { checkChainPattern } from "./chains-grammar";
import { checkColoringPattern, checkColoringPatternSteps } from "./coloring-grammar";
import { checkAlsPattern } from "./als-grammar";
import { checkSetPattern } from "./set-grammar";
import { checkForcingPattern } from "./forcing-grammar";
import { checkKrakenPattern } from "./kraken-grammar";
import { checkNetPattern } from "./nets-grammar";
import { checkGeneralizedPattern } from "./generalized-grammar";
import { checkExocetPattern } from "./exocet-grammar";
import { checkTridagonPattern } from "./tridagon-grammar";
import { checkSkPattern } from "./sk-grammar";
import { checkFireworksPattern } from "./fireworks-grammar";
import { checkOrPattern } from "./or-grammar";
import { checkTemplatePattern } from "../proof/template-cover";
import { checkUniquePattern } from "./unique-grammar";
import { findHouse, symbolMask } from "../state/read";
import { defined } from "../invariants";

function fields(pattern: Record<string, unknown>, names: string[]): void {
  requireProof(sameValue(Object.keys(pattern).sort(), names.sort()), "invalid-technique-pattern");
}
function effectsKey(effects: readonly Effect[]): string {
  return JSON.stringify(
    [...effects].sort(
      (left, right) =>
        left.cell - right.cell || left.symbol - right.symbol || left.kind.localeCompare(right.kind),
    ),
  );
}
function placement(view: ReadView, cell: number, symbol: number): Effect[] {
  const result: Effect[] = [{ kind: "place", cell, symbol }];
  const peers = new Set(
    view.assembly.allDifferent
      .filter((house) => house.cells.includes(cell))
      .flatMap((house) => house.cells),
  );
  for (const peer of peers)
    if (peer !== cell && !view.state.values[peer] && view.state.domains[peer] & symbolMask(symbol))
      result.push({ kind: "remove", cell: peer, symbol });
  return result;
}
function numbers(value: unknown): number[] {
  requireProof(
    Array.isArray(value) &&
      value.every(Number.isSafeInteger) &&
      value.every((n, i) => !i || n > value[i - 1]),
    "invalid-pattern-set",
  );
  return value;
}
function geometry(cells: readonly number[]): "box" | "line" | null {
  if (cells.length !== 9) return null;
  if (
    new Set(cells.map((cell) => Math.floor(cell / 9))).size === 1 ||
    new Set(cells.map((cell) => cell % 9)).size === 1
  )
    return "line";
  return new Set(cells.map((cell) => Math.floor(cell / 27) * 3 + Math.floor((cell % 9) / 3)))
    .size === 1
    ? "box"
    : null;
}

/** Closed grammar, with no detector/registry/builder imports or caller extensions. */
export function checkTechniqueGrammar(
  proposal: DeductionProposal,
  view: ReadView,
  available: ReadonlyMap<number, ProofNode>,
  charge?: (units: number) => void,
): void {
  requireProof(
    proposal.pattern && typeof proposal.pattern === "object" && !Array.isArray(proposal.pattern),
    "invalid-technique-pattern",
  );
  const pattern = proposal.pattern as Record<string, unknown>,
    nodes = proposal.proof.nodes,
    domains = view.state.domains;
  if (["u01@1", "u02@1", "u03@1", "u04@1", "u05@1"].includes(proposal.technique)) {
    checkUniquePattern(proposal, view, available);
    return;
  }
  for (const cell of view.assembly.problem.cells) {
    const fact = view.facts.get(view.state.domainFacts[cell]);
    requireProof(
      fact && sameValue(domainAssertion(fact.proposition), { cell, mask: domains[cell] }),
      "unproved-current-domain",
    );
  }
  if (proposal.technique === "c33@1") {
    checkTemplatePattern(proposal, view, available);
    return;
  }
  if (proposal.technique === "c31@1") {
    checkExocetPattern(proposal, view, available);
    return;
  }
  if (proposal.technique === "c32@1") {
    checkTridagonPattern(proposal, view, available);
    return;
  }
  if (proposal.technique === "c30@1") {
    checkSkPattern(proposal, view, available);
    return;
  }
  if (proposal.technique === "c29@1") {
    checkFireworksPattern(proposal, view, available);
    return;
  }
  if (["c25@1", "c26@1", "c27@1"].includes(proposal.technique)) {
    checkGeneralizedPattern(proposal, view, available);
    return;
  }
  if (proposal.technique === "c28@1") {
    checkOrPattern(proposal, view, available);
    return;
  }
  if (proposal.technique === "c22@1") {
    checkForcingPattern(proposal, view, available);
    return;
  }
  if (proposal.technique === "c24@1") {
    checkKrakenPattern(proposal, view, available);
    return;
  }
  if (proposal.technique === "c23@1") {
    checkNetPattern(proposal, view, available);
    return;
  }
  if (["c20@1", "c21@1"].includes(proposal.technique)) {
    checkSetPattern(proposal, view, available, charge);
    return;
  }
  if (["c18@1", "c19@1"].includes(proposal.technique)) {
    checkAlsPattern(proposal, view, available);
    return;
  }
  if (["c10@1", "c11@1", "c12@1", "c13@1"].includes(proposal.technique)) {
    checkPatternProof(proposal, view, available);
    return;
  }
  if (["c16@1", "c17@1"].includes(proposal.technique)) {
    checkChainPattern(proposal, view, available);
    return;
  }
  if (["c14@1", "c15@1"].includes(proposal.technique)) {
    checkColoringPattern(proposal, view, available);
    return;
  }
  if (["c06@1", "c07@1", "c08@1", "c09@1"].includes(proposal.technique)) {
    checkFishPattern(proposal, view, available);
    return;
  }
  let sourceCells: readonly number[] = [],
    symbol = 0,
    coverCells: readonly number[] | null = null;
  const allowedHall: { house: readonly number[]; cells: readonly number[] }[] = [];
  if (proposal.technique === "rule-propagation@1") {
    fields(pattern, ["kind"]);
    requireProof(
      pattern.kind === "propagation" &&
        proposal.effects.length > 0 &&
        proposal.effects.every((effect) => effect.kind === "remove"),
      "invalid-maintenance-grammar",
    );
    sourceCells = view.assembly.problem.cells.filter((cell) => view.state.values[cell] !== 0);
    for (const effect of proposal.effects)
      requireProof(
        view.assembly.allDifferent.some(
          (house) =>
            house.cells.includes(effect.cell) &&
            house.cells.some(
              (cell) => cell !== effect.cell && view.state.values[cell] === effect.symbol,
            ),
        ),
        "invalid-maintenance-effect",
      );
  } else if (proposal.technique === "c01@1" || proposal.technique === "c02@1") {
    const cell = Number(pattern.cell);
    symbol = Number(pattern.symbol);
    sourceCells = [cell];
    requireProof(
      view.assembly.problem.cells.includes(cell) &&
        view.assembly.problem.symbols.includes(symbol) &&
        !view.state.values[cell],
      "invalid-single",
    );
    if (proposal.technique === "c01@1") {
      fields(pattern, ["kind", "alias", "cell", "symbol", "house"]);
      requireProof(
        pattern.kind === "single" && domains[cell] === symbolMask(symbol),
        "invalid-single",
      );
      if (pattern.alias === "Naked Single")
        requireProof(pattern.house === null, "invalid-single-alias");
      else {
        requireProof(
          pattern.alias === "Full House" || pattern.alias === "Last Digit",
          "unknown-alias",
        );
        const house = findHouse(view, pattern.house);
        requireProof(
          house &&
            house.cells.length === view.assembly.problem.symbols.length &&
            house.cells.filter((c) => !view.state.values[c]).length === 1 &&
            house.cells.includes(cell),
          "invalid-single-alias",
        );
      }
    } else {
      fields(pattern, ["kind", "alias", "cover", "cell", "symbol"]);
      const cover = view.assembly.covers.find((c) => c.id === pattern.cover);
      requireProof(
        pattern.kind === "hidden-single" &&
          pattern.alias === "Hidden Single" &&
          cover?.symbol === symbol &&
          sameValue(
            cover.cells.filter((c) => (domains[c] & symbolMask(symbol)) !== 0),
            [cell],
          ),
        "invalid-hidden-single",
      );
      coverCells = cover.cells;
    }
    if (proposal.effects.length)
      requireProof(
        effectsKey(proposal.effects) === effectsKey(placement(view, cell, symbol)),
        "invalid-single-effects",
      );
    else {
      requireProof(
        nodes.length > 0 &&
          nodes.length <= 2 &&
          proposal.proof.roots.length === 1 &&
          sameValue(available.get(proposal.proof.roots[0])?.conclusion, {
            kind: "literal",
            value: { cell, symbol, positive: true },
          }) &&
          matchingFacts(view, { kind: "literal", value: { cell, symbol, positive: true } })
            .length === 0,
        "invalid-single-cache",
      );
    }
  } else if (proposal.technique === "c03@1") {
    fields(pattern, ["kind", "alias", "cover", "group", "symbol", "cells"]);
    const cover = view.assembly.covers.find((c) => c.id === pattern.cover),
      group = findHouse(view, pattern.group);
    sourceCells = numbers(pattern.cells);
    symbol = Number(pattern.symbol);
    requireProof(
      pattern.kind === "intersection" &&
        cover?.symbol === symbol &&
        group &&
        sourceCells.length >= 2 &&
        sourceCells.length <= 3,
      "invalid-intersection",
    );
    coverCells = cover.cells;
    const intersection = cover.cells.filter((cell) => group.cells.includes(cell));
    requireProof(
      intersection.length > 0 &&
        intersection.length < cover.cells.length &&
        intersection.length < group.cells.length &&
        sourceCells.every((cell) => intersection.includes(cell)) &&
        sameValue(
          sourceCells,
          cover.cells.filter((cell) => domains[cell] & symbolMask(symbol)),
        ),
      "invalid-intersection-support",
    );
    requireProof(
      ["Locked Candidates", "direct forms", "pointing", "claiming"].includes(String(pattern.alias)),
      "unknown-alias",
    );
    if (pattern.alias === "pointing")
      requireProof(
        geometry(cover.cells) === "box" && geometry(group.cells) === "line",
        "invalid-intersection-alias",
      );
    if (pattern.alias === "claiming")
      requireProof(
        geometry(cover.cells) === "line" && geometry(group.cells) === "box",
        "invalid-intersection-alias",
      );
    const expected = group.cells
      .filter(
        (cell) =>
          !cover.cells.includes(cell) &&
          !view.state.values[cell] &&
          domains[cell] & symbolMask(symbol),
      )
      .map((cell) => ({ kind: "remove" as const, cell, symbol }));
    requireProof(
      expected.length > 0 && effectsKey(expected) === effectsKey(proposal.effects),
      "invalid-intersection-effects",
    );
  } else if (proposal.technique === "c04@1" || proposal.technique === "c05@1") {
    const cells = numbers(pattern.cells),
      digits = numbers(pattern.symbols),
      size = cells.length;
    const locked = proposal.technique === "c05@1";
    requireProof(
      size >= 2 &&
        size <= (locked ? 3 : 4) &&
        digits.length === size &&
        cells.every(
          (cell) =>
            view.assembly.problem.cells.includes(cell) &&
            !view.state.values[cell] &&
            domains[cell] > 0,
        ) &&
        digits.every((digit) => view.assembly.problem.symbols.includes(digit)),
      "subset-out-of-profile",
    );
    const mask = digits.reduce((m, digit) => m | symbolMask(digit), 0);
    const houseIds = locked ? pattern.houses : [pattern.house];
    requireProof(
      Array.isArray(houseIds) &&
        houseIds.length === (locked ? 2 : 1) &&
        new Set(houseIds).size === houseIds.length,
      "invalid-subset-houses",
    );
    const houses = houseIds.map((id) => findHouse(view, id));
    requireProof(
      houses.every((house) => house && cells.every((cell) => house.cells.includes(cell))),
      "invalid-subset-houses",
    );
    const names: Record<number, string> = { 2: "Pair", 3: "Triple", 4: "Quad" };
    if (locked) {
      fields(pattern, ["kind", "alias", "houses", "cells", "symbols"]);
      requireProof(
        pattern.kind === "locked-subset" &&
          pattern.alias === `Locked ${names[size]}` &&
          houses.some((house) => geometry(defined(house, "house").cells) === "box") &&
          houses.some((house) => geometry(defined(house, "house").cells) === "line"),
        "invalid-locked-subset",
      );
    } else {
      fields(pattern, ["kind", "alias", "form", "house", "cells", "symbols", "complement"]);
      requireProof(
        pattern.kind === "subset" && (pattern.form === "naked" || pattern.form === "hidden"),
        "invalid-subset",
      );
      if (pattern.complement === null)
        requireProof(
          pattern.alias === `${pattern.form === "naked" ? "Naked" : "Hidden"} ${names[size]}`,
          "invalid-subset-alias",
        );
      else
        requireProof(
          defined(houses[0], "houses").cells.length === 9 &&
            pattern.complement === 9 - size &&
            pattern.alias ===
              (
                {
                  5: "complementary quintuple",
                  6: "complementary sextuple",
                  7: "complementary septuple",
                } as Record<number, string>
              )[9 - size],
          "invalid-complement-alias",
        );
    }
    const expected: Effect[] = [];
    for (const house of houses) {
      const hidden = !locked && pattern.form === "hidden";
      if (hidden)
        requireProof(
          defined(house, "house").cells.length === view.assembly.problem.symbols.length &&
            digits.every(
              (digit) =>
                view.assembly.covers.some(
                  (cover) =>
                    cover.symbol === digit && sameValue(cover.cells, defined(house, "house").cells),
                ) &&
                defined(house, "house").cells.some((cell) => domains[cell] & symbolMask(digit)),
            ) &&
            sameValue(
              defined(house, "house").cells.filter((cell) => domains[cell] & mask),
              cells,
            ),
          "invalid-hidden-subset",
        );
      else
        requireProof(
          cells.reduce((m, cell) => m | domains[cell], 0) === mask,
          "invalid-naked-subset",
        );
      const selected = hidden
        ? defined(house, "house").cells.filter((cell) => !cells.includes(cell))
        : cells;
      allowedHall.push({ house: defined(house, "house").cells, cells: selected });
      const union = selected.reduce((m, cell) => m | domains[cell], 0);
      requireProof(
        view.assembly.problem.symbols.filter((digit) => union & symbolMask(digit)).length ===
          selected.length,
        "invalid-subset-hall",
      );
      const targets = hidden
        ? cells
        : defined(house, "house").cells.filter(
            (cell) => !cells.includes(cell) && !view.state.values[cell],
          );
      const local = targets.flatMap((cell) =>
        view.assembly.problem.symbols
          .filter((digit) => domains[cell] & union & symbolMask(digit))
          .map((symbol) => ({ kind: "remove" as const, cell, symbol })),
      );
      requireProof(local.length > 0, "unproductive-subset");
      expected.push(...local);
    }
    const unique = [
      ...new Map(expected.map((effect) => [`${effect.cell}:${effect.symbol}`, effect])).values(),
    ];
    requireProof(effectsKey(unique) === effectsKey(proposal.effects), "invalid-subset-effects");
  } else requireProof(false, "unknown-technique");

  const permitted = new Set(["weak-link@1", "resolution@1", "domain-restrict@1"]);
  permitted.add("cover-clause@1");
  if (coverCells) permitted.add("support@1");
  if (allowedHall.length) permitted.add("hall@1");
  const signatures = new Set<string>();
  for (const node of nodes) {
    requireProof(permitted.has(node.rule) && node.scope.length === 0, "outside-technique-grammar");
    const signature = JSON.stringify({
      rule: node.rule,
      premises: node.premises,
      conclusion: node.conclusion,
    });
    requireProof(!signatures.has(signature), "redundant-technique-work");
    signatures.add(signature);
    const premises = node.premises.map((id) => defined(available.get(id), "available"));
    const proposition = node.conclusion;
    if (node.rule === "domain-restrict@1") {
      requireProof(
        proposition.kind === "domain" && proposal.effects.some((e) => e.cell === proposition.cell),
        "outside-domain-closure",
      );
      const base = domainAssertion(premises[0]?.conclusion),
        conclusion = premises.at(1)?.conclusion;
      requireProof(
        base &&
          base.cell === proposition.cell &&
          conclusion?.kind === "literal" &&
          proposal.effects.some(
            (e) =>
              e.cell === conclusion.value.cell &&
              e.symbol === conclusion.value.symbol &&
              (e.kind === "place") === conclusion.value.positive,
          ) &&
          (proposition.mask !== base.mask || conclusion.value.positive),
        "outside-domain-closure",
      );
    } else if (node.rule === "weak-link@1") {
      requireProof(
        proposition.kind === "clause" && proposition.alternatives.length === 2,
        "outside-peer-grammar",
      );
      requireProof(
        proposition.alternatives.some(
          (left) =>
            sourceCells.includes(left.cell) &&
            proposition.alternatives.some(
              (literal) =>
                literal.cell !== left.cell &&
                literal.symbol === left.symbol &&
                proposal.effects.some(
                  (effect) =>
                    effect.kind === "remove" &&
                    effect.cell === literal.cell &&
                    effect.symbol === literal.symbol,
                ),
            ) &&
            (proposal.technique !== "rule-propagation@1" ||
              view.state.values[left.cell] === left.symbol),
        ),
        "outside-peer-grammar",
      );
    } else if (node.rule === "resolution@1") {
      const terms =
        proposition.kind === "literal"
          ? [proposition.value]
          : proposition.kind === "clause" && proposal.technique === "c03@1"
            ? proposition.alternatives
            : [];
      requireProof(
        terms.length > 0 &&
          terms.every((literal) =>
            literal.positive
              ? sourceCells.includes(literal.cell) && literal.symbol === symbol
              : proposal.effects.some(
                  (effect) =>
                    effect.kind === "remove" &&
                    effect.cell === literal.cell &&
                    effect.symbol === literal.symbol,
                ),
          ) &&
          terms.filter((literal) => !literal.positive).length === 1,
        "outside-resolution-grammar",
      );
    } else if (node.rule === "cover-clause@1") {
      const terms =
        proposition.kind === "literal"
          ? [proposition.value]
          : proposition.kind === "clause"
            ? proposition.alternatives
            : [];
      requireProof(
        proposal.technique === "rule-propagation@1"
          ? terms.length === 1 &&
              terms[0].positive &&
              view.state.values[terms[0].cell] === terms[0].symbol &&
              node.premises[0] === view.state.domainFacts[terms[0].cell]
          : terms.length === sourceCells.length &&
              terms.every(
                (literal) =>
                  literal.positive &&
                  sourceCells.includes(literal.cell) &&
                  literal.symbol === symbol,
              ),
        "outside-single-grammar",
      );
      requireProof(
        premises[0]?.rule === "support@1" ||
          (terms.length === 1 && node.premises[0] === view.state.domainFacts[terms[0].cell]),
        "outside-single-grammar",
      );
    } else if (node.rule === "support@1") {
      requireProof(
        coverCells &&
          sameValue(premises[0]?.conclusion, { kind: "cover", symbol, cells: coverCells }) &&
          sameValue(
            node.premises.slice(1),
            coverCells.map((cell) => view.state.domainFacts[cell]),
          ),
        "outside-support-grammar",
      );
    } else if (node.rule === "hall@1") {
      requireProof(
        allowedHall.some(
          (house) =>
            sameValue(premises[0]?.conclusion, { kind: "all-different", cells: house.house }) &&
            sameValue(
              node.premises.slice(1),
              house.cells.map((cell) => view.state.domainFacts[cell]),
            ),
        ),
        "outside-hall-grammar",
      );
    }
  }
  requireProof(nodes.length <= proposal.effects.length * 8 + 4, "technique-work-bound");
}

/** Scheduled checker uses cooperative complete-source coloring reconstruction. */
export function* checkTechniqueGrammarSteps(
  proposal: DeductionProposal,
  view: ReadView,
  available: ReadonlyMap<number, ProofNode>,
  charge?: (units: number) => void,
): Generator<number, void, void> {
  if (proposal.technique === "c14@1" || proposal.technique === "c15@1") {
    for (const cell of view.assembly.problem.cells) {
      yield 1;
      const fact = view.facts.get(view.state.domainFacts[cell]);
      requireProof(
        fact &&
          sameValue(domainAssertion(fact.proposition), { cell, mask: view.state.domains[cell] }),
        "unproved-current-domain",
      );
    }
    yield* checkColoringPatternSteps(proposal, view, available);
    return;
  }
  checkTechniqueGrammar(proposal, view, available, charge);
}
