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
import { classicHouseEqualTo, symbolMask } from "../state/read";
import { defined } from "../invariants";

/** Pivot joins and identical-pair bridges are separate named constructions. */
export class Wings implements PatternStrategy {
  *patterns(view: ReadView, graph: PatternGraph): ReturnType<PatternStrategy["patterns"]> {
    const cells = view.assembly.problem.cells.filter((cell) => !view.state.values[cell]),
      bi = cells.filter((cell) => digits(view, cell).length === 2);
    for (const pivot of cells) {
      const pd = digits(view, pivot);
      if (pd.length !== 2 && pd.length !== 3) continue;
      for (const cellA of bi)
        for (const cellB of bi) {
          yield { kind: "work" as const, units: 1 };
          if (new Set([pivot, cellA, cellB]).size !== 3) continue;
          const ad = digits(view, cellA),
            bd = digits(view, cellB),
            zDigit = ad.find((symbol) => bd.includes(symbol));
          if (!zDigit) continue;
          const x = defined(
              ad.find((symbol) => symbol !== zDigit),
              "ad",
            ),
            y = defined(
              bd.find((symbol) => symbol !== zDigit),
              "bd",
            );
          if (
            x === y ||
            !pd.includes(x) ||
            !pd.includes(y) ||
            (pd.length === 2 && pd.includes(zDigit)) ||
            (pd.length === 3 && !pd.includes(zDigit)) ||
            !graph.has(pos(pivot, x), pos(cellA, x)) ||
            !graph.has(pos(pivot, y), pos(cellB, y))
          )
            continue;
          const occurrences = [cellA, cellB, ...(pd.length === 3 ? [pivot] : [])],
            effects: Effect[] = [];
          for (const target of cells) {
            yield { kind: "work" as const, units: 1 };
            if (
              view.state.domains[target] & symbolMask(zDigit) &&
              occurrences.every(
                (cell) => cell !== target && graph.has(pos(cell, zDigit), pos(target, zDigit)),
              )
            )
              effects.push({ kind: "remove", cell: target, symbol: zDigit });
          }
          if (effects.length)
            for (const alias of pd.length === 3 ? ["XYZ-Wing"] : ["XY-Wing", "Y-Wing"])
              yield {
                kind: "candidate" as const,
                pattern: { alias, pivot, wings: [cellA, cellB], x, y, z: zDigit },
                effects,
              };
        }
    }
    for (const cellA of bi)
      for (const cellD of bi) {
        yield { kind: "work" as const, units: 1 };
        if (cellA >= cellD || view.state.domains[cellA] !== view.state.domains[cellD]) continue;
        for (const x of digits(view, cellA))
          for (const cover of graph.index.covers) {
            yield { kind: "work" as const, units: 1 };
            if (
              cover.recipe.kind !== "house-cover" ||
              cover.literals.length !== 2 ||
              !cover.literals.every((literal) => literal.symbol === x)
            )
              continue;
            const source = defined(view.facts.get(cover.recipe.source), "fact").proposition;
            if (source.kind !== "cover") continue;
            const house = classicHouseEqualTo(view, source.cells);
            if (!house) continue;
            const zDigit = defined(
              digits(view, cellA).find((symbol) => symbol !== x),
              "find",
            );
            for (const [from, to] of [cover.literals, [...cover.literals].reverse()]) {
              yield { kind: "work" as const, units: 1 };
              if (
                new Set([cellA, cellD, from.cell, to.cell]).size !== 4 ||
                !graph.has(pos(cellA, x), from) ||
                !graph.has(to, pos(cellD, x))
              )
                continue;
              const effects: Effect[] = [];
              for (const target of cells) {
                yield { kind: "work" as const, units: 1 };
                if (
                  target !== cellA &&
                  target !== cellD &&
                  view.state.domains[target] & symbolMask(zDigit) &&
                  graph.has(pos(cellA, zDigit), pos(target, zDigit)) &&
                  graph.has(pos(cellD, zDigit), pos(target, zDigit))
                )
                  effects.push({ kind: "remove", cell: target, symbol: zDigit });
              }
              if (effects.length)
                yield {
                  kind: "candidate" as const,
                  pattern: {
                    alias: "W-Wing",
                    endpoints: [cellA, cellD],
                    bridge: [from.cell, to.cell],
                    cover: house.id,
                    bridgeSymbol: x,
                    eliminationSymbol: zDigit,
                  },
                  effects,
                };
            }
          }
      }
  }
  *compile(view: ReadView, graph: PatternGraph, pattern: Json, effects: Effect[]) {
    const p = pattern as unknown as WingPattern,
      builder = new PatternBuilder(view, graph);
    let root: number;
    if ("endpoints" in p) {
      const [cellA, cellD] = p.endpoints,
        [cellC, cellE] = p.bridge,
        x = p.bridgeSymbol,
        zDigit = p.eliminationSymbol;
      root = yield* builder.path(
        [
          [pos(cellA, zDigit)],
          [pos(cellA, x)],
          [pos(cellC, x)],
          [pos(cellE, x)],
          [pos(cellD, x)],
          [pos(cellD, zDigit)],
        ],
        [builder.cell(cellA), builder.house(p.cover, x), builder.cell(cellD)],
      );
    } else {
      root = builder.cell(p.pivot);
      for (const [i, symbol] of [p.x, p.y].entries()) {
        const wing = builder.cell(p.wings[i]),
          weak = yield* builder.weak(pos(p.pivot, symbol), pos(p.wings[i], symbol));
        const implication = builder.resolve(wing, weak, pos(p.wings[i], symbol));
        root = builder.resolve(root, implication, pos(p.pivot, symbol));
      }
    }
    const roots: number[] = [];
    for (const effect of effects) roots.push(yield* builder.eliminate(root, effect));
    return builder.finish("c11@1", pattern, effects, roots);
  }
}
export const wingTechniques = Object.freeze([descriptor("C11", new Wings(), [0, 0, 3, 5, 3])]);
