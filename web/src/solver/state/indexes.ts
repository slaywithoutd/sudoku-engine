import type { Assembly } from "../rules/types";
import type { ReadView, CandidateState } from "./types";
import { ImmutableMap } from "./facts";
import { requireProof } from "../proof/primitives";
import { rebuildOwnedIndexes } from "./candidates";
import { symbolMask } from "./read";

interface Incidence {
  readonly constraints: readonly string[];
  readonly covers: readonly string[];
  readonly relations: readonly string[];
}
const sorted = (values: Iterable<string>) => Object.freeze([...new Set(values)].sort());

/** Immutable index service; structural incidence is shared across revisions. */
export class CandidateIndexes {
  readonly #incidence: readonly Incidence[];
  readonly #supports: ReadonlyMap<string, readonly number[]>;

  constructor(
    assembly: Assembly,
    state: CandidateState,
    previous?: CandidateIndexes,
    changed?: readonly number[],
  ) {
    this.#incidence =
      (previous && previous.#incidence) ??
      Object.freeze(
        assembly.problem.cells.map((cell) =>
          Object.freeze({
            constraints: sorted(
              assembly.problem.constraints
                .filter((rule) => rule.cells.includes(cell))
                .map((rule) => rule.id),
            ),
            covers: sorted(
              assembly.covers
                .filter((cover) => cover.cells.includes(cell))
                .map((cover) => cover.id),
            ),
            relations: sorted(
              assembly.relations
                .filter((relation) => relation.cells.includes(cell))
                .map((relation) => relation.id),
            ),
          }),
        ),
      );
    const affected = changed && new Set(changed.flatMap((cell) => this.#incidence[cell].covers));
    this.#supports = new ImmutableMap(
      [...assembly.covers]
        .sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0))
        .map((cover) => {
          const old = previous && previous.#supports.get(cover.id);
          const cells =
            old && affected && !affected.has(cover.id)
              ? old
              : Object.freeze(
                  cover.cells
                    .filter((cell) => (state.domains[cell] & symbolMask(cover.symbol)) !== 0)
                    .sort((left, right) => left - right),
                );
          return [cover.id, cells] as const;
        }),
    );
    Object.freeze(this);
  }

  supports(id: string): readonly number[] {
    const cells = this.#supports.get(id);
    requireProof(cells, "unknown-cover");
    return cells;
  }

  affected(cells: readonly number[]): Incidence {
    return Object.freeze({
      constraints: sorted(cells.flatMap((cell) => this.#incidence[cell].constraints)),
      covers: sorted(cells.flatMap((cell) => this.#incidence[cell].covers)),
      relations: sorted(cells.flatMap((cell) => this.#incidence[cell].relations)),
    });
  }
}

/** Cold baseline deliberately ignores incremental indexes and support caches. */
export function rebuildIndexes(view: ReadView): ReadView {
  return rebuildOwnedIndexes(view);
}
