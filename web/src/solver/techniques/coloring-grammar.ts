import { preparedSources, sourceFacts } from "../state/source-index";
import type { ReadView, Literal } from "../state/types";
import type { DeductionProposal, ProofNode } from "../proof/types";
import { clause, requireProof, sameValue } from "../proof/primitives";
import type { ColoringPattern, ColorEdge } from "./coloring";
import { ChainSources, projectedSource } from "./chains-grammar";
import { classicHouseContaining, symbolMask } from "../state/read";
import { claimed, defined } from "../invariants";

const key = (literal: Literal) => `${literal.cell}:${literal.symbol}`;
const identity = (edge: ColorEdge) =>
  JSON.stringify({
    ends: [...edge.ends].sort(
      (left, right) => left.cell - right.cell || left.symbol - right.symbol,
    ),
    source: edge.source,
  });
const fields = (pattern: object, names: string[]) =>
  requireProof(sameValue(Object.keys(pattern).sort(), names.sort()), "invalid-coloring-fields");

/** Independent complete-component reconstruction; at-least-one alone never supplies XOR. */
export function checkColoringPattern(
  proposal: DeductionProposal,
  view: ReadView,
  available: ReadonlyMap<number, ProofNode>,
): void {
  for (const _ of checkColoringPatternSteps(proposal, view, available)) {
    /* Compatibility caller owns synchronous work. */
  }
}
export function* checkColoringPatternSteps(
  proposal: DeductionProposal,
  view: ReadView,
  available: ReadonlyMap<number, ProofNode>,
): Generator<number, void, void> {
  const pattern = proposal.pattern as unknown as ColoringPattern,
    medusa = proposal.technique === "c15@1";
  requireProof(proposal.effects.length > 0, "unproductive-coloring-pattern");
  fields(pattern, ["kind", "alias", "form", "components", "branches"]);
  requireProof(
    claimed(pattern).kind === "coloring" &&
      ["trap", "cell-wrap", "house-wrap", "multi"].includes(pattern.form) &&
      (medusa
        ? pattern.alias === "3D Medusa" && pattern.form !== "multi"
        : ["Simple coloring", "Color trap", "Color wrap", "Multi-coloring"].includes(
            pattern.alias,
          )),
    "invalid-coloring-alias",
  );
  requireProof(
    Array.isArray(pattern.components) &&
      pattern.components.length === (pattern.form === "multi" ? 2 : 1) &&
      Array.isArray(pattern.branches) &&
      pattern.branches.length === 1 << pattern.components.length,
    "incomplete-color-alternatives",
  );
  if (pattern.alias === "Color trap")
    requireProof(pattern.form === "trap", "invalid-coloring-alias");
  if (pattern.alias === "Color wrap")
    requireProof(
      pattern.form === "cell-wrap" || pattern.form === "house-wrap",
      "invalid-coloring-alias",
    );
  if (pattern.alias === "Multi-coloring")
    requireProof(pattern.form === "multi", "invalid-coloring-alias");
  if (pattern.alias === "Simple coloring")
    requireProof(pattern.form !== "multi", "invalid-coloring-alias");
  const sources = new ChainSources(view, available),
    allKeys = new Set<string>(),
    edgeRoots = new Set<number>();
  for (const component of pattern.components) {
    fields(component, ["colors", "edges"]);
    requireProof(
      Array.isArray(component.colors) &&
        (component.colors as readonly unknown[]).length === 2 &&
        component.colors.every((xs) => Array.isArray(xs) && xs.length > 0) &&
        Array.isArray(component.edges) &&
        component.edges.length > 0,
      "invalid-color-component",
    );
    const members = component.colors.flat(),
      colors = new Map<string, number>();
    requireProof(
      members.length <= (medusa ? 729 : 81) &&
        (medusa || new Set(members.map((literal) => literal.symbol)).size === 1),
      "color-component-out-of-profile",
    );
    component.colors.forEach((xs, color) =>
      xs.forEach((literal) => {
        fields(literal, ["cell", "symbol", "positive"]);
        requireProof(
          literal.positive &&
            view.assembly.problem.cells.includes(literal.cell) &&
            view.assembly.problem.symbols.includes(literal.symbol) &&
            !view.state.values[literal.cell] &&
            !!(view.state.domains[literal.cell] & symbolMask(literal.symbol)) &&
            !allKeys.has(key(literal)),
          "invalid-color-members",
        );
        allKeys.add(key(literal));
        colors.set(key(literal), color);
      }),
    );
    const adjacency = new Map<string, string[]>(),
      found = new Set<string>();
    for (const edge of component.edges) {
      fields(edge, ["ends", "source", "roots"]);
      requireProof(
        Array.isArray(edge.ends) &&
          (edge.ends as readonly unknown[]).length === 2 &&
          edge.ends.every((literal) => colors.has(key(literal))) &&
          colors.get(key(edge.ends[0])) !== colors.get(key(edge.ends[1])) &&
          edge.source.kind !== "als" &&
          (medusa || edge.source.kind === "house" || edge.source.kind === "proved-cover") &&
          Array.isArray(edge.roots) &&
          edge.roots.length === 2,
        "invalid-color-xor",
      );
      const signature = identity(edge);
      requireProof(!found.has(signature), "duplicate-color-edge");
      found.add(signature);
      sources.strong(edge.source, edge.ends, edge.roots[0]);
      sources.weak(edge.roots[1], ...edge.ends);
      edge.roots.forEach((id) => edgeRoots.add(id));
      for (const [literal, other] of [edge.ends, [...edge.ends].reverse()]) {
        const xs = adjacency.get(key(literal)) ?? [];
        xs.push(key(other));
        adjacency.set(key(literal), xs);
      }
    }
    const reached = new Set<string>(),
      pending = [key(members[0])];
    while (pending.length) {
      const at = defined(pending.pop(), "pending");
      if (reached.has(at)) continue;
      reached.add(at);
      pending.push(...(adjacency.get(at) ?? []));
    }
    requireProof(reached.size === members.length, "disconnected-color-component");
    // Reconstruct every eligible XOR edge touching this component from closed current facts.
    const expected = new Set<string>();
    const include = (edge: ColorEdge) => {
      if (!edge.ends.some((literal) => colors.has(key(literal)))) return;
      requireProof(
        edge.ends.every((literal) => colors.has(key(literal))),
        "incomplete-color-component",
      );
      expected.add(identity(edge));
    };
    if (medusa)
      for (const cell of view.assembly.problem.cells) {
        if (view.state.values[cell]) continue;
        const symbols = view.assembly.problem.symbols.filter(
          (symbol) => view.state.domains[cell] & symbolMask(symbol),
        );
        if (symbols.length === 2)
          include({
            ends: symbols.map((symbol) => ({ cell, symbol, positive: true })) as [Literal, Literal],
            source: { kind: "cell", cell },
            roots: [],
          });
      }
    for (const fact of sourceFacts(view, "cover")) {
      yield 1;
      if (fact.openAssumptions.length || fact.proposition.kind !== "cover") continue;
      const cover = fact.proposition;
      const house = classicHouseContaining(view, cover.cells);
      if (!house) continue;
      const cells = cover.cells.filter(
        (cell) => view.state.domains[cell] & symbolMask(cover.symbol),
      );
      if (cells.length !== 2 || cells.some((cell) => view.state.values[cell])) continue;
      // The house's checked all-different source supplies the at-most-one side.
      const prepared = preparedSources(view, "complete");
      if (
        prepared
          ? !prepared.scopePair(cells[0], cells[1])
          : !sourceFacts(view, "all-different").some(
              (candidate) =>
                !candidate.openAssumptions.length &&
                candidate.proposition.kind === "all-different" &&
                cells.every(
                  (cell) =>
                    candidate.proposition.kind === "all-different" &&
                    candidate.proposition.cells.includes(cell),
                ),
            )
      )
        continue;
      include({
        ends: cells.map((cell) => ({ cell, symbol: cover.symbol, positive: true })) as [
          Literal,
          Literal,
        ],
        source: sameValue(house.cells, cover.cells)
          ? { kind: "house", house: house.id, symbol: cover.symbol }
          : { kind: "proved-cover", source: fact.id, house: house.id, symbol: cover.symbol },
        roots: [],
      });
    }
    requireProof(sameValue([...found].sort(), [...expected].sort()), "incomplete-color-edges");
  }
  if (!medusa)
    requireProof(
      new Set(
        pattern.components.flatMap((component) =>
          component.colors.flat().map((literal) => literal.symbol),
        ),
      ).size === 1,
      "mixed-symbol-coloring",
    );
  let invalid = 0;
  pattern.branches.forEach((branch, index) => {
    fields(branch, ["colors", "conflict", "witnesses", "roots", "proofs"]);
    requireProof(
      Array.isArray(branch.proofs) && branch.proofs.length === proposal.effects.length,
      "missing-color-branch-proofs",
    );
    const expected = pattern.components.map(
      (_, i) => (index >> (pattern.components.length - i - 1)) & 1,
    );
    requireProof(sameValue(branch.colors, expected), "incomplete-color-branches");
    const assigned = new Set(
      pattern.components.flatMap((component, i) => component.colors[branch.colors[i]]).map(key),
    );
    if (branch.conflict !== null) {
      requireProof(
        Array.isArray(branch.conflict) &&
          (branch.conflict as readonly unknown[]).length === 2 &&
          branch.conflict.every((literal) => assigned.has(key(literal))) &&
          branch.roots.length === 1 &&
          branch.witnesses.length === 0,
        "unjustified-color-conflict",
      );
      sources.weak(branch.roots[0], ...branch.conflict);
      invalid++;
      if (pattern.form === "cell-wrap")
        requireProof(branch.conflict[0].cell === branch.conflict[1].cell, "invalid-cell-wrap");
      if (pattern.form === "house-wrap")
        requireProof(
          branch.conflict[0].cell !== branch.conflict[1].cell &&
            branch.conflict[0].symbol === branch.conflict[1].symbol,
          "invalid-house-wrap",
        );
    } else {
      requireProof(
        branch.witnesses.length === proposal.effects.length &&
          branch.roots.length === proposal.effects.length,
        "incomplete-color-effects",
      );
      proposal.effects.forEach((effect, i) => {
        const witness = branch.witnesses[i];
        requireProof(assigned.has(key(witness)), "uncolored-effect-witness");
        sources.weak(branch.roots[i], witness, {
          cell: effect.cell,
          symbol: effect.symbol,
          positive: true,
        });
      });
    }
  });
  requireProof(
    invalid < pattern.branches.length &&
      (pattern.form === "trap" ? invalid === 0 : pattern.form === "multi" || invalid === 1),
    "invalid-color-alternatives",
  );
  proposal.effects.forEach((effect, i) => {
    requireProof(effect.kind === "remove", "invalid-color-effect");
    const roots = proposal.proof.roots.filter((id) =>
      sameValue(
        available.get(id)?.conclusion,
        clause([{ cell: effect.cell, symbol: effect.symbol, positive: false }]),
      ),
    );
    requireProof(roots.length > 0, "missing-color-effect-root");
    const checkCases = (
      id: number,
      depth: number,
      assumptions: number[],
      colors: number[],
    ): void => {
      if (depth === pattern.components.length) {
        const branch = defined(
            pattern.branches.find((other) => sameValue(other.colors, colors)),
            "branche",
          ),
          proof = branch.proofs[i];
        fields(proof, ["assumptions", "root"]);
        requireProof(
          proof.root === id && sameValue(proof.assumptions, assumptions),
          "substituted-color-branch-root",
        );
        const valid = new Set(assumptions),
          allowed = new Set(edgeRoots);
        (branch.conflict ? branch.roots : [branch.roots[i]]).forEach((root) => allowed.add(root));
        for (const node of proposal.proof.nodes) {
          if (allowed.has(projectedSource(node.id, available))) valid.add(node.id);
          else if (
            node.rule === "resolution@1" &&
            node.premises.every((premise) => valid.has(premise)) &&
            sameValue(node.scope, assumptions)
          )
            valid.add(node.id);
          // Ancestor-scope propagation is a valid input to either of its two children.
          else if (
            node.rule === "resolution@1" &&
            node.premises.every((premise) => valid.has(premise)) &&
            node.scope.every((ancestor, at) => assumptions[at] === ancestor)
          )
            valid.add(node.id);
        }
        requireProof(
          valid.has(id) &&
            sameValue(
              available.get(id)?.conclusion,
              branch.conflict
                ? { kind: "false" }
                : clause([{ cell: effect.cell, symbol: effect.symbol, positive: false }]),
            ),
          "unrelated-color-branch-root",
        );
        return;
      }
      const node = available.get(id),
        component = pattern.components[depth],
        edge = component.edges[0];
      requireProof(
        node?.rule === "cases@1" &&
          node.premises.length === 5 &&
          sameValue(node.scope, assumptions) &&
          projectedSource(node.premises[0], available) === edge.roots[0],
        "missing-color-case-tree",
      );
      const alternatives = [...edge.ends].sort(
        (left, right) => left.cell - right.cell || left.symbol - right.symbol,
      );
      alternatives.forEach((representative, choice) => {
        const assumptionId = node.premises[1 + choice * 2],
          assumption = available.get(assumptionId);
        requireProof(
          assumption?.rule === "assume@1" &&
            sameValue(assumption.conclusion, clause([representative])) &&
            sameValue(assumption.scope, assumptions),
          "invalid-color-case-assumption",
        );
        const color = component.colors.findIndex((xs) =>
          xs.some((literal) => key(literal) === key(representative)),
        );
        checkCases(
          node.premises[2 + choice * 2],
          depth + 1,
          [...assumptions, assumptionId],
          [...colors, color],
        );
      });
    };
    roots.forEach((id) => checkCases(id, 0, [], []));
  });
  requireProof(
    proposal.proof.nodes.every(
      (n) =>
        n.scope.length <= pattern.components.length &&
        [
          "support@1",
          "cover-clause@1",
          "weak-link@1",
          "resolution@1",
          "domain-restrict@1",
          "conjunction@1",
          "assume@1",
          "cases@1",
          "table-filter@1",
          "table-join@1",
          "table-project@1",
        ].includes(n.rule),
    ),
    "outside-coloring-grammar",
  );
}
