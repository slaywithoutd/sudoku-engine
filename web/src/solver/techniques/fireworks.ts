import type { ReadView } from "../state/types";
import type { DeductionProposal, Effect } from "../proof/types";
import type { WorkspaceReservation } from "../indexes/workspace";
import { clause } from "../proof/primitives";
import {
  boxOf,
  candidates,
  choose,
  ClassicHouses,
  sortedCells,
  SpecializedProof,
  specializedDescriptor,
  specializedWork,
  type SpecializedWork,
  type SpecializedStrategy,
} from "./specialized-runtime";
import { symbolMask } from "../state/read";
import { defined } from "../invariants";

export interface FireworkComponent {
  readonly intersection: number;
  readonly rowWing: number;
  readonly columnWing: number;
  readonly symbols: readonly number[];
}
export interface FireworksPlan {
  readonly alias: string;
  readonly components: readonly FireworkComponent[];
  readonly selected: readonly number[];
}

/** Complete intersecting-house covers imply one occurrence in the three cells.
 * Both double components of a quad are proved before their relation is joined. */
export function* compileFireworks(
  view: ReadView,
  plan: FireworksPlan,
  lease?: WorkspaceReservation,
): Generator<SpecializedWork, DeductionProposal | null> {
  const proof = new SpecializedProof(view, lease),
    components: any[] = [];
  for (const pattern of plan.components) {
    const row = defined(proof.houses.rows[Math.floor(pattern.intersection / 9)], "rows"),
      column = defined(proof.houses.columns[pattern.intersection % 9], "columns"),
      certificates: any[] = [];
    for (const symbol of pattern.symbols) {
      yield specializedWork;
      const rowRoot = proof.cover(row, symbol),
        columnRoot = proof.cover(column, symbol);
      const routes: any[] = [];
      for (const [line, cross, wing, crossWing, start, other] of [
        [row, column, pattern.rowWing, pattern.columnWing, rowRoot, columnRoot],
        [column, row, pattern.columnWing, pattern.rowWing, columnRoot, rowRoot],
      ] as const) {
        let root = start;
        const weak: number[] = [],
          steps: number[] = [];
        for (const left of line.filter(
          (cell) =>
            cell !== pattern.intersection &&
            cell !== wing &&
            candidates(view, cell).includes(symbol),
        )) {
          let arm = other;
          for (const cell of cross.filter(
            (cell) => cell !== crossWing && candidates(view, cell).includes(symbol),
          )) {
            const edge = proof.add(
              "weak-link@1",
              [
                proof.wire.fact({
                  kind: "all-different",
                  cells: defined(proof.houses.boxes[boxOf(pattern.intersection)], "boxes"),
                }),
              ],
              clause([
                { cell: left, symbol, positive: false },
                { cell: cell, symbol, positive: false },
              ]),
            );
            weak.push(edge);
            arm = proof.resolve(arm, edge, { cell: cell, symbol, positive: true });
            steps.push(arm);
          }
          root = proof.resolve(root, arm, { cell: left, symbol, positive: true });
          steps.push(root);
        }
        routes.push({ weak, steps, root });
      }
      certificates.push({ symbol, row: rowRoot, column: columnRoot, routes });
    }
    const roots: number[] = certificates.flatMap((cert) =>
        cert.routes.map((route: any) => route.root),
      ),
      domains = new Map<number, { id: number; mask: number }>(),
      filters: number[] = [];
    // A cover may already be singleton. Carry its checked restriction into the
    // complete local domain evidence; join-filter deliberately accepts clauses
    // only and must not be widened implicitly for this degenerate case.
    for (const id of new Set(roots)) {
      const claim = defined(
        proof.nodes.find((n) => n.id === id),
        "node",
      ).conclusion;
      if (claim.kind === "literal") {
        const { cell, symbol } = claim.value,
          prior = domains.get(cell) ?? {
            id: view.state.domainFacts[cell],
            mask: view.state.domains[cell],
          },
          mask = prior.mask & symbolMask(symbol);
        domains.set(cell, {
          id: proof.add("domain-restrict@1", [prior.id, id], { kind: "domain", cell, mask }),
          mask,
        });
      }
    }
    for (const id of roots)
      if (
        defined(
          proof.nodes.find((n) => n.id === id),
          "node",
        ).conclusion.kind === "clause"
      )
        filters.push(id);
    const cells = sortedCells([pattern.intersection, pattern.rowWing, pattern.columnWing]),
      local = yield* proof.local(
        cells,
        [
          [pattern.intersection, pattern.rowWing],
          [pattern.intersection, pattern.columnWing],
        ],
        domains,
      );
    // The one-cell operand preserves the local domain, while the filters add
    // the independently derived complete symbol covers.
    const identity = yield* proof.local([pattern.intersection]);
    const relation = yield* proof.join(local, identity, filters);
    components.push({
      covers: certificates,
      local: local.id,
      identity: identity.id,
      relation: relation.id,
    });
    (components.at(-1) as any).value = relation;
  }
  let table = components[0].value;
  if (components.length === 2) table = yield* proof.joinPeers(table, components[1].value);
  if (!table.rows.length) return null;
  const effects: Effect[] = [],
    roots: number[] = [];
  for (const cell of plan.selected)
    for (const symbol of candidates(view, cell)) {
      yield specializedWork;
      if (
        !view.state.values[cell] &&
        table.rows.every((row: readonly number[]) => row[table.cells.indexOf(cell)] !== symbol)
      ) {
        effects.push({ kind: "remove", cell, symbol });
        roots.push(
          proof.project(table, { kind: "literal", value: { cell, symbol, positive: false } }),
        );
      }
    }
  if (!effects.length) return null;
  const certificate = {
    components: components.map(({ value, ...record }) => record),
    table: table.id,
  };
  return proof.finish("c29@1", { ...plan, certificate }, effects, roots);
}

/** Two independent canonical geometry/compilation jobs share one invocation. */
export class FireworksSearch implements SpecializedStrategy {
  constructor(private readonly form: "triple" | "quad" | "all" = "all") {}
  subfamilies(): readonly SpecializedStrategy[] {
    return this.form === "all"
      ? [new FireworksSearch("triple"), new FireworksSearch("quad")]
      : [this];
  }
  *plans(view: ReadView) {
    const houses = new ClassicHouses(view);
    for (let x = 0; x < 81; x++) {
      if (view.state.values[x]) continue;
      for (const y of houses.rows[Math.floor(x / 9)] ?? [])
        for (const zDigit of houses.columns[x % 9] ?? []) {
          yield specializedWork;
          if (
            boxOf(y) === boxOf(x) ||
            boxOf(zDigit) === boxOf(x) ||
            view.state.values[y] ||
            view.state.values[zDigit] ||
            !houses.boxes[boxOf(x)]
          )
            continue;
          const valid = (left: number, right: number, cell: number) =>
            candidates(view, left).filter(
              (symbol) =>
                defined(houses.rows[Math.floor(left / 9)], "rows").every(
                  (another) =>
                    boxOf(another) === boxOf(left) ||
                    another === right ||
                    !candidates(view, another).includes(symbol),
                ) &&
                defined(houses.columns[left % 9], "columns").every(
                  (another) =>
                    boxOf(another) === boxOf(left) ||
                    another === cell ||
                    !candidates(view, another).includes(symbol),
                ),
            );
          const symbols = valid(x, y, zDigit);
          if (this.form !== "quad")
            for (const core of choose(symbols, 3))
              yield {
                kind: "plan" as const,
                plan: {
                  alias: "Triple Fireworks",
                  components: [{ intersection: x, rowWing: y, columnWing: zDigit, symbols: core }],
                  selected: sortedCells([x, y, zDigit]),
                },
              };
          if (this.form === "triple") continue;
          const opposite = Math.floor(zDigit / 9) * 9 + (y % 9);
          if (
            opposite <= x ||
            view.state.values[opposite] ||
            !houses.rows[Math.floor(opposite / 9)] ||
            !houses.columns[opposite % 9] ||
            !houses.boxes[boxOf(opposite)]
          )
            continue;
          const other = valid(opposite, zDigit, y);
          for (const first of choose(symbols, 2))
            for (const second of choose(other, 2)) {
              yield specializedWork;
              if (first.some((symbol) => second.includes(symbol))) continue;
              yield {
                kind: "plan" as const,
                plan: {
                  alias: "Quadruple Fireworks",
                  components: [
                    { intersection: x, rowWing: y, columnWing: zDigit, symbols: first },
                    { intersection: opposite, rowWing: zDigit, columnWing: y, symbols: second },
                  ],
                  selected: sortedCells([x, y, zDigit, opposite]),
                },
              };
            }
        }
    }
  }
  compile(view: ReadView, plan: FireworksPlan, lease?: WorkspaceReservation) {
    return compileFireworks(view, plan, lease);
  }
}
export const fireworksTechniques = Object.freeze([
  specializedDescriptor("C29", new FireworksSearch(), [0, 0, 9, 4, 4]),
]);
