import type { Json } from "../problem";
import type { ReadView } from "../state/types";
import type { Effect } from "../proof/types";
import {
  row,
  column,
  box,
  pos,
  shortPathIdentity,
  type ShortPath,
  type ShortPattern,
} from "./pattern-contracts";
import {
  descriptor,
  PatternBuilder,
  type PatternGraph,
  type PatternStrategy,
} from "./pattern-runtime";
import { classicHouseEqualTo, symbolMask } from "../state/read";
import { defined } from "../invariants";

type PathEvent =
  | { kind: "work"; units: number }
  | { kind: "path"; path: ShortPath; effects: Effect[]; aliases: string[] };
/** Four explicit vertices; ER partitions a complete box cover into two arms. */
export class ShortPatterns implements PatternStrategy {
  *paths(view: ReadView, graph: PatternGraph, onlyEr = false): Generator<PathEvent> {
    const orientation = (cells: readonly number[]) =>
      cells.every((cell) => row(cell) === row(cells[0]))
        ? "row"
        : cells.every((cell) => column(cell) === column(cells[0]))
          ? "column"
          : "box";
    for (const left of graph.index.covers) {
      yield { kind: "work", units: 1 };
      if (
        left.recipe.kind !== "house-cover" ||
        left.literals.length < 2 ||
        left.literals.length > 6
      )
        continue;
      const source = defined(view.facts.get(left.recipe.source), "fact").proposition;
      if (source.kind !== "cover") continue;
      const house = classicHouseEqualTo(view, source.cells);
      if (!house) continue;
      const symbol = source.symbol,
        cells = left.literals.map((literal) => literal.cell);
      const arms: { a: number[]; b: number[]; empty?: number }[] = [];
      if (!onlyEr && cells.length === 2)
        arms.push({ a: [cells[0]], b: [cells[1]] }, { a: [cells[1]], b: [cells[0]] });
      if (orientation(house.cells) === "box")
        for (const empty of house.cells) {
          yield { kind: "work", units: 1 };
          if (cells.includes(empty)) continue;
          const first = cells.filter((cell) => row(cell) === row(empty)),
            right = cells.filter((cell) => column(cell) === column(empty));
          if (first.length && right.length && first.length + right.length === cells.length)
            arms.push({ a: first, b: right, empty }, { a: right, b: first, empty });
        }
      for (const arm of arms)
        for (const right of graph.index.covers) {
          yield { kind: "work", units: 1 };
          if (
            right.recipe.kind !== "house-cover" ||
            right.literals.length !== 2 ||
            !right.literals.every((literal) => literal.symbol === symbol)
          )
            continue;
          const rs = defined(view.facts.get(right.recipe.source), "fact").proposition;
          if (rs.kind !== "cover") continue;
          const rh = classicHouseEqualTo(view, rs.cells);
          if (!rh || rh.id === house.id) continue;
          if (arm.empty !== undefined && orientation(rh.cells) === "box") continue;
          for (const [literal, other] of [right.literals, [...right.literals].reverse()]) {
            yield { kind: "work", units: 1 };
            const all = [...arm.a, ...arm.b, literal.cell, other.cell];
            if (
              new Set(all).size !== all.length ||
              !arm.b.every((second) => graph.has(pos(second, symbol), literal))
            )
              continue;
            const effects: Effect[] = [];
            for (const target of view.assembly.problem.cells) {
              yield { kind: "work", units: 1 };
              if (
                !view.state.values[target] &&
                view.state.domains[target] & symbolMask(symbol) &&
                [...arm.a, other.cell].every(
                  (cell) => cell !== target && graph.has(pos(cell, symbol), pos(target, symbol)),
                )
              )
                effects.push({ kind: "remove", cell: target, symbol });
            }
            if (!effects.length) continue;
            const path: ShortPath = {
              symbol,
              vertices: [arm.a, arm.b, [literal.cell], [other.cell]],
              strongHouses: [house.id, rh.id],
              ...(arm.empty === undefined ? {} : { emptyIntersection: arm.empty }),
            };
            const aliases = arm.empty === undefined ? ["Turbot Fish"] : ["Empty Rectangle"];
            if (
              arm.empty === undefined &&
              orientation(house.cells) !== "box" &&
              orientation(house.cells) === orientation(rh.cells)
            )
              aliases.push("Skyscraper");
            if (
              arm.empty === undefined &&
              orientation(house.cells) !== "box" &&
              orientation(rh.cells) !== "box" &&
              orientation(house.cells) !== orientation(rh.cells) &&
              box(arm.b[0]) === box(literal.cell)
            )
              aliases.push("Two-String Kite");
            yield { kind: "path", path, effects, aliases };
          }
        }
    }
  }
  *patterns(view: ReadView, graph: PatternGraph) {
    for (const event of this.paths(view, graph)) {
      if (event.kind === "work") {
        yield event;
        continue;
      }
      for (const alias of event.aliases)
        yield {
          kind: "candidate" as const,
          pattern: { alias, paths: [event.path] } as unknown as Json,
          effects: event.effects,
        };
      if (event.aliases.includes("Empty Rectangle"))
        for (const other of this.paths(view, graph, true)) {
          if (other.kind === "work") {
            yield other;
            continue;
          }
          yield { kind: "work" as const, units: 1 };
          if (
            event.path.symbol !== other.path.symbol ||
            shortPathIdentity(view, event.path) >= shortPathIdentity(view, other.path)
          )
            continue;
          const effects = [
            ...new Map(
              [...event.effects, ...other.effects].map((effect) => [
                `${effect.cell}:${effect.symbol}`,
                effect,
              ]),
            ).values(),
          ].sort((left, right) => left.cell - right.cell || left.symbol - right.symbol);
          yield {
            kind: "candidate" as const,
            pattern: {
              alias: "Dual Empty Rectangle",
              paths: [event.path, other.path],
            } as unknown as Json,
            effects,
          };
        }
    }
  }
  *compile(view: ReadView, graph: PatternGraph, pattern: Json, effects: Effect[]) {
    const shape = pattern as unknown as ShortPattern,
      builder = new PatternBuilder(view, graph),
      roots = new Map<string, number>();
    for (const path of shape.paths) {
      const root = yield* builder.path(
        path.vertices.map((group) => group.map((cell) => pos(cell, path.symbol))),
        path.strongHouses.map((house) => builder.house(house, path.symbol)),
      );
      for (const effect of effects)
        if (
          effect.symbol === path.symbol &&
          [...path.vertices[0], ...path.vertices[3]].every(
            (cell) =>
              cell !== effect.cell &&
              graph.has(pos(cell, effect.symbol), pos(effect.cell, effect.symbol)),
          )
        )
          roots.set(`${effect.cell}:${effect.symbol}`, yield* builder.eliminate(root, effect));
    }
    return builder.finish(
      "c10@1",
      pattern,
      effects,
      effects.map((effect) => defined(roots.get(`${effect.cell}:${effect.symbol}`), "root")),
    );
  }
}
export const shortPatternTechniques = Object.freeze([
  descriptor("C10", new ShortPatterns(), [3, 0, 3, 12, 3]),
]);
