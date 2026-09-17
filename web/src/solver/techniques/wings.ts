import type { Json } from "../problem";
import type { ReadView } from "../state/types";
import type { Effect } from "../proof/types";
import { digits, pos, type WingPattern } from "./pattern-contracts";
import {
  descriptor,
  PatternBuilder,
  type PatternGraph,
  type PatternStrategy,
} from "./pattern-runtime";

/** Pivot joins and identical-pair bridges are separate named constructions. */
export class Wings implements PatternStrategy {
  *patterns(view: ReadView, graph: PatternGraph): ReturnType<PatternStrategy["patterns"]> {
    const cells = view.assembly.problem.cells.filter((c) => !view.state.values[c]),
      bi = cells.filter((c) => digits(view, c).length === 2);
    for (const pivot of cells) {
      const pd = digits(view, pivot);
      if (pd.length !== 2 && pd.length !== 3) continue;
      for (const a of bi)
        for (const b of bi) {
          yield { kind: "work" as const, units: 1 };
          if (new Set([pivot, a, b]).size !== 3) continue;
          const ad = digits(view, a),
            bd = digits(view, b),
            z = ad.find((s) => bd.includes(s));
          if (!z) continue;
          const x = ad.find((s) => s !== z)!,
            y = bd.find((s) => s !== z)!;
          if (
            x === y ||
            !pd.includes(x) ||
            !pd.includes(y) ||
            (pd.length === 2 && pd.includes(z)) ||
            (pd.length === 3 && !pd.includes(z)) ||
            !graph.has(pos(pivot, x), pos(a, x)) ||
            !graph.has(pos(pivot, y), pos(b, y))
          )
            continue;
          const occurrences = [a, b, ...(pd.length === 3 ? [pivot] : [])],
            effects: Effect[] = [];
          for (const target of cells) {
            yield { kind: "work" as const, units: 1 };
            if (
              view.state.domains[target] & (1 << (z - 1)) &&
              occurrences.every((c) => c !== target && graph.has(pos(c, z), pos(target, z)))
            )
              effects.push({ kind: "remove", cell: target, symbol: z });
          }
          if (effects.length)
            for (const alias of pd.length === 3 ? ["XYZ-Wing"] : ["XY-Wing", "Y-Wing"])
              yield {
                kind: "candidate" as const,
                pattern: { alias, pivot, wings: [a, b], x, y, z },
                effects,
              };
        }
    }
    for (const a of bi)
      for (const d of bi) {
        yield { kind: "work" as const, units: 1 };
        if (a >= d || view.state.domains[a] !== view.state.domains[d]) continue;
        for (const x of digits(view, a))
          for (const cover of graph.index.covers) {
            yield { kind: "work" as const, units: 1 };
            if (
              cover.recipe.kind !== "house-cover" ||
              cover.literals.length !== 2 ||
              !cover.literals.every((l) => l.symbol === x)
            )
              continue;
            const source = view.facts.get(cover.recipe.source)!.proposition;
            if (source.kind !== "cover") continue;
            const house = view.assembly.allDifferent.find(
              (h) => h.cells.length === 9 && h.cells.join() === source.cells.join(),
            );
            if (!house) continue;
            const z = digits(view, a).find((s) => s !== x)!;
            for (const [b, c] of [cover.literals, [...cover.literals].reverse()]) {
              yield { kind: "work" as const, units: 1 };
              if (
                new Set([a, d, b.cell, c.cell]).size !== 4 ||
                !graph.has(pos(a, x), b) ||
                !graph.has(c, pos(d, x))
              )
                continue;
              const effects: Effect[] = [];
              for (const target of cells) {
                yield { kind: "work" as const, units: 1 };
                if (
                  target !== a &&
                  target !== d &&
                  view.state.domains[target] & (1 << (z - 1)) &&
                  graph.has(pos(a, z), pos(target, z)) &&
                  graph.has(pos(d, z), pos(target, z))
                )
                  effects.push({ kind: "remove", cell: target, symbol: z });
              }
              if (effects.length)
                yield {
                  kind: "candidate" as const,
                  pattern: {
                    alias: "W-Wing",
                    endpoints: [a, d],
                    bridge: [b.cell, c.cell],
                    cover: house.id,
                    bridgeSymbol: x,
                    eliminationSymbol: z,
                  },
                  effects,
                };
            }
          }
      }
  }
  *compile(view: ReadView, graph: PatternGraph, pattern: Json, effects: Effect[]) {
    const p = pattern as unknown as WingPattern,
      b = new PatternBuilder(view, graph);
    let root: number;
    if ("endpoints" in p) {
      const [a, d] = p.endpoints,
        [c, e] = p.bridge,
        x = p.bridgeSymbol,
        z = p.eliminationSymbol;
      root = yield* b.path(
        [[pos(a, z)], [pos(a, x)], [pos(c, x)], [pos(e, x)], [pos(d, x)], [pos(d, z)]],
        [b.cell(a), b.house(p.cover, x), b.cell(d)],
      );
    } else {
      root = b.cell(p.pivot);
      for (const [i, symbol] of [p.x, p.y].entries()) {
        const wing = b.cell(p.wings[i]),
          weak = yield* b.weak(pos(p.pivot, symbol), pos(p.wings[i], symbol));
        const implication = b.resolve(wing, weak, pos(p.wings[i], symbol));
        root = b.resolve(root, implication, pos(p.pivot, symbol));
      }
    }
    const roots: number[] = [];
    for (const e of effects) roots.push(yield* b.eliminate(root, e));
    return b.finish("c11@1", pattern, effects, roots);
  }
}
export const wingTechniques = Object.freeze([descriptor("C11", new Wings(), [0, 0, 3, 5, 3])]);
