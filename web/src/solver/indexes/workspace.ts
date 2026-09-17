import { assertOwnedView, branchAllowsFact } from "../state/candidates";
import type { FactId } from "../rules/types";
import type { Fact, ReadView } from "../state/types";
import type { StateKey } from "../snapshot";
import type { Watch } from "../state/events";

export type IndexInterruption = "cancelled" | "workspace-entry-limit" | "workspace-byte-limit";
export type IndexEvent<T> =
  | { readonly kind: "work"; readonly units: number }
  | { readonly kind: "ready"; readonly value: T }
  | { readonly kind: "interrupted"; readonly reason: IndexInterruption };
export class IndexInterrupted extends Error {
  constructor(readonly reason: IndexInterruption) {
    super(reason);
  }
}

/**
 * One owner per run, shared with every live index and other workspace consumer.
 * Charges are conservative accounting units, not a JavaScript heap guarantee.
 * Consumers copying/retaining borrowed entries must reserve their own lifetime.
 */
export class IndexWorkspace {
  #entries = 0;
  #bytes = 0;
  readonly #entryLimit: number;
  readonly #byteLimit: number;
  readonly #cancelled: () => boolean;
  constructor(options: { entryLimit: number; byteLimit: number; cancelled?: () => boolean }) {
    for (const value of [options.entryLimit, options.byteLimit])
      if (!Number.isSafeInteger(value) || value < 0) throw Error("invalid-index-limit");
    this.#entryLimit = options.entryLimit;
    this.#byteLimit = options.byteLimit;
    this.#cancelled = options.cancelled ?? (() => false);
  }
  get usage(): { readonly entries: number; readonly bytes: number } {
    return Object.freeze({ entries: this.#entries, bytes: this.#bytes });
  }
  checkpoint(): void {
    if (this.#cancelled()) throw new IndexInterrupted("cancelled");
  }
  /** Reservation works for non-index run consumers as well; no hidden budget. */
  reserve(entries: number, bytes: number): WorkspaceReservation {
    const reservation = new WorkspaceReservation(
      (entries, bytes) => {
        this.checkpoint();
        if (this.#entries + entries > this.#entryLimit)
          throw new IndexInterrupted("workspace-entry-limit");
        if (this.#bytes + bytes > this.#byteLimit)
          throw new IndexInterrupted("workspace-byte-limit");
        this.#entries += entries;
        this.#bytes += bytes;
      },
      (entries, bytes) => {
        this.#entries -= entries;
        this.#bytes -= bytes;
      },
    );
    reservation.grow(entries, bytes);
    return reservation;
  }
}

/** A lease releases exactly its own reservations, once, including on failure. */
export class WorkspaceReservation {
  #entries = 0;
  #bytes = 0;
  #disposed = false;
  constructor(
    private readonly allocate: (entries: number, bytes: number) => void,
    private readonly release: (entries: number, bytes: number) => void,
  ) {}
  grow(entries: number, bytes: number): void {
    if (this.#disposed) throw Error("disposed-reservation");
    if (![entries, bytes].every((n) => Number.isSafeInteger(n) && n >= 0))
      throw Error("invalid-index-reservation");
    this.allocate(entries, bytes);
    this.#entries += entries;
    this.#bytes += bytes;
  }
  dispose(): void {
    if (this.#disposed) return;
    this.release(this.#entries, this.#bytes);
    this.#disposed = true;
  }
}

export interface IndexEntry {
  readonly state: StateKey;
  readonly premises: readonly FactId[];
  /** Exact borrowed facts retain rule provenance, assumptions and conditional taint. */
  readonly premiseFacts: readonly Fact[];
  readonly conditional: boolean;
  readonly watches: readonly Watch[];
}
const watches: readonly Watch[] = Object.freeze([Object.freeze({ kind: "all" as const })]);
export function evidence(view: ReadView, premises: readonly FactId[]): IndexEntry {
  const premiseFacts = Object.freeze(premises.map((id) => view.facts.get(id)!));
  return {
    state: view.state.key,
    premises: Object.freeze([...premises]),
    premiseFacts,
    conditional: premiseFacts.some((fact) => fact.conditional),
    watches,
  };
}
/** Only freshly created bounded records are passed here, never a ReadView. */
export function freezeRecord<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeRecord(child);
    Object.freeze(value);
  }
  return value;
}

/**
 * Metadata matching never authenticates imports. acceptsView gates the exact
 * published view, unchanged inputs and every referenced Fact identity. A cold
 * rebuild or same-revision prefix extension is reusable from identical facts.
 * Any candidate revision invalidates globally; there is no incremental reuse.
 * Entries are borrowed until dispose and are untrusted recipe syntax only.
 */
export class OwnedIndex<E extends IndexEntry> {
  #source: ReadView | undefined;
  #entries: readonly E[];
  constructor(
    source: ReadView,
    entries: E[],
    private readonly reservation: WorkspaceReservation,
  ) {
    this.#source = source;
    this.#entries = Object.freeze(entries);
  }
  protected get source(): ReadView {
    if (!this.#source) throw Error("disposed-index");
    return this.#source;
  }
  get entries(): readonly E[] {
    this.source;
    return this.#entries;
  }
  accepts(key: StateKey): boolean {
    const before = this.#source?.state.key;
    return (
      !!before &&
      before.problemKey === key.problemKey &&
      before.branch === key.branch &&
      before.revision === key.revision
    );
  }
  /**
   * Exact fact-map identity is constant work. Different proof prefixes require
   * an explicit run work callback; without one, conservatively reject reuse.
   * Callback interruption propagates; it is never relabeled a mismatch.
   */
  acceptsView(view: ReadView, charge?: (units: number) => void): boolean {
    try {
      assertOwnedView(view);
    } catch {
      return false;
    }
    const source = this.#source;
    if (
      !source ||
      !this.accepts(view.state.key) ||
      source.assembly !== view.assembly ||
      source.state.domains !== view.state.domains ||
      source.state.domainFacts !== view.state.domainFacts
    )
      return false;
    if (source.facts === view.facts) return true;
    if (!charge) return false;
    for (const entry of this.#entries)
      for (const premise of entry.premiseFacts) {
        charge(1);
        if (view.facts.get(premise.id) !== premise) return false;
      }
    return true;
  }
  /**
   * A prefix extension can reuse recipes but must rebuild for full discovery.
   * This gate is required for absence/exhaustion/no-prerequisite conclusions;
   * acceptsView alone promises only that existing recipes remain reusable.
   */
  completeFor(view: ReadView): boolean {
    return this.acceptsView(view) && this.source.facts === view.facts;
  }
  dispose(): void {
    this.#source = undefined;
    this.#entries = [];
    this.reservation.dispose();
  }
}

/** Every extension resumes through cancellation before doing more work. */
export function* work(workspace: IndexWorkspace): Generator<{ kind: "work"; units: number }> {
  workspace.checkpoint();
  yield { kind: "work", units: 1 };
  workspace.checkpoint();
}

/**
 * Reserve the cursor/header before producer allocation. Records reserve before
 * constructing arrays/recipes: 1,024 bytes plus 128 per bounded list slot covers
 * nested literals, numbers, references, array/record headers and growth slack.
 * No root relation tuples or identifier strings are copied into the cache.
 */
export function reserveRecord(reservation: WorkspaceReservation, slots: number): void {
  reservation.grow(1, 1024 + 128 * slots);
}
export function* buildIndex<T extends { dispose(): void }>(
  view: ReadView,
  workspace: IndexWorkspace,
  produce: (reservation: WorkspaceReservation) => Generator<{ kind: "work"; units: number }, T>,
): Generator<IndexEvent<T>> {
  assertOwnedView(view); // Gate before any caller-controlled field access.
  let scratch: WorkspaceReservation | undefined,
    retained: WorkspaceReservation | undefined,
    published = false;
  try {
    scratch = workspace.reserve(0, 65536);
    retained = workspace.reserve(0, 1024);
    const value = yield* produce(retained);
    workspace.checkpoint();
    scratch.dispose();
    published = true;
    yield { kind: "ready", value };
  } catch (error) {
    if (!(error instanceof IndexInterrupted)) throw error;
    scratch?.dispose();
    retained?.dispose();
    yield { kind: "interrupted", reason: error.reason };
  } finally {
    scratch?.dispose();
    if (!published) retained?.dispose();
  }
}

/**
 * All closed owned sources, original AND accepted derived facts, in FactId
 * order. Scoped intermediate facts cannot escape an accepted case/discharge.
 * Conditional closed sources remain usable only with their inherited taint.
 * A standalone CertificateSession cannot supply this owned-view iterator.
 */
export function* provedSources(
  view: ReadView,
  workspace: IndexWorkspace,
): Generator<{ kind: "work"; units: number } | { kind: "source"; fact: Fact }> {
  assertOwnedView(view);
  for (const fact of view.facts.values()) {
    yield* work(workspace);
    if (
      (fact.proposition.kind === "all-different" ||
        fact.proposition.kind === "cover" ||
        fact.proposition.kind === "relation") &&
      branchAllowsFact(view, fact)
    )
      yield { kind: "source", fact };
  }
}

/** Size-first lexicographic enumeration, constant <=5-depth scratch. */
export function* combinations(
  cells: readonly number[],
  maximum: number,
  workspace: IndexWorkspace,
): Generator<{ kind: "work"; units: number } | { kind: "members"; cells: number[] }> {
  function* extend(
    chosen: number[],
    start: number,
    size: number,
  ): Generator<{ kind: "work"; units: number } | { kind: "members"; cells: number[] }> {
    if (chosen.length === size) {
      yield { kind: "members", cells: chosen };
      return;
    }
    for (let i = start; i <= cells.length - (size - chosen.length); i++) {
      yield* work(workspace);
      yield* extend([...chosen, cells[i]], i + 1, size);
    }
  }
  for (let size = 1; size <= Math.min(maximum, cells.length); size++) yield* extend([], 0, size);
}
