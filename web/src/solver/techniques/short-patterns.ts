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

type PathEvent =
  | { kind: "work"; units: number }
  | { kind: "path"; path: ShortPath; effects: Effect[]; aliases: string[] };
/** Four explicit vertices; ER partitions a complete box cover into two arms. */
export class ShortPatterns implements PatternStrategy {
  *paths(view: ReadView, graph: PatternGraph, onlyEr = false): Generator<PathEvent> {
    const orientation = (cells: readonly number[]) =>
      cells.every((c) => row(c) === row(cells[0]))
        ? "row"
        : cells.every((c) => column(c) === column(cells[0]))
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
      const source = view.facts.get(left.recipe.source)!.proposition;
      if (source.kind !== "cover") continue;
      const h = classicHouseEqualTo(view, source.cells);
      if (!h) continue;
      const symbol = source.symbol,
        cells = left.literals.map((l) => l.cell);
      const arms: { a: number[]; b: number[]; empty?: number }[] = [];
      if (!onlyEr && cells.length === 2)
        arms.push({ a: [cells[0]], b: [cells[1]] }, { a: [cells[1]], b: [cells[0]] });
      if (orientation(h.cells) === "box")
        for (const empty of h.cells) {
          yield { kind: "work", units: 1 };
          if (cells.includes(empty)) continue;
          const a = cells.filter((c) => row(c) === row(empty)),
            b = cells.filter((c) => column(c) === column(empty));
          if (a.length && b.length && a.length + b.length === cells.length)
            arms.push({ a, b, empty }, { a: b, b: a, empty });
        }
      for (const arm of arms)
        for (const right of graph.index.covers) {
          yield { kind: "work", units: 1 };
          if (
            right.recipe.kind !== "house-cover" ||
            right.literals.length !== 2 ||
            !right.literals.every((l) => l.symbol === symbol)
          )
            continue;
          const rs = view.facts.get(right.recipe.source)!.proposition;
          if (rs.kind !== "cover") continue;
          const rh = classicHouseEqualTo(view, rs.cells);
          if (!rh || rh.id === h.id) continue;
          if (arm.empty !== undefined && orientation(rh.cells) === "box") continue;
          for (const [c, d] of [right.literals, [...right.literals].reverse()]) {
            yield { kind: "work", units: 1 };
            const all = [...arm.a, ...arm.b, c.cell, d.cell];
            if (
              new Set(all).size !== all.length ||
              !arm.b.every((b) => graph.has(pos(b, symbol), c))
            )
              continue;
            const effects: Effect[] = [];
            for (const target of view.assembly.problem.cells) {
              yield { kind: "work", units: 1 };
              if (
                !view.state.values[target] &&
                view.state.domains[target] & symbolMask(symbol) &&
                [...arm.a, d.cell].every(
                  (cell) => cell !== target && graph.has(pos(cell, symbol), pos(target, symbol)),
                )
              )
                effects.push({ kind: "remove", cell: target, symbol });
            }
            if (!effects.length) continue;
            const path: ShortPath = {
              symbol,
              vertices: [arm.a, arm.b, [c.cell], [d.cell]],
              strongHouses: [h.id, rh.id],
              ...(arm.empty === undefined ? {} : { emptyIntersection: arm.empty }),
            };
            const aliases = arm.empty === undefined ? ["Turbot Fish"] : ["Empty Rectangle"];
            if (
              arm.empty === undefined &&
              orientation(h.cells) !== "box" &&
              orientation(h.cells) === orientation(rh.cells)
            )
              aliases.push("Skyscraper");
            if (
              arm.empty === undefined &&
              orientation(h.cells) !== "box" &&
              orientation(rh.cells) !== "box" &&
              orientation(h.cells) !== orientation(rh.cells) &&
              box(arm.b[0]) === box(c.cell)
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
              [...event.effects, ...other.effects].map((e) => [`${e.cell}:${e.symbol}`, e]),
            ).values(),
          ].sort((a, b) => a.cell - b.cell || a.symbol - b.symbol);
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
    const p = pattern as unknown as ShortPattern,
      b = new PatternBuilder(view, graph),
      roots = new Map<string, number>();
    for (const path of p.paths) {
      const root = yield* b.path(
        path.vertices.map((g) => g.map((c) => pos(c, path.symbol))),
        path.strongHouses.map((h) => b.house(h, path.symbol)),
      );
      for (const e of effects)
        if (
          e.symbol === path.symbol &&
          [...path.vertices[0], ...path.vertices[3]].every(
            (c) => c !== e.cell && graph.has(pos(c, e.symbol), pos(e.cell, e.symbol)),
          )
        )
          roots.set(`${e.cell}:${e.symbol}`, yield* b.eliminate(root, e));
    }
    return b.finish(
      "c10@1",
      pattern,
      effects,
      effects.map((e) => roots.get(`${e.cell}:${e.symbol}`)!),
    );
  }
}
export const shortPatternTechniques = Object.freeze([
  descriptor("C10", new ShortPatterns(), [3, 0, 3, 12, 3]),
]);
