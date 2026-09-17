import type { ReadView } from "../state/types";
import type { DeductionProposal, Effect } from "../proof/types";
import type { WorkspaceReservation } from "../indexes/workspace";
import { clause } from "../proof/primitives";
import {
  boxOf,
  bitOf,
  candidates,
  choose,
  ClassicHouses,
  sortedCells,
  SpecializedProof,
  specializedDescriptor,
  specializedWork,
  type LocalRelation,
  type SpecializedWork,
  type SpecializedStrategy,
} from "./specialized-runtime";

export interface SkPlan {
  readonly alias: string;
  readonly corners: readonly number[];
  readonly groups: readonly (readonly number[])[];
  readonly links: readonly { readonly house: string; readonly symbols: readonly number[] }[];
  readonly linkMultiplicity: number;
}
/** Eight disjoint pairs arranged around the four-box rectangle. */
export function skGeometry(corners: readonly number[]): { groups: number[][]; houses: string[] } {
  const [a, b, c, d] = corners;
  const horizontal = (q: number) =>
    Array.from({ length: 9 }, (_, i) => Math.floor(q / 9) * 9 + i).filter(
      (x) => boxOf(x) === boxOf(q) && x !== q,
    );
  const vertical = (q: number) =>
    Array.from({ length: 9 }, (_, i) => i * 9 + (q % 9)).filter(
      (x) => boxOf(x) === boxOf(q) && x !== q,
    );
  return {
    groups: [
      horizontal(a),
      horizontal(b),
      vertical(b),
      vertical(c),
      horizontal(c),
      horizontal(d),
      vertical(d),
      vertical(a),
    ],
    houses: [
      `row:${Math.floor(a / 9)}`,
      `box:${boxOf(b)}`,
      `column:${b % 9}`,
      `box:${boxOf(c)}`,
      `row:${Math.floor(c / 9)}`,
      `box:${boxOf(d)}`,
      `column:${a % 9}`,
      `box:${boxOf(a)}`,
    ],
  };
}
export function* compileSkLoop(
  view: ReadView,
  p: SkPlan,
  lease?: WorkspaceReservation,
): Generator<SpecializedWork, DeductionProposal | null> {
  const b = new SpecializedProof(view, lease),
    locals: LocalRelation[] = [];
  for (const group of p.groups) locals.push(yield* b.local(group, [group]));
  const joins: number[] = [];
  let ring = locals[0];
  for (const next of locals.slice(1)) {
    ring = yield* b.joinPeers(ring, next);
    joins.push(ring.id);
  }
  if (!ring.rows.length) return null;
  // The final join includes every conflict against all earlier groups, in
  // particular group seven against group zero: that is the checked ring closure.
  const table = ring;
  const effects: Effect[] = [],
    roots: number[] = [],
    routes: any[] = [];
  for (let i = 0; i < 8; i++)
    for (const symbol of p.links[i].symbols) {
      const cells = sortedCells([...p.groups[i], ...p.groups[(i + 1) % 8]]),
        house = b.houses.house(p.links[i].house);
      const targets = house.filter(
        (c) =>
          !ring.cells.includes(c) && !view.state.values[c] && view.state.domains[c] & bitOf(symbol),
      );
      if (!targets.length) continue;
      const cover = b.project(
        table,
        clause(cells.map((cell) => ({ cell, symbol, positive: true }))),
      );
      for (const cell of targets) {
        if (effects.some((e) => e.cell === cell && e.symbol === symbol)) continue;
        let root = cover;
        const weak: number[] = [];
        for (const source of cells) {
          const edge = b.add(
            "weak-link@1",
            [b.wire.fact({ kind: "all-different", cells: house })],
            clause([
              { cell: source, symbol, positive: false },
              { cell, symbol, positive: false },
            ]),
          );
          weak.push(edge);
          root = b.resolve(root, edge, { cell: source, symbol, positive: true });
        }
        effects.push({ kind: "remove", cell, symbol });
        roots.push(root);
        routes.push({ link: i, symbol, cell, cover, weak, root });
      }
    }
  if (!effects.length) return null;
  return b.finish(
    "c30@1",
    { ...p, certificate: { locals: locals.map((t) => t.id), joins, table: table.id, routes } },
    effects,
    roots,
  );
}
/** Rectangle enumeration determines the link sets from adjacent pair domains;
 * full tuple closure decides whether those sets really saturate each house. */
export class SkLoopsSearch implements SpecializedStrategy {
  *plans(view: ReadView) {
    const h = new ClassicHouses(view);
    for (const [r, s] of choose([0, 1, 2, 3, 4, 5, 6, 7, 8], 2))
      for (const [c, d] of choose([0, 1, 2, 3, 4, 5, 6, 7, 8], 2)) {
        yield specializedWork;
        if (Math.floor(r / 3) === Math.floor(s / 3) || Math.floor(c / 3) === Math.floor(d / 3))
          continue;
        const corners = [r * 9 + c, r * 9 + d, s * 9 + d, s * 9 + c],
          g = skGeometry(corners);
        if (
          g.houses.some((id) => {
            try {
              h.house(id);
              return false;
            } catch {
              return true;
            }
          })
        )
          continue;
        const unions = g.groups.map((group) =>
            sortedCells(group.flatMap((c) => candidates(view, c))),
          ),
          incidences = unions.reduce((n, u) => n + u.length, 0);
        if (
          unions.some((u) => u.length > 6) ||
          incidences > 32 ||
          g.groups.every((g) => g.every((c) => view.state.values[c]))
        )
          continue;
        // Sixteen cell truths must fit sixteen link capacities. The incidence bound
        // rules out most rectangles before local tuple work; equality requires each
        // listed symbol to occur in both adjacent domain unions.
        const edgeSymbols = unions.map((u, i) =>
          incidences === 32
            ? u.filter((s) => unions[(i + 1) % 8].includes(s))
            : sortedCells([...u, ...unions[(i + 1) % 8]]),
        );
        const choices = edgeSymbols.map((u) => [1, 2, 3].flatMap((size) => [...choose(u, size)]));
        const walk = function* (
          i: number,
          links: number[][],
          total: number,
        ): Generator<SpecializedWork | { kind: "links"; links: number[][] }> {
          if (i === 8) {
            if (
              total === 16 &&
              unions[0].every((s) => links[0].includes(s) || links[7].includes(s))
            )
              yield { kind: "links", links };
            return;
          }
          for (const selected of choices[i]) {
            yield specializedWork;
            if (
              total + selected.length + (7 - i) > 16 ||
              total + selected.length + (7 - i) * 3 < 16 ||
              (i && unions[i].some((s) => !links[i - 1].includes(s) && !selected.includes(s)))
            )
              continue;
            yield* walk(i + 1, [...links, selected], total + selected.length);
          }
        };
        for (const event of walk(0, [], 0)) {
          if (event.kind === "work") {
            yield event;
            continue;
          }
          yield {
            kind: "plan" as const,
            plan: {
              alias: "SK Loops",
              corners,
              groups: g.groups,
              links: event.links.map((symbols, i) => ({ house: g.houses[i], symbols })),
              linkMultiplicity: 16,
            },
          };
        }
      }
  }
  compile(view: ReadView, p: SkPlan, lease?: WorkspaceReservation) {
    return compileSkLoop(view, p, lease);
  }
}
export const skLoopTechniques = Object.freeze([
  specializedDescriptor("C30", new SkLoopsSearch(), [0, 0, 9, 16, 3]),
]);
