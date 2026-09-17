import type { Json } from "../problem";
import type { ReadView } from "../state/types";
import type { Effect } from "../proof/types";
import { digits, pos, type RemotePattern } from "./pattern-contracts";
import {
  descriptor,
  PatternBuilder,
  type PatternGraph,
  type PatternStrategy,
} from "./pattern-runtime";
import { symbolMask } from "../state/read";
import { defined } from "../invariants";

/** DFS retains one simple path; every extension is charged, including failures. */
export class RemotePairs implements PatternStrategy {
  *patterns(view: ReadView, graph: PatternGraph) {
    const bi = view.assembly.problem.cells.filter(
      (cell) => !view.state.values[cell] && digits(view, cell).length === 2,
    );
    const walk = function* (
      path: number[],
      symbols: number[],
    ): Generator<
      { kind: "work"; units: number } | { kind: "candidate"; pattern: Json; effects: Effect[] }
    > {
      if (path.length >= 4 && path.length % 2 === 0 && path[0] < defined(path.at(-1), "path")) {
        const effects: Effect[] = [];
        for (const target of view.assembly.problem.cells)
          for (const symbol of symbols) {
            yield { kind: "work", units: 1 };
            if (
              !view.state.values[target] &&
              target !== path[0] &&
              target !== path.at(-1) &&
              view.state.domains[target] & symbolMask(symbol) &&
              graph.has(pos(path[0], symbol), pos(target, symbol)) &&
              graph.has(pos(defined(path.at(-1), "path"), symbol), pos(target, symbol))
            )
              effects.push({ kind: "remove", cell: target, symbol });
          }
        if (effects.length) {
          const base = { cells: [...path], symbols, inferenceLinks: 2 * path.length - 1 };
          yield {
            kind: "candidate",
            pattern: { alias: "Remote Pairs", ...base, chute: null },
            effects,
          };
          for (const chute of ["band", "stack"] as const)
            if (
              new Set(
                path.map((cell) =>
                  chute === "band" ? Math.floor(cell / 27) : Math.floor((cell % 9) / 3),
                ),
              ).size === 1
            )
              yield {
                kind: "candidate",
                pattern: { alias: "Chute Remote Pairs", ...base, chute },
                effects,
              };
        }
      }
      if (path.length === 12) return;
      for (const next of bi) {
        yield { kind: "work", units: 1 };
        if (
          path.includes(next) ||
          view.state.domains[next] !== view.state.domains[path[0]] ||
          !symbols.every((symbol) =>
            graph.has(pos(defined(path.at(-1), "path"), symbol), pos(next, symbol)),
          )
        )
          continue;
        path.push(next);
        yield* walk(path, symbols);
        path.pop();
      }
    };
    for (const cell of bi) yield* walk([cell], digits(view, cell));
  }
  *compile(view: ReadView, graph: PatternGraph, pattern: Json, effects: Effect[]) {
    const shape = pattern as unknown as RemotePattern,
      builder = new PatternBuilder(view, graph),
      strong = shape.cells.map((cell) => builder.cell(cell)),
      roots: number[] = [];
    const endpoints = new Map<number, number>();
    for (const symbol of shape.symbols) {
      if (!effects.some((effect) => effect.symbol === symbol)) continue;
      const vertices = shape.cells.flatMap((cell, i) => [
        [pos(cell, shape.symbols[(shape.symbols.indexOf(symbol) + i) % 2])],
        [pos(cell, shape.symbols[(shape.symbols.indexOf(symbol) + i + 1) % 2])],
      ]);
      endpoints.set(symbol, yield* builder.path(vertices, strong));
    }
    for (const effect of effects)
      roots.push(
        yield* builder.eliminate(defined(endpoints.get(effect.symbol), "endpoint"), effect),
      );
    return builder.finish("c13@1", pattern, effects, roots);
  }
}
export const remotePairTechniques = Object.freeze([
  descriptor("C13", new RemotePairs(), [24, 0, 2, 12, 2]),
]);
