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
import { defined } from "../invariants";

export interface JuniorPlan {
  readonly orientation: "row" | "column";
  readonly base: readonly number[];
  readonly targets: readonly number[];
  readonly companions: readonly number[];
  readonly crossLines: readonly string[];
  readonly sCells: readonly number[];
  readonly baseSymbols: readonly number[];
  readonly covers: readonly {
    readonly symbol: number;
    readonly houses: readonly string[];
    readonly occurrences: readonly number[];
    readonly assignedOccurrences: readonly number[];
  }[];
}
export type ExocetPlan =
  | ({ readonly alias: string } & JuniorPlan)
  | { readonly alias: "Double Exocet"; readonly components: readonly JuniorPlan[] };

/** Emits the actual weighted scopes and every nonzero incidence domain. */
function countClause(
  proof: SpecializedProof,
  pattern: JuniorPlan,
  base: number,
  symbol: number,
  targets: readonly number[],
): number {
  const capacityNames = [
    ...defined(
      pattern.covers.find((cover) => cover.symbol === symbol),
      "cover",
    ).houses,
    `${pattern.orientation}:${pattern.orientation === "row" ? Math.floor(base / 9) : base % 9}`,
    `box:${boxOf(base)}`,
  ];
  const covers = pattern.crossLines.map((name) =>
    proof.wire.fact({ kind: "cover", symbol, cells: proof.houses.house(name) }),
  );
  const capacities = capacityNames.map((name) =>
    proof.wire.fact({ kind: "all-different", cells: proof.houses.house(name) }),
  );
  const weightedCapacities = [...new Set(capacities)].map((premise) => ({
    premise,
    coefficient: capacities.filter((id) => id === premise).length,
  }));
  const coefficients = new Map<number, number>();
  for (const [names, sign] of [
    [pattern.crossLines, -1],
    [capacityNames, 1],
  ] as const)
    for (const name of names)
      for (const cell of proof.houses.house(name))
        coefficients.set(cell, (coefficients.get(cell) ?? 0) + sign);
  const needed = sortedCells(
    [...coefficients]
      .filter(([, left]) => left !== 0)
      .map(([cell]) => cell)
      .concat([base, ...targets]),
  );
  return proof.add(
    "cover-count-clause@1",
    [
      ...covers,
      ...weightedCapacities.map((term) => term.premise),
      ...needed.map((cell) => proof.view.state.domainFacts[cell]),
    ],
    clause([
      { cell: base, symbol, positive: false },
      ...targets.map((cell) => ({ cell, symbol, positive: true })),
    ]),
    {
      symbol,
      covers: covers.map((premise) => ({ premise, coefficient: 1 })),
      capacities: weightedCapacities,
    },
  );
}

export function* compileExocet(
  view: ReadView,
  pattern: ExocetPlan,
  lease?: WorkspaceReservation,
): Generator<SpecializedWork, DeductionProposal | null> {
  const proof = new SpecializedProof(view, lease),
    plans = "components" in pattern ? pattern.components : [pattern],
    components: any[] = [];
  for (const plan of plans) {
    const cells = sortedCells([...plan.base, ...plan.targets]),
      local = yield* proof.local(cells, [plan.base]),
      counts: any[] = [];
    for (const symbol of plan.baseSymbols)
      for (const base of plan.base)
        if (candidates(view, base).includes(symbol)) {
          const cover = defined(
            plan.covers.find((symbolCover) => symbolCover.symbol === symbol),
            "cover",
          );
          const clauses =
            cover.houses.length === 1
              ? plan.targets.map((target) => [target])
              : [[...plan.targets]];
          for (const targets of clauses) {
            yield specializedWork;
            const forced = targets.find((target) => view.state.domains[target] === bitOf(symbol));
            const root =
              forced === undefined
                ? countClause(proof, plan, base, symbol, targets)
                : proof.project(
                    local,
                    clause([
                      { cell: base, symbol, positive: false },
                      ...targets.map((cell) => ({ cell, symbol, positive: true })),
                    ]),
                  );
            counts.push({
              base,
              symbol,
              targets,
              kind: forced === undefined ? "count" : "domain",
              root,
            });
          }
        }
    const identity = yield* proof.local([plan.base[0]]),
      relation = yield* proof.join(
        local,
        identity,
        counts.map((count) => count.root),
      );
    if (!relation.rows.length) return null;
    components.push({
      local: local.id,
      identity: identity.id,
      counts,
      relation: relation.id,
      value: relation,
    });
  }
  let table: LocalRelation = components[0].value;
  if (components.length === 2) table = yield* proof.joinPeers(table, components[1].value);
  if (!table.rows.length) return null;
  const effects: Effect[] = [],
    roots: number[] = [];
  for (const cell of table.cells)
    for (const symbol of candidates(view, cell)) {
      yield specializedWork;
      if (
        !view.state.values[cell] &&
        table.rows.every((row) => row[table.cells.indexOf(cell)] !== symbol)
      ) {
        effects.push({ kind: "remove", cell, symbol });
        roots.push(
          proof.project(table, { kind: "literal", value: { cell, symbol, positive: false } }),
        );
      }
    }
  if (!effects.length) return null;
  return proof.finish(
    "c31@1",
    {
      ...pattern,
      certificate: { components: components.map(({ value, ...rest }) => rest), table: table.id },
    },
    effects,
    roots,
  );
}

/** Separate Junior/Double searches in each orientation prevent an expensive
 * compiler (or a long geometry cursor) from blocking the other forms. Double
 * owns its own bounded-by-workspace catalogue of prior Junior geometries. */
export class ExocetSearch implements SpecializedStrategy {
  constructor(
    private readonly form: "junior" | "double" | "all" = "all",
    private readonly orientation?: "row" | "column",
  ) {}
  subfamilies(): readonly SpecializedStrategy[] {
    return this.form === "all"
      ? [
          new ExocetSearch("junior", "row"),
          new ExocetSearch("double", "row"),
          new ExocetSearch("junior", "column"),
          new ExocetSearch("double", "column"),
        ]
      : [this];
  }
  *plans(view: ReadView, lease?: WorkspaceReservation) {
    const houses = new ClassicHouses(view),
      prior: JuniorPlan[] = [];
    for (const orientation of this.orientation
      ? [this.orientation]
      : (["row", "column"] as const)) {
      const at = (rowIndex: number, cell: number) =>
        orientation === "row" ? rowIndex * 9 + cell : cell * 9 + rowIndex;
      for (let band = 0; band < 3; band++)
        for (let line = band * 3; line < band * 3 + 3; line++)
          for (let stack = 0; stack < 3; stack++)
            for (const selected of choose([0, 1, 2], 2)) {
              yield specializedWork;
              const base = selected
                  .map((i) => at(line, stack * 3 + i))
                  .sort((left, right) => left - right),
                baseSymbols = sortedCells(base.flatMap((cell) => candidates(view, cell)));
              if (
                base.some((cell) => view.state.values[cell]) ||
                baseSymbols.length < 3 ||
                baseSymbols.length > 4
              )
                continue;
              const otherRows = [band * 3, band * 3 + 1, band * 3 + 2].filter(
                  (otherRow) => otherRow !== line,
                ),
                otherStacks = [0, 1, 2].filter((symbol) => symbol !== stack),
                unused =
                  stack * 3 +
                  defined(
                    [0, 1, 2].find((i) => !selected.includes(i)),
                    "find",
                  );
              for (const order of [otherRows, [...otherRows].reverse()])
                for (let left = 0; left < 3; left++)
                  for (let right = 0; right < 3; right++) {
                    yield specializedWork;
                    const columns = [otherStacks[0] * 3 + left, otherStacks[1] * 3 + right],
                      targets = columns.map((cell, i) => at(order[i], cell)),
                      companions = columns.map((cell, i) => at(order[1 - i], cell));
                    if (
                      targets.some((cell) => view.state.values[cell]) ||
                      companions.some((cell) =>
                        baseSymbols.some((symbol) => candidates(view, cell).includes(symbol)),
                      )
                    )
                      continue;
                    const crossLines = [unused, ...columns].map(
                        (cell) => `${orientation === "row" ? "column" : "row"}:${cell}`,
                      ),
                      sCells = sortedCells(
                        [unused, ...columns].flatMap((cell) =>
                          Array.from({ length: 9 }, (_, rowIndex) => rowIndex)
                            .filter((rowIndex) => Math.floor(rowIndex / 3) !== band)
                            .map((rowIndex) => at(rowIndex, cell)),
                        ),
                      );
                    const scopes = [...houses.rows, ...houses.columns, ...houses.boxes].filter(
                        (value): value is readonly number[] => !!value,
                      ),
                      covers: JuniorPlan["covers"][number][] = [];
                    for (const symbol of baseSymbols) {
                      const occurrences = sCells.filter((cell) =>
                          candidates(view, cell).includes(symbol),
                        ),
                        assignedOccurrences = sCells.filter(
                          (cell) => view.state.values[cell] === symbol,
                        );
                      let chosen: (readonly number[])[] | undefined;
                      for (const scope of scopes) {
                        yield specializedWork;
                        if (occurrences.every((cell) => scope.includes(cell))) {
                          chosen = [scope];
                          break;
                        }
                      }
                      if (!chosen)
                        for (const pair of choose(scopes, 2)) {
                          yield specializedWork;
                          if (occurrences.every((cell) => pair.some((s) => s.includes(cell)))) {
                            chosen = pair;
                            break;
                          }
                        }
                      if (!chosen) break;
                      covers.push({
                        symbol,
                        houses: chosen.map((s) => houses.id(s)),
                        occurrences,
                        assignedOccurrences,
                      });
                    }
                    if (covers.length !== baseSymbols.length) continue;
                    const plan: JuniorPlan = {
                      orientation,
                      base,
                      targets,
                      companions,
                      crossLines,
                      sCells,
                      baseSymbols,
                      covers,
                    };
                    if (this.form !== "double")
                      yield { kind: "plan" as const, plan: { alias: "Junior Exocet", ...plan } };
                    if (this.form === "junior") continue;
                    for (const previous of prior) {
                      yield specializedWork;
                      if (
                        previous.orientation !== orientation ||
                        Math.floor(
                          (orientation === "row"
                            ? Math.floor(previous.base[0] / 9)
                            : previous.base[0] % 9) / 3,
                        ) !== band ||
                        new Set([...previous.targets, ...targets]).size !== 4 ||
                        new Set([...previous.baseSymbols, ...baseSymbols]).size > 4
                      )
                        continue;
                      yield {
                        kind: "plan" as const,
                        plan: { alias: "Double Exocet", components: [previous, plan] },
                      };
                    }
                    lease?.grow(1, 8192);
                    prior.push(plan);
                  }
            }
    }
  }
  compile(view: ReadView, pattern: ExocetPlan, lease?: WorkspaceReservation) {
    return compileExocet(view, pattern, lease);
  }
}
export const exocetTechniques = Object.freeze([
  specializedDescriptor("C31", new ExocetSearch(), [0, 0, 9, 81, 4]),
]);
