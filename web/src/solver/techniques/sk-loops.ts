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
  const [cornerA, cornerB, cornerC, cornerD] = corners;
  const horizontal = (cell: number) =>
    Array.from({ length: 9 }, (_, i) => Math.floor(cell / 9) * 9 + i).filter(
      (x) => boxOf(x) === boxOf(cell) && x !== cell,
    );
  const vertical = (cell: number) =>
    Array.from({ length: 9 }, (_, i) => i * 9 + (cell % 9)).filter(
      (x) => boxOf(x) === boxOf(cell) && x !== cell,
    );
  return {
    groups: [
      horizontal(cornerA),
      horizontal(cornerB),
      vertical(cornerB),
      vertical(cornerC),
      horizontal(cornerC),
      horizontal(cornerD),
      vertical(cornerD),
      vertical(cornerA),
    ],
    houses: [
      `row:${Math.floor(cornerA / 9)}`,
      `box:${boxOf(cornerB)}`,
      `column:${cornerB % 9}`,
      `box:${boxOf(cornerC)}`,
      `row:${Math.floor(cornerC / 9)}`,
      `box:${boxOf(cornerD)}`,
      `column:${cornerA % 9}`,
      `box:${boxOf(cornerA)}`,
    ],
  };
}
export function* compileSkLoop(
  view: ReadView,
  pattern: SkPlan,
  lease?: WorkspaceReservation,
): Generator<SpecializedWork, DeductionProposal | null> {
  const proof = new SpecializedProof(view, lease),
    locals: LocalRelation[] = [];
  for (const group of pattern.groups) locals.push(yield* proof.local(group, [group]));
  const joins: number[] = [];
  let ring = locals[0];
  for (const next of locals.slice(1)) {
    ring = yield* proof.joinPeers(ring, next);
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
    for (const symbol of pattern.links[i].symbols) {
      const cells = sortedCells([...pattern.groups[i], ...pattern.groups[(i + 1) % 8]]),
        houseCells = proof.houses.house(pattern.links[i].house);
      const targets = houseCells.filter(
        (cell) =>
          !ring.cells.includes(cell) &&
          !view.state.values[cell] &&
          view.state.domains[cell] & bitOf(symbol),
      );
      if (!targets.length) continue;
      const cover = proof.project(
        table,
        clause(cells.map((cell) => ({ cell, symbol, positive: true }))),
      );
      for (const cell of targets) {
        if (effects.some((effect) => effect.cell === cell && effect.symbol === symbol)) continue;
        let root = cover;
        const weak: number[] = [];
        for (const source of cells) {
          const edge = proof.add(
            "weak-link@1",
            [proof.wire.fact({ kind: "all-different", cells: houseCells })],
            clause([
              { cell: source, symbol, positive: false },
              { cell, symbol, positive: false },
            ]),
          );
          weak.push(edge);
          root = proof.resolve(root, edge, { cell: source, symbol, positive: true });
        }
        effects.push({ kind: "remove", cell, symbol });
        roots.push(root);
        routes.push({ link: i, symbol, cell, cover, weak, root });
      }
    }
  if (!effects.length) return null;
  return proof.finish(
    "c30@1",
    {
      ...pattern,
      certificate: { locals: locals.map((local) => local.id), joins, table: table.id, routes },
    },
    effects,
    roots,
  );
}
/** Rectangle enumeration determines the link sets from adjacent pair domains;
 * full tuple closure decides whether those sets really saturate each house. */
export class SkLoopsSearch implements SpecializedStrategy {
  *plans(view: ReadView) {
    const houses = new ClassicHouses(view);
    for (const [firstRow, secondRow] of choose([0, 1, 2, 3, 4, 5, 6, 7, 8], 2))
      for (const [firstColumn, secondColumn] of choose([0, 1, 2, 3, 4, 5, 6, 7, 8], 2)) {
        yield specializedWork;
        if (
          Math.floor(firstRow / 3) === Math.floor(secondRow / 3) ||
          Math.floor(firstColumn / 3) === Math.floor(secondColumn / 3)
        )
          continue;
        const corners = [
            firstRow * 9 + firstColumn,
            firstRow * 9 + secondColumn,
            secondRow * 9 + secondColumn,
            secondRow * 9 + firstColumn,
          ],
          group = skGeometry(corners);
        if (
          group.houses.some((id) => {
            try {
              houses.house(id);
              return false;
            } catch {
              return true;
            }
          })
        )
          continue;
        const unions = group.groups.map((group) =>
            sortedCells(group.flatMap((cell) => candidates(view, cell))),
          ),
          incidences = unions.reduce((n, union) => n + union.length, 0);
        if (
          unions.some((union) => union.length > 6) ||
          incidences > 32 ||
          group.groups.every((group) => group.every((cell) => view.state.values[cell]))
        )
          continue;
        // Sixteen cell truths must fit sixteen link capacities. The incidence bound
        // rules out most rectangles before local tuple work; equality requires each
        // listed symbol to occur in both adjacent domain unions.
        const edgeSymbols = unions.map((union, i) =>
          incidences === 32
            ? union.filter((symbol) => unions[(i + 1) % 8].includes(symbol))
            : sortedCells([...union, ...unions[(i + 1) % 8]]),
        );
        const choices = edgeSymbols.map((union) =>
          [1, 2, 3].flatMap((size) => [...choose(union, size)]),
        );
        const walk = function* (
          i: number,
          links: number[][],
          total: number,
        ): Generator<SpecializedWork | { kind: "links"; links: number[][] }> {
          if (i === 8) {
            if (
              total === 16 &&
              unions[0].every((symbol) => links[0].includes(symbol) || links[7].includes(symbol))
            )
              yield { kind: "links", links };
            return;
          }
          for (const selected of choices[i]) {
            yield specializedWork;
            if (
              total + selected.length + (7 - i) > 16 ||
              total + selected.length + (7 - i) * 3 < 16 ||
              (i &&
                unions[i].some(
                  (symbol) => !links[i - 1].includes(symbol) && !selected.includes(symbol),
                ))
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
              groups: group.groups,
              links: event.links.map((symbols, i) => ({ house: group.houses[i], symbols })),
              linkMultiplicity: 16,
            },
          };
        }
      }
  }
  compile(view: ReadView, pattern: SkPlan, lease?: WorkspaceReservation) {
    return compileSkLoop(view, pattern, lease);
  }
}
export const skLoopTechniques = Object.freeze([
  specializedDescriptor("C30", new SkLoopsSearch(), [0, 0, 9, 16, 3]),
]);
