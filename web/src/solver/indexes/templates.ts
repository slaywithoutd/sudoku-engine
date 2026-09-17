import type { ReadView } from "../state/types";
import { assertOwnedView, isAcceptedDescendant } from "../state/candidates";
import { buildIndex, evidence, freezeRecord, OwnedIndex, work } from "./workspace";
import type { IndexEntry, IndexEvent, IndexWorkspace } from "./workspace";
import { symbolMask } from "../state/read";

export const TEMPLATE_TUPLE_LIMIT = 100000;
export class TemplateLimit extends Error {
  constructor(readonly reason: "template-tuple-limit" | "template-state-mismatch") {
    super(reason);
  }
}
/**
 * One explicit owner per operation/branch. Only a newer candidate revision
 * resets the overlay allowance; prefix extensions, slices and restarts do not.
 */
export class TemplateOperationContext {
  #view: ReadView;
  #tupleTests = 0;
  constructor(view: ReadView) {
    assertOwnedView(view);
    this.#view = view;
  }
  get tupleTests(): number {
    return this.#tupleTests;
  }

  /** Only committed descendants can advance the candidate-revision owner. */
  advance(view: ReadView, charge: (units: number) => void): void {
    assertOwnedView(view);
    const before = this.#view.state.key,
      after = view.state.key;
    if (
      view.assembly !== this.#view.assembly ||
      before.problemKey !== after.problemKey ||
      before.branch !== after.branch ||
      after.revision < before.revision
    )
      throw new TemplateLimit("template-state-mismatch");
    if (!isAcceptedDescendant(this.#view, view, charge))
      throw new TemplateLimit("template-state-mismatch");
    if (after.revision === before.revision) this.assertRevision(view);
    else this.#tupleTests = 0;
    this.#view = view;
  }

  /** Constant-work gate at every tuple; charged ancestry is checked on advance. */
  assertRevision(view: ReadView): void {
    assertOwnedView(view);
    if (
      view.assembly !== this.#view.assembly ||
      view.state.key.problemKey !== this.#view.state.key.problemKey ||
      view.state.key.branch !== this.#view.state.key.branch ||
      view.state.key.revision !== this.#view.state.key.revision ||
      view.state.domains !== this.#view.state.domains ||
      view.state.domainFacts !== this.#view.state.domainFacts
    )
      throw new TemplateLimit("template-state-mismatch");
  }

  consumeTuple(view: ReadView): void {
    this.assertRevision(view);
    if (this.#tupleTests === TEMPLATE_TUPLE_LIMIT) throw new TemplateLimit("template-tuple-limit");
    this.#tupleTests++;
  }
}

export interface TemplateEntry extends IndexEntry {
  readonly symbol: number;
  /** Base-nine column positions, most significant position = row zero. */
  readonly codes: readonly number[];
}
export class TemplateIndex extends OwnedIndex<TemplateEntry> {
  get codes(): readonly number[] {
    return this.entries[0].codes;
  }
  get symbol(): number {
    return this.entries[0].symbol;
  }
}
/** Pure decoding; template membership is a CellId, never a SymbolId tuple. */
export function templateCells(code: number): number[] {
  const cells = Array<number>(9);
  for (let row = 8; row >= 0; row--) {
    cells[row] = row * 9 + (code % 9);
    code = Math.floor(code / 9);
  }
  return cells;
}
/**
 * Complete row-by-row DFS. Every considered column, including rejection,
 * yields work. No ready relation exists before all alternatives are visited.
 * Ownership transfers on ready, so callers must dispose even if they close
 * the producer immediately at that yield.
 */
export function* buildTemplates(
  view: ReadView,
  symbol: number,
  workspace: IndexWorkspace,
): Generator<IndexEvent<TemplateIndex>> {
  assertOwnedView(view);
  if (
    view.assembly.problem.cells.length !== 81 ||
    view.assembly.problem.symbols.length !== 9 ||
    !view.assembly.problem.symbols.includes(symbol)
  )
    throw Error("template-out-of-profile");
  yield* buildIndex(view, workspace, function* (lease) {
    lease.grow(1, 32768);
    const codes: number[] = [];
    function* extend(
      row: number,
      columns: number,
      boxes: number,
      code: number,
    ): Generator<{ kind: "work"; units: number }> {
      if (row === 9) {
        lease.grow(1, 32);
        codes.push(code);
        return;
      }
      for (let column = 0; column < 9; column++) {
        yield* work(workspace);
        const cell = row * 9 + column;
        const box = Math.floor(row / 3) * 3 + Math.floor(column / 3);
        if (
          columns & (1 << column) ||
          boxes & (1 << box) ||
          !(view.state.domains[cell] & symbolMask(symbol))
        )
          continue;
        // A placed occurrence in this row must be selected even if callers
        // have not yet run its peer exclusions.
        let anotherAnchor = false;
        for (let c = row * 9; c < row * 9 + 9; c++) {
          if (view.state.values[c] === symbol && c !== cell) anotherAnchor = true;
        }
        if (!anotherAnchor)
          yield* extend(row + 1, columns | (1 << column), boxes | (1 << box), code * 9 + column);
      }
    }
    yield* extend(0, 0, 0, 0);
    const entry = freezeRecord({
      ...evidence(view, view.state.domainFacts),
      symbol,
      codes,
    });
    return new TemplateIndex(view, [entry], lease);
  });
}
