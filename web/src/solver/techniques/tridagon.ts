import type { ReadView } from "../state/types";
import type { DeductionProposal } from "../proof/types";
import type { WorkspaceReservation } from "../indexes/workspace";
import { clause } from "../proof/primitives";
import {
  bitOf,
  candidates,
  choose,
  ClassicHouses,
  product,
  SpecializedProof,
  specializedDescriptor,
  specializedWork,
  type LocalRelation,
  type SpecializedWork,
  type SpecializedStrategy,
} from "./specialized-runtime";

export interface TridagonPlan {
  readonly alias: string;
  readonly boxes: readonly number[];
  readonly triples: readonly (readonly number[])[];
  readonly coreSymbols: readonly number[];
  readonly guardians: readonly { readonly cell: number; readonly symbol: number }[];
}
/** Four complete local permutations, with a concrete actual conflict for every
 * Cartesian combination; the positive guardians remain an OR, never an XOR. */
export function* compileTridagon(
  view: ReadView,
  shape: TridagonPlan,
  lease?: WorkspaceReservation,
): Generator<SpecializedWork, DeductionProposal | null> {
  const proof = new SpecializedProof(view, lease),
    permutations: number[][][] = [],
    rejections: number[][] = [];
  for (const group of shape.triples) {
    const rows: number[][] = [];
    for (const row of product(
      group.map((cell) =>
        shape.coreSymbols.filter((symbol) => view.state.domains[cell] & bitOf(symbol)),
      ),
    )) {
      yield specializedWork;
      if (new Set(row).size === 3) rows.push(row);
    }
    if (!rows.length) return null;
    permutations.push(rows);
  }
  const all = shape.triples.flat(),
    indexes = permutations.map((rows) => rows.map((_, i) => i));
  for (const selected of product(indexes)) {
    yield specializedWork;
    const assignment = selected.flatMap((j, i) => permutations[i][j]);
    let conflict: number[] | undefined;
    for (let i = 0; i < 12 && !conflict; i++)
      for (let j = i + 1; j < 12; j++)
        if (assignment[i] === assignment[j] && proof.houses.peer(all[i], all[j])) {
          conflict = [all[i], all[j]];
          break;
        }
    if (!conflict) return null;
    rejections.push(conflict);
    lease?.grow(0, 32);
  }
  const locals: LocalRelation[] = [];
  for (const triple of shape.triples) locals.push(yield* proof.local(triple, [triple]));
  let table = locals[0];
  const joins: number[] = [];
  for (const next of locals.slice(1)) {
    table = yield* proof.joinPeers(table, next);
    joins.push(table.id);
  }
  if (!table.rows.length) return null;
  const conclusion = clause(shape.guardians.map((group) => ({ ...group, positive: true }))),
    theorem = proof.project(table, conclusion);
  const pattern = {
    ...shape,
    certificate: {
      permutations,
      rejections,
      locals: locals.map((local) => local.id),
      joins,
      table: table.id,
      theorem,
    },
  };
  if (shape.guardians.length === 1)
    return proof.wire.finish("c32@1", pattern, { kind: "place", ...shape.guardians[0] }, theorem);
  return proof.wire.bundle("c32@1", pattern, [], [theorem]);
}
/** Canonical box rectangles and core symbol triples; actual current domains
 * bound guardian enumeration before expensive four-component joins. */
export class TridagonSearch implements SpecializedStrategy {
  *plans(view: ReadView) {
    const houses = new ClassicHouses(view);
    for (const core of choose(view.assembly.problem.symbols, 3))
      for (const bands of choose([0, 1, 2], 2))
        for (const stacks of choose([0, 1, 2], 2)) {
          yield specializedWork;
          const boxes = bands.flatMap((right) => stacks.map((symbol) => right * 3 + symbol)),
            options: { cells: number[]; guardians: { cell: number; symbol: number }[] }[][] = [];
          for (const box of boxes) {
            const choices = [];
            for (const group of choose(
              (houses.boxes[box] ?? []).filter((cell) =>
                candidates(view, cell).some((symbol) => core.includes(symbol)),
              ),
              3,
            )) {
              yield specializedWork;
              const guardians = group.flatMap((cell) =>
                candidates(view, cell)
                  .filter((symbol) => !core.includes(symbol))
                  .map((symbol) => ({ cell, symbol })),
              );
              let possible = false;
              for (const row of product(
                group.map((cell) =>
                  core.filter((symbol) => candidates(view, cell).includes(symbol)),
                ),
              ))
                if (new Set(row).size === 3) {
                  possible = true;
                  break;
                }
              if (guardians.length > 4 || !possible) continue;
              choices.push({ cells: group, guardians });
            }
            options.push(choices);
          }
          if (options.some((option) => !option.length)) continue;
          for (const selected of product(options.map((value) => value.map((_, i) => i)))) {
            yield specializedWork;
            const groups = selected.map((j, i) => options[i][j]),
              guardians = groups
                .flatMap((group) => group.guardians)
                .sort((left, right) => left.cell - right.cell || left.symbol - right.symbol);
            if (guardians.length < 1 || guardians.length > 4) continue;
            const triples = groups.map((group) => group.cells),
              sparse = triples.some((triple) =>
                triple.some((cell) =>
                  core.some((symbol) => !candidates(view, cell).includes(symbol)),
                ),
              );
            yield {
              kind: "plan" as const,
              plan: {
                alias: sparse
                  ? "Degenerate Tridagon"
                  : guardians.length === 1
                    ? "Tridagon"
                    : "Tridagon guardians",
                boxes,
                triples,
                coreSymbols: core,
                guardians,
              },
            };
          }
        }
  }
  compile(view: ReadView, pattern: TridagonPlan, lease?: WorkspaceReservation) {
    return compileTridagon(view, pattern, lease);
  }
}
export const tridagonTechniques = Object.freeze([
  specializedDescriptor("C32", new TridagonSearch(), [0, 1, 6, 12, 4]),
]);
