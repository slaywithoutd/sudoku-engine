import type { Json } from "../problem";
import type { Literal, ReadView } from "../state/types";
import type { Effect } from "../proof/types";
import { descriptor, type PatternGraph, type PatternStrategy } from "./pattern-runtime";
import type { Discovery, DiscoveryContext, TechniqueDescriptor } from "./types";
import { clause } from "../proof/primitives";
import {
  candidate,
  literalKey,
  ChainCertificate,
  chainProofFits,
  type ChainWork,
  type StrongSource,
} from "./chains-certificate";
import { classicHouseContaining, symbolMask } from "../state/read";
import { defined } from "../invariants";

export interface ColorEdge {
  ends: [Literal, Literal];
  source: StrongSource;
  roots: number[];
}
export interface ColorComponent {
  colors: [Literal[], Literal[]];
  edges: ColorEdge[];
}
export interface ColorBranch {
  colors: number[];
  conflict: [Literal, Literal] | null;
  witnesses: Literal[];
  roots: number[];
  proofs: { assumptions: number[]; root: number }[];
}
export interface ColoringPattern {
  kind: "coloring";
  alias: string;
  form: "trap" | "cell-wrap" | "house-wrap" | "multi";
  components: ColorComponent[];
  branches: ColorBranch[];
}
type ColorCandidate = { kind: "candidate"; pattern: Json; effects: Effect[] };

/** Complete XOR components, built only where both OR and exclusivity have recipes. */
export class Coloring implements PatternStrategy {
  constructor(readonly medusa: boolean) {}
  *patterns(view: ReadView, graph: PatternGraph): Generator<ChainWork | ColorCandidate> {
    const edges: ColorEdge[] = [],
      adjacency = new Map<string, ColorEdge[]>(),
      literals = new Map<string, Literal>();
    for (const cover of graph.index.covers) {
      yield { kind: "work", units: 1 };
      if (
        cover.literals.length !== 2 ||
        cover.literals.some((literal) => view.state.values[literal.cell]) ||
        !graph.has(cover.literals[0], cover.literals[1])
      )
        continue;
      let source: StrongSource;
      if (cover.recipe.kind === "cell-cover") {
        if (!this.medusa) continue;
        source = { kind: "cell", cell: cover.literals[0].cell };
      } else {
        const proposition = defined(view.facts.get(cover.recipe.source), "fact").proposition;
        if (proposition.kind !== "cover") continue;
        const house = classicHouseContaining(view, proposition.cells);
        if (!house) continue;
        source =
          house.cells.join() === proposition.cells.join()
            ? { kind: "house", house: house.id, symbol: proposition.symbol }
            : {
                kind: "proved-cover",
                source: cover.recipe.source,
                house: house.id,
                symbol: proposition.symbol,
              };
      }
      const edge: ColorEdge = {
        ends: [...cover.literals] as [Literal, Literal],
        source,
        roots: [],
      };
      if (
        edges.some(
          (colorEdge) =>
            JSON.stringify([colorEdge.ends, colorEdge.source]) ===
            JSON.stringify([edge.ends, source]),
        )
      )
        continue;
      graph.lease.grow(1, 1024);
      edges.push(edge);
      for (const literal of edge.ends) {
        const key = literalKey(literal),
          local = adjacency.get(key) ?? [];
        local.push(edge);
        adjacency.set(key, local);
        literals.set(key, literal);
      }
    }
    const seen = new Set<string>(),
      components: ColorComponent[] = [];
    for (const start of [...adjacency.keys()].sort()) {
      yield { kind: "work", units: 1 };
      if (seen.has(start)) continue;
      const colors = new Map<string, number>([[start, 0]]),
        queue = [start],
        selected = new Set<ColorEdge>();
      let valid = true;
      for (let i = 0; i < queue.length; i++) {
        const left = queue[i];
        seen.add(left);
        for (const edge of defined(adjacency.get(left), "adjacency")) {
          yield { kind: "work", units: 1 };
          selected.add(edge);
          const right = literalKey(
            defined(
              edge.ends.find((literal) => literalKey(literal) !== left),
              "end",
            ),
          );
          if (colors.has(right)) {
            if (colors.get(right) === colors.get(left)) valid = false;
          } else {
            colors.set(right, 1 - defined(colors.get(left), "color"));
            queue.push(right);
          }
        }
      }
      if (!valid) continue;
      const component: ColorComponent = { colors: [[], []], edges: [...selected] };
      for (const [key, color] of colors)
        component.colors[color].push(defined(literals.get(key), "literal"));
      component.colors.forEach((xs) =>
        xs.sort((left, right) => left.cell - right.cell || left.symbol - right.symbol),
      );
      components.push(component);
    }
    const singles = function* (this: Coloring): Generator<ChainWork | ColorCandidate> {
      for (const component of components) yield* this.candidates(view, graph, [component]);
    };
    const pairs = function* (this: Coloring): Generator<ChainWork | ColorCandidate> {
      if (this.medusa) return;
      for (let i = 0; i < components.length; i++)
        for (let j = i + 1; j < components.length; j++) {
          yield { kind: "work", units: 1 };
          if (components[i].colors[0][0].symbol === components[j].colors[0][0].symbol)
            yield* this.candidates(view, graph, [components[i], components[j]]);
        }
    };
    const cursors = [singles.call(this), pairs.call(this)];
    try {
      while (cursors.length)
        for (let i = 0; i < cursors.length; i++) {
          const next = cursors[i].next();
          if (next.done) cursors.splice(i--, 1);
          else yield next.value;
        }
    } finally {
      cursors.forEach((cursor) => cursor.return(undefined));
    }
  }
  private *candidates(
    view: ReadView,
    graph: PatternGraph,
    components: ColorComponent[],
  ): Generator<ChainWork | ColorCandidate> {
    const branches: ColorBranch[] = [];
    for (let mask = 0; mask < 1 << components.length; mask++) {
      const colors = components.map((_, i) => (mask >> (components.length - i - 1)) & 1),
        assigned = components.flatMap((component, i) => component.colors[colors[i]]);
      let conflict: [Literal, Literal] | null = null;
      for (let i = 0; i < assigned.length && !conflict; i++)
        for (let j = i + 1; j < assigned.length; j++) {
          yield { kind: "work", units: 1 };
          if (graph.has(assigned[i], assigned[j])) {
            conflict = [assigned[i], assigned[j]];
            break;
          }
        }
      branches.push({ colors, conflict, witnesses: [], roots: [], proofs: [] });
    }
    if (branches.every((branch) => branch.conflict)) return;
    const effects: Effect[] = [];
    for (const cell of view.assembly.problem.cells)
      for (const symbol of view.assembly.problem.symbols) {
        yield { kind: "work", units: 1 };
        if (view.state.values[cell] || !(view.state.domains[cell] & symbolMask(symbol))) continue;
        const target = candidate(cell, symbol),
          witnesses: Literal[] = [];
        let valid = true;
        for (const branch of branches) {
          if (branch.conflict) {
            witnesses.push(target);
            continue;
          }
          const witness = components
            .flatMap((component, i) => component.colors[branch.colors[i]])
            .find((literal) => graph.has(literal, target));
          if (!witness) {
            valid = false;
            break;
          }
          witnesses.push(witness);
        }
        if (!valid) continue;
        effects.push({ kind: "remove", cell, symbol });
        branches.forEach((branch, i) => {
          if (!branch.conflict) branch.witnesses.push(witnesses[i]);
        });
      }
    if (!effects.length) return;
    const conflict = branches.find((branch) => branch.conflict)?.conflict;
    const form =
      components.length === 2
        ? "multi"
        : !conflict
          ? "trap"
          : conflict[0].cell === conflict[1].cell
            ? "cell-wrap"
            : "house-wrap";
    const aliases = this.medusa
      ? ["3D Medusa"]
      : form === "multi"
        ? ["Multi-coloring"]
        : ["Simple coloring", form === "trap" ? "Color trap" : "Color wrap"];
    for (const alias of aliases)
      yield {
        kind: "candidate",
        pattern: { kind: "coloring", alias, form, components, branches } as unknown as Json,
        effects,
      };
  }
  *compile(view: ReadView, graph: PatternGraph, input: Json, effects: Effect[]) {
    const pattern = structuredClone(input) as unknown as ColoringPattern,
      certificate = new ChainCertificate(view, graph),
      sourceIds: number[] = [];
    for (const component of pattern.components)
      for (const edge of component.edges) {
        edge.roots = [
          yield* certificate.strong(edge.source, edge.ends),
          yield* certificate.weak(...edge.ends),
        ];
        sourceIds.push(...edge.roots);
      }
    for (const branch of pattern.branches) {
      branch.roots = [];
      if (branch.conflict) branch.roots.push(yield* certificate.weak(...branch.conflict));
      else
        for (const [i, witness] of branch.witnesses.entries())
          branch.roots.push(
            yield* certificate.weak(witness, candidate(effects[i].cell, effects[i].symbol)),
          );
      sourceIds.push(...branch.roots);
    }
    const packaged = certificate.package(sourceIds),
      mapped = new Map(sourceIds.map((id, i) => [id, packaged[i]])),
      roots: number[] = [];
    // Explicit two/four leaves are primitive cases, not metadata decorating a smaller proof.
    const prove = function* (
      effectIndex: number,
      depth: number,
      colors: number[],
      known: Map<string, number>,
    ): Generator<ChainWork, number> {
      const effect = effects[effectIndex],
        target = clause([{ cell: effect.cell, symbol: effect.symbol, positive: false }]);
      if (depth === pattern.components.length) {
        const branch = defined(
          pattern.branches.find((x) => x.colors.join() === colors.join()),
          "branche",
        );
        let root: number;
        if (branch.conflict) {
          const [literal, other] = branch.conflict;
          root = certificate.resolve(
            defined(mapped.get(branch.roots[0]), "mapped"),
            defined(known.get(literalKey(literal)), "known"),
            {
              ...literal,
              positive: false,
            },
          );
          root = certificate.resolve(root, defined(known.get(literalKey(other)), "known"), {
            ...other,
            positive: false,
          });
        } else {
          const witness = branch.witnesses[effectIndex];
          root = certificate.resolve(
            defined(mapped.get(branch.roots[effectIndex]), "mapped"),
            defined(known.get(literalKey(witness)), "known"),
            { ...witness, positive: false },
          );
        }
        branch.proofs[effectIndex] = { assumptions: [...certificate.scope], root };
        return root;
      }
      const component = pattern.components[depth],
        edge = component.edges[0],
        cover = defined(mapped.get(edge.roots[0]), "mapped"),
        branches: number[] = [];
      for (const representative of [...edge.ends].sort(
        (literal, other) => literal.cell - other.cell || literal.symbol - other.symbol,
      )) {
        yield { kind: "work", units: 1 };
        const assumption = certificate.add("assume@1", [], clause([representative]));
        certificate.scope.push(assumption);
        const local = new Map(known),
          queue = [representative],
          values = new Map<string, boolean>([[literalKey(representative), true]]);
        local.set(literalKey(representative), assumption);
        for (let at = 0; at < queue.length; at++)
          for (const link of component.edges) {
            yield { kind: "work", units: 1 };
            const current = queue[at];
            if (!link.ends.some((literal) => literalKey(literal) === literalKey(current))) continue;
            const next = defined(
                link.ends.find((literal) => literalKey(literal) !== literalKey(current)),
                "end",
              ),
              key = literalKey(next);
            if (values.has(key)) continue;
            const truth = defined(values.get(literalKey(current)), "value");
            const root = certificate.resolve(
              defined(mapped.get(link.roots[truth ? 1 : 0]), "mapped"),
              defined(local.get(literalKey(current)), "local"),
              { ...current, positive: !truth },
            );
            local.set(key, root);
            values.set(key, !truth);
            queue.push(next);
          }
        const color = component.colors.findIndex((xs) =>
          xs.some((literal) => literalKey(literal) === literalKey(representative)),
        );
        const result = yield* prove(effectIndex, depth + 1, [...colors, color], local);
        certificate.scope.pop();
        branches.push(assumption, result);
      }
      return certificate.add("cases@1", [cover, ...branches], target);
    };
    for (let i = 0; i < effects.length; i++) roots.push(yield* prove(i, 0, [], new Map()));
    return certificate.close(
      this.medusa ? "c15@1" : "c14@1",
      pattern as unknown as Json,
      effects,
      roots,
    );
  }
}
function coloringDescriptor(medusa: boolean): TechniqueDescriptor {
  const base = descriptor(medusa ? "C15" : "C14", new Coloring(medusa), [
    0,
    medusa ? 1 : 2,
    medusa ? 2 : 4,
    81,
    0,
  ]);
  return Object.freeze({
    ...base,
    *discover(view: ReadView, context: DiscoveryContext): Discovery {
      let work = 0;
      for (const event of base.discover(view, context)) {
        if (event.kind === "work" && (work += event.units) > context.limits.workUnits) {
          yield { kind: "interrupted", reason: "work-limit" };
          return;
        }
        if (event.kind === "proposal" && !chainProofFits(event.proposal, context.limits)) {
          yield { kind: "interrupted", reason: "proof-step-limit" };
          return;
        }
        yield event;
      }
    },
  });
}
export const coloringTechniques = Object.freeze([
  coloringDescriptor(false),
  coloringDescriptor(true),
]);
