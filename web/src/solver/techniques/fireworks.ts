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
  const b = new SpecializedProof(view, lease),
    components: any[] = [];
  for (const p of plan.components) {
    const row = b.houses.rows[Math.floor(p.intersection / 9)]!,
      column = b.houses.columns[p.intersection % 9]!,
      certificates: any[] = [];
    for (const symbol of p.symbols) {
      yield specializedWork;
      const rowRoot = b.cover(row, symbol),
        columnRoot = b.cover(column, symbol);
      const routes: any[] = [];
      for (const [line, cross, wing, crossWing, start, other] of [
        [row, column, p.rowWing, p.columnWing, rowRoot, columnRoot],
        [column, row, p.columnWing, p.rowWing, columnRoot, rowRoot],
      ] as const) {
        let root = start;
        const weak: number[] = [],
          steps: number[] = [];
        for (const a of line.filter(
          (c) => c !== p.intersection && c !== wing && candidates(view, c).includes(symbol),
        )) {
          let arm = other;
          for (const c of cross.filter(
            (c) => c !== crossWing && candidates(view, c).includes(symbol),
          )) {
            const edge = b.add(
              "weak-link@1",
              [
                b.wire.fact({
                  kind: "all-different",
                  cells: b.houses.boxes[boxOf(p.intersection)]!,
                }),
              ],
              clause([
                { cell: a, symbol, positive: false },
                { cell: c, symbol, positive: false },
              ]),
            );
            weak.push(edge);
            arm = b.resolve(arm, edge, { cell: c, symbol, positive: true });
            steps.push(arm);
          }
          root = b.resolve(root, arm, { cell: a, symbol, positive: true });
          steps.push(root);
        }
        routes.push({ weak, steps, root });
      }
      certificates.push({ symbol, row: rowRoot, column: columnRoot, routes });
    }
    const roots: number[] = certificates.flatMap((c) => c.routes.map((r: any) => r.root)),
      domains = new Map<number, { id: number; mask: number }>(),
      filters: number[] = [];
    // A cover may already be singleton. Carry its checked restriction into the
    // complete local domain evidence; join-filter deliberately accepts clauses
    // only and must not be widened implicitly for this degenerate case.
    for (const id of new Set(roots)) {
      const claim = b.nodes.find((n) => n.id === id)!.conclusion;
      if (claim.kind === "literal") {
        const { cell, symbol } = claim.value,
          prior = domains.get(cell) ?? {
            id: view.state.domainFacts[cell],
            mask: view.state.domains[cell],
          },
          mask = prior.mask & symbolMask(symbol);
        domains.set(cell, {
          id: b.add("domain-restrict@1", [prior.id, id], { kind: "domain", cell, mask }),
          mask,
        });
      }
    }
    for (const id of roots)
      if (b.nodes.find((n) => n.id === id)!.conclusion.kind === "clause") filters.push(id);
    const cells = sortedCells([p.intersection, p.rowWing, p.columnWing]),
      local = yield* b.local(
        cells,
        [
          [p.intersection, p.rowWing],
          [p.intersection, p.columnWing],
        ],
        domains,
      );
    // The one-cell operand preserves the local domain, while the filters add
    // the independently derived complete symbol covers.
    const identity = yield* b.local([p.intersection]);
    const relation = yield* b.join(local, identity, filters);
    components.push({
      covers: certificates,
      local: local.id,
      identity: identity.id,
      relation: relation.id,
    });
    (components.at(-1) as any).value = relation;
  }
  let table = components[0].value;
  if (components.length === 2) table = yield* b.joinPeers(table, components[1].value);
  if (!table.rows.length) return null;
  const effects: Effect[] = [],
    roots: number[] = [];
  for (const cell of plan.selected)
    for (const symbol of candidates(view, cell)) {
      yield specializedWork;
      if (
        !view.state.values[cell] &&
        table.rows.every((r: readonly number[]) => r[table.cells.indexOf(cell)] !== symbol)
      ) {
        effects.push({ kind: "remove", cell, symbol });
        roots.push(b.project(table, { kind: "literal", value: { cell, symbol, positive: false } }));
      }
    }
  if (!effects.length) return null;
  const certificate = {
    components: components.map(({ value, ...record }) => record),
    table: table.id,
  };
  return b.finish("c29@1", { ...plan, certificate }, effects, roots);
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
    const h = new ClassicHouses(view);
    for (let x = 0; x < 81; x++) {
      if (view.state.values[x]) continue;
      for (const y of h.rows[Math.floor(x / 9)] ?? [])
        for (const z of h.columns[x % 9] ?? []) {
          yield specializedWork;
          if (
            boxOf(y) === boxOf(x) ||
            boxOf(z) === boxOf(x) ||
            view.state.values[y] ||
            view.state.values[z] ||
            !h.boxes[boxOf(x)]
          )
            continue;
          const valid = (a: number, b: number, c: number) =>
            candidates(view, a).filter(
              (s) =>
                h.rows[Math.floor(a / 9)]!.every(
                  (q) => boxOf(q) === boxOf(a) || q === b || !candidates(view, q).includes(s),
                ) &&
                h.columns[a % 9]!.every(
                  (q) => boxOf(q) === boxOf(a) || q === c || !candidates(view, q).includes(s),
                ),
            );
          const symbols = valid(x, y, z);
          if (this.form !== "quad")
            for (const core of choose(symbols, 3))
              yield {
                kind: "plan" as const,
                plan: {
                  alias: "Triple Fireworks",
                  components: [{ intersection: x, rowWing: y, columnWing: z, symbols: core }],
                  selected: sortedCells([x, y, z]),
                },
              };
          if (this.form === "triple") continue;
          const opposite = Math.floor(z / 9) * 9 + (y % 9);
          if (
            opposite <= x ||
            view.state.values[opposite] ||
            !h.rows[Math.floor(opposite / 9)] ||
            !h.columns[opposite % 9] ||
            !h.boxes[boxOf(opposite)]
          )
            continue;
          const other = valid(opposite, z, y);
          for (const first of choose(symbols, 2))
            for (const second of choose(other, 2)) {
              yield specializedWork;
              if (first.some((s) => second.includes(s))) continue;
              yield {
                kind: "plan" as const,
                plan: {
                  alias: "Quadruple Fireworks",
                  components: [
                    { intersection: x, rowWing: y, columnWing: z, symbols: first },
                    { intersection: opposite, rowWing: z, columnWing: y, symbols: second },
                  ],
                  selected: sortedCells([x, y, z, opposite]),
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
