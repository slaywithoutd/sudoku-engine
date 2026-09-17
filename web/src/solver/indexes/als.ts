import type { ReadView } from "../state/types";
import {
  buildIndex,
  combinations,
  evidence,
  freezeRecord,
  IndexInterrupted,
  IndexWorkspace,
  provedSources,
  OwnedIndex,
  reserveRecord,
  work,
} from "./workspace";
import type { IndexEntry, IndexEvent, WorkspaceReservation } from "./workspace";
import { symbolMask } from "../state/read";

export interface AlsEntry extends IndexEntry {
  readonly cells: readonly number[];
  readonly symbols: readonly number[];
  readonly occurrences: readonly { readonly symbol: number; readonly cells: readonly number[] }[];
  /**
   * Expand all-different-subset(source,cells) and the exact domain premises.
   * n<=5 and n+1<=6 bounds a complete local table to <=6^5 assignments;
   * table leaves must partition boxes to <=256 and union the full partition.
   * This recipe establishes the local ALS inputs, not any elimination.
   */
  readonly recipe: { readonly kind: "als-domains"; readonly source: number };
}

export class AlsIndex extends OwnedIndex<AlsEntry> {
  #members: WeakSet<AlsEntry>;
  constructor(
    view: ReadView,
    entries: AlsEntry[],
    reservation: WorkspaceReservation,
    private readonly workspace: IndexWorkspace,
    members: WeakSet<AlsEntry>,
  ) {
    super(view, entries, reservation);
    this.#members = members;
  }
  /**
   * Synchronous convenience for bounded callers; production workers should
   * retain rccSteps cursors across their work quanta. The callback must charge
   * run work and may interrupt by throwing. False is never cancellation.
   */
  rcc(a: AlsEntry, b: AlsEntry, symbol: number, charge: (units: number) => void): boolean {
    if (typeof charge !== "function") throw Error("missing-index-work-charge");
    for (const event of this.rccSteps(a, b, symbol)) {
      if (event.kind === "work") charge(event.units);
      else if (event.kind === "interrupted") throw new IndexInterrupted(event.reason);
      else return event.value;
    }
    throw Error("incomplete-rcc-query");
  }
  /**
   * Lazy, no retained pair matrix. At most 25 cross-pairs, with resumable work
   * at every source and tuple scan. Query scratch lives until ready, close,
   * interruption or throw. The boolean is metadata only: a detector must
   * reconstruct each source conflict proof through its named checked proposal.
   * Shared occurrences of the tested digit are invalid (a cell cannot conflict
   * with itself). Other overlap is preserved in the exact member lists; named
   * consumers must still validate their overlap/effect/table grammar.
   */
  *rccSteps(a: AlsEntry, b: AlsEntry, symbol: number): Generator<IndexEvent<boolean>> {
    this.source;
    if (!this.#members.has(a) || !this.#members.has(b)) throw Error("foreign-als-entry");
    let scratch: WorkspaceReservation | undefined;
    try {
      scratch = this.workspace.reserve(0, 4096);
      const value = yield* this.query(a, b, symbol);
      this.workspace.checkpoint();
      scratch.dispose();
      yield { kind: "ready", value };
    } catch (error) {
      if (!(error instanceof IndexInterrupted)) throw error;
      scratch?.dispose();
      yield { kind: "interrupted", reason: error.reason };
    } finally {
      scratch?.dispose();
    }
  }
  private *tick(): Generator<{ kind: "work"; units: number }> {
    this.source;
    yield* work(this.workspace);
    this.source; // A suspended query cannot resume from a disposed parent lease.
  }
  private *query(
    a: AlsEntry,
    b: AlsEntry,
    symbol: number,
  ): Generator<{ kind: "work"; units: number }, boolean> {
    const view = this.source;
    yield* this.tick();
    const left = a.occurrences.find((o) => o.symbol === symbol),
      right = b.occurrences.find((o) => o.symbol === symbol);
    if (!left || !right) return false;
    for (const x of left.cells)
      for (const y of right.cells) {
        yield* this.tick();
        if (x === y) return false;
        let conflict = false;
        for (const event of provedSources(view, this.workspace)) {
          if (event.kind === "work") {
            yield* this.tick();
            continue;
          }
          const p = event.fact.proposition;
          if (
            (p.kind !== "all-different" && p.kind !== "relation") ||
            !p.cells.includes(x) ||
            !p.cells.includes(y)
          )
            continue;
          if (p.kind === "all-different") {
            conflict = true;
            break;
          }
          let compatible = false;
          for (const tuple of p.tuples) {
            yield* this.tick();
            if (
              tuple[p.cells.indexOf(x)] === symbol &&
              tuple[p.cells.indexOf(y)] === symbol &&
              p.cells.every((c, i) => view.state.domains[c] & symbolMask(tuple[i]))
            ) {
              compatible = true;
              break;
            }
          }
          if (!compatible) {
            conflict = true;
            break;
          }
        }
        if (!conflict) return false;
      }
    return true;
  }
  override dispose(): void {
    this.#members = new WeakSet();
    super.dispose();
  }
}

export function* buildAls(
  view: ReadView,
  workspace: IndexWorkspace,
): Generator<IndexEvent<AlsIndex>> {
  yield* buildIndex(view, workspace, function* (reservation) {
    const entries: AlsEntry[] = [];
    const members = new WeakSet<AlsEntry>();
    for (const event of provedSources(view, workspace)) {
      if (event.kind === "work") {
        yield event;
        continue;
      }
      const fact = event.fact,
        p = fact.proposition;
      if (p.kind !== "all-different") continue;
      const available = p.cells.filter((c) => !view.state.values[c] && view.state.domains[c] !== 0);
      for (const selection of combinations(available, 5, workspace)) {
        if (selection.kind === "work") {
          yield selection;
          continue;
        }
        const cells = selection.cells;
        const mask = cells.reduce((mask, c) => mask | view.state.domains[c], 0);
        const symbols = view.assembly.problem.symbols.filter((s) => mask & symbolMask(s));
        if (symbols.length !== cells.length + 1) continue;
        reserveRecord(reservation, 2 + 2 * cells.length + symbols.length * (cells.length + 1));
        const entry = freezeRecord({
          ...evidence(view, [fact.id, ...cells.map((c) => view.state.domainFacts[c])]),
          cells,
          symbols,
          occurrences: symbols.map((symbol) => ({
            symbol,
            cells: cells.filter((c) => view.state.domains[c] & symbolMask(symbol)),
          })),
          recipe: { kind: "als-domains" as const, source: fact.id },
        });
        entries.push(entry);
        members.add(entry);
      }
    }
    return new AlsIndex(view, entries, reservation, workspace, members);
  });
}
