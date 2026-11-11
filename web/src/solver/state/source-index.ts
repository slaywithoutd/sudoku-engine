import type { WorkHold } from "../scheduling/work";
import { conditionalViewAuthority, uniqueAuthorityOwns } from "../conditional";
import type { Fact, ReadView, Proposition, Literal } from "./types";
import { assertOwnedView } from "./candidates";
import { captureProofRecord } from "../proof/checker";
import type { IndexWorkspace, WorkspaceReservation } from "../indexes/workspace";
import { symbolMask } from "./read";

export interface SourcePreparationOptions {
  readonly level?: "facts" | "complete";
  readonly reserveWork?: (maximum: number) => WorkHold;
}
export interface SourceWork {
  readonly kind: "work";
  readonly units: number;
  readonly prepaid?: boolean;
}
const prepared = new WeakMap<ReadView, SourceIndex[]>();
function key(value: unknown): string {
  const ordered = (node: unknown): unknown =>
    Array.isArray(node)
      ? node.map(ordered)
      : node && typeof node === "object"
        ? Object.fromEntries(
            Object.keys(node)
              .sort()
              .map((k) => [k, ordered((node as Record<string, unknown>)[k])]),
          )
        : node;
  return JSON.stringify(ordered(value));
}
/** Exact immutable fact identities, in publication order; no deduction authority is issued. */
export class SourceIndex {
  // Published maps and lists are never mutated again, so a successor built by
  // advance() may share them; it copies whatever it has to extend.
  #byProposition = new Map<string, Fact[]>();
  #byKind = new Map<string, Fact[]>();
  #conflicts = new Map<string, Fact>();
  #scopePairs = new Map<string, Fact>();
  #originalSources: Fact[] = [];
  #maximum = -1;
  /** Indexed facts, and whether a relation fact contributes domain-dependent conflicts. */
  #count = 0;
  #relations = false;
  #active = true;
  readonly #level: "facts" | "complete";
  #pair(left: Literal, right: Literal): string {
    const x = left.cell * 9 + left.symbol - 1,
      y = right.cell * 9 + right.symbol - 1;
    return x < y ? `${x}:${y}` : `${y}:${x}`;
  }
  conflictSource(left: Literal, right: Literal): Fact | undefined {
    this.assertActive();
    if (this.#level !== "complete") throw Error("incomplete-conflict-sources");
    return this.#conflicts.get(this.#pair(left, right));
  }
  scopePair(left: number, right: number): Fact | undefined {
    this.assertActive();
    if (this.#level !== "complete") throw Error("incomplete-conflict-sources");
    return this.#scopePairs.get(left < right ? `${left}:${right}` : `${right}:${left}`);
  }
  *#incidence(
    fact: Fact,
    workspace: IndexWorkspace,
  ): Generator<{ kind: "work"; units: number }, void, void> {
    const proposition = fact.proposition;
    if (
      fact.openAssumptions.length ||
      (proposition.kind !== "all-different" && proposition.kind !== "relation")
    )
      return;
    if (proposition.kind === "relation") this.#relations = true;
    // Indexed values remain actual source facts. Pair projections use current
    // domains and preserve the first eligible fact in exact publication order.
    // One work event per cell pair carries the pair's units (one for the pair,
    // one per tuple cell read, one per symbol pair visited), charged before
    // the pair is projected; they were one event per unit (spec M2.6 §4.2).
    // An all-different pair only conflicts on equal symbols, so only those
    // are visited.
    const { symbols } = this.#source.assembly.problem;
    const pairUnits =
      1 +
      (proposition.kind === "relation"
        ? proposition.tuples.length * proposition.cells.length + symbols.length * symbols.length
        : symbols.length);
    for (let i = 0; i < proposition.cells.length; i++)
      for (let j = i + 1; j < proposition.cells.length; j++) {
        workspace.checkpoint();
        yield { kind: "work", units: pairUnits };
        const left = proposition.cells[i],
          right = proposition.cells[j],
          pair = left < right ? `${left}:${right}` : `${right}:${left}`;
        if (proposition.kind === "all-different" && !this.#scopePairs.has(pair)) {
          this.#tableLease.grow(1, 128);
          this.#scopePairs.set(pair, fact);
        }
        const allowed = new Set<string>();
        const temporary = workspace.reserve(0, 4096);
        try {
          if (proposition.kind === "relation")
            for (const tuple of proposition.tuples) {
              let live = true;
              for (let k = 0; k < proposition.cells.length; k++) {
                if (!(this.#source.state.domains[proposition.cells[k]] & symbolMask(tuple[k])))
                  live = false;
              }
              if (live) allowed.add(`${tuple[i]}:${tuple[j]}`);
            }
          for (const x of symbols)
            for (const y of proposition.kind === "all-different" ? [x] : symbols) {
              if (proposition.kind === "relation" && allowed.has(`${x}:${y}`)) continue;
              const identity = this.#pair(
                { cell: left, symbol: x, positive: true },
                { cell: right, symbol: y, positive: true },
              );
              if (!this.#conflicts.has(identity)) {
                this.#tableLease.grow(1, 128);
                this.#conflicts.set(identity, fact);
              }
            }
        } finally {
          temporary.dispose();
        }
      }
  }
  readonly #source: ReadView;
  /** Fact records and lists; the conflict and scope-pair tables have their own lease. */
  readonly #lease: WorkspaceReservation;
  #tableLease: WorkspaceReservation;
  /** Set when a successor took over the leases; dispose() then releases nothing. */
  #handedOver = false;
  private constructor(
    source: ReadView,
    lease: WorkspaceReservation,
    tableLease: WorkspaceReservation,
    level: "facts" | "complete",
  ) {
    this.#source = source;
    this.#lease = lease;
    this.#tableLease = tableLease;
    this.#level = level;
  }
  static *prepare(
    view: ReadView,
    workspace: IndexWorkspace,
    options: SourcePreparationOptions = {},
  ): Generator<SourceWork, SourceIndex, void> {
    assertOwnedView(view);
    const index = new SourceIndex(
      view,
      workspace.reserve(1, 65536),
      workspace.reserve(0, 0),
      options.level ?? "complete",
    );
    let published = false;
    try {
      yield* index.#addAll(view.facts.values(), workspace, options, index.complete);
      yield* index.#publish([index.#byProposition.values(), index.#byKind.values()], workspace);
      published = true;
      return index;
    } finally {
      if (!published) index.dispose();
    }
  }
  /**
   * The index of `view` built from the index of its accepted parent. Facts are
   * append-only between the two (an accepted step only adds proof nodes with
   * new ids), so the new facts are added after the shared ones, in publication
   * order, and the result equals a cold prepare(view). Anything else, or a
   * parent that is no longer active, falls back to a cold prepare.
   */
  static *advance(
    previous: SourceIndex,
    view: ReadView,
    workspace: IndexWorkspace,
    options: SourcePreparationOptions = {},
  ): Generator<SourceWork, SourceIndex, void> {
    assertOwnedView(view);
    const level = options.level ?? "complete";
    try {
      if (previous.#active && previous.#level === level) {
        previous.assertActive();
        const added: Fact[] = [];
        let kept = 0,
          same = true;
        for (const fact of view.facts.values()) {
          if (fact.id > previous.#maximum) added.push(fact);
          else if (previous.#source.facts.get(fact.id) === fact) kept++;
          else {
            same = false;
            break;
          }
        }
        yield { kind: "work", units: 1 + Math.ceil(view.facts.size / 256) };
        if (same && kept === previous.#count)
          return yield* SourceIndex.#extend(previous, view, added, workspace, options);
      }
    } finally {
      // A parent that was not extended is released, also when the scan stops.
      if (!previous.#handedOver) previous.dispose();
    }
    return yield* SourceIndex.prepare(view, workspace, options);
  }
  static *#extend(
    previous: SourceIndex,
    view: ReadView,
    added: readonly Fact[],
    workspace: IndexWorkspace,
    options: SourcePreparationOptions,
  ): Generator<SourceWork, SourceIndex, void> {
    // The successor takes over the lease, which already accounts for
    // everything it shares; the parent stops answering.
    const index = new SourceIndex(view, previous.#lease, previous.#tableLease, previous.#level);
    previous.#handedOver = true;
    index.#byProposition = new Map(previous.#byProposition);
    index.#byKind = new Map(previous.#byKind);
    index.#originalSources = [...previous.#originalSources];
    index.#maximum = previous.#maximum;
    index.#count = previous.#count;
    index.#conflicts = previous.#conflicts;
    index.#scopePairs = previous.#scopePairs;
    previous.dispose();
    let published = false;
    try {
      let incidence = index.complete;
      if (
        index.complete &&
        (previous.#relations || added.some((fact) => fact.proposition.kind === "relation"))
      ) {
        // Relation conflicts follow the current domains: rebuild every pair
        // projection in publication order, as a cold prepare does, on a fresh
        // table lease (the parent tables are dropped).
        index.#conflicts = new Map();
        index.#scopePairs = new Map();
        const parentTables = index.#tableLease;
        index.#tableLease = workspace.reserve(0, 0);
        parentTables.dispose();
        for (const fact of view.facts.values()) yield* index.#incidence(fact, workspace);
        incidence = false;
      } else if (
        index.complete &&
        added.some(
          (fact) => !fact.openAssumptions.length && fact.proposition.kind === "all-different",
        )
      ) {
        index.#conflicts = new Map(previous.#conflicts);
        index.#scopePairs = new Map(previous.#scopePairs);
      } else incidence = false;
      const touched = new Set<Fact[]>();
      yield* index.#addAll(added, workspace, options, incidence, touched);
      yield* index.#publish([touched], workspace);
      published = true;
      return index;
    } finally {
      if (!published) index.dispose();
    }
  }
  *#addAll(
    facts: Iterable<Fact>,
    workspace: IndexWorkspace,
    options: SourcePreparationOptions,
    incidence: boolean,
    touched?: Set<Fact[]>,
  ): Generator<SourceWork, void, void> {
    for (const fact of facts) {
      workspace.checkpoint();
      // Each proposition is bounded by the 16KiB node codec. Reserve copying and
      // canonical encoding BEFORE allocation; this also accounts malformed data.
      if (options.reserveWork) {
        const hold = options.reserveWork(65);
        let settled = false;
        try {
          const actual = this.#add(fact, touched);
          hold.settle(actual);
          settled = true;
          yield { kind: "work", units: actual, prepaid: true };
        } finally {
          if (!settled) {
            try {
              hold.settle(65);
            } finally {
              hold.dispose();
            }
          }
        }
      } else {
        yield { kind: "work", units: 65 };
        this.#add(fact, touched);
      }
      if (incidence) yield* this.#incidence(fact, workspace);
    }
  }
  /** Freezes the lists built for this index and registers it for its view. */
  *#publish(
    groups: readonly Iterable<Fact[]>[],
    workspace: IndexWorkspace,
  ): Generator<SourceWork, void, void> {
    for (const lists of groups)
      for (const list of lists) {
        workspace.checkpoint();
        yield { kind: "work", units: 1 + Math.ceil(list.length / 256) };
        Object.freeze(list);
      }
    yield { kind: "work", units: 1 + Math.ceil(this.#originalSources.length / 256) };
    Object.freeze(this.#originalSources);
    workspace.checkpoint();
    const owners = prepared.get(this.#source) ?? [];
    owners.push(this);
    prepared.set(this.#source, owners);
  }
  get complete(): boolean {
    this.assertActive();
    return this.#level === "complete";
  }
  get maximumId(): number {
    this.assertActive();
    return this.#maximum;
  }
  assertActive(): void {
    if (!this.#active) throw Error("disposed-source-index");
    assertOwnedView(this.#source);
    const authority = conditionalViewAuthority(this.#source);
    if (authority && !uniqueAuthorityOwns(authority, this.#source))
      throw Error("revoked-unique-authority");
  }
  /** Only preparation calls add before publishing the registration. */
  #add(fact: Fact, touched?: Set<Fact[]>): number {
    if (this.#source.facts.get(fact.id) !== fact) throw Error("foreign-source-fact");
    const encoded = captureProofRecord(fact.proposition, 16384);
    this.#lease.grow(
      1,
      1024 + encoded.bytes * 4 + fact.rules.length * 128 + fact.openAssumptions.length * 8,
    );
    const identity = key(encoded.value);
    this.#maximum = Math.max(this.#maximum, fact.id);
    this.#count++;
    const proposition = fact.proposition;
    if (
      proposition.kind === "rule" ||
      (proposition.kind === "literal" &&
        proposition.value.positive &&
        this.#source.assembly.problem.givens[proposition.value.cell] === proposition.value.symbol)
    )
      this.#originalSources.push(fact);
    const lists: [Map<string, Fact[]>, string][] = [
      [this.#byProposition, identity],
      [this.#byKind, fact.proposition.kind],
    ];
    for (const [map, name] of lists) {
      // A list shared with the parent index is frozen: extend a copy.
      let list = map.get(name) ?? [];
      if (Object.isFrozen(list)) list = [...list];
      list.push(fact);
      map.set(name, list);
      touched?.add(list);
    }
    return 1 + Math.ceil(encoded.bytes / 256);
  }
  originalSources(): readonly Fact[] {
    this.assertActive();
    return this.#originalSources;
  }
  matching(proposition: Proposition): readonly Fact[] {
    this.assertActive();
    return this.#byProposition.get(key(proposition)) ?? [];
  }
  kind(kind: Proposition["kind"]): readonly Fact[] {
    this.assertActive();
    return this.#byKind.get(kind) ?? [];
  }
  /**
   * Every lookup table as plain data, for the cold/incremental differential
   * test (spec M2.6 §4.2); nothing in the solver reads it.
   */
  contents(): {
    readonly byProposition: readonly (readonly [string, readonly number[]])[];
    readonly byKind: readonly (readonly [string, readonly number[]])[];
    readonly conflicts: readonly (readonly [string, number])[];
    readonly scopePairs: readonly (readonly [string, number])[];
    readonly originalSources: readonly number[];
    readonly maximumId: number;
  } {
    this.assertActive();
    const lists = (map: Map<string, Fact[]>) =>
      [...map]
        .map(([name, facts]) => [name, facts.map((fact) => fact.id)] as const)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
    const sources = (map: Map<string, Fact>) =>
      [...map]
        .map(([name, fact]) => [name, fact.id] as const)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
    return {
      byProposition: lists(this.#byProposition),
      byKind: lists(this.#byKind),
      conflicts: this.#level === "complete" ? sources(this.#conflicts) : [],
      scopePairs: this.#level === "complete" ? sources(this.#scopePairs) : [],
      originalSources: this.#originalSources.map((fact) => fact.id),
      maximumId: this.#maximum,
    };
  }
  dispose(): void {
    if (!this.#active) return;
    this.#active = false;
    const owners = prepared.get(this.#source);
    if (owners) {
      const i = owners.indexOf(this);
      if (i >= 0) owners.splice(i, 1);
      if (!owners.length) prepared.delete(this.#source);
    }
    // Tables may be shared with a successor: drop them, never clear them.
    this.#byProposition = new Map();
    this.#byKind = new Map();
    this.#scopePairs = new Map();
    this.#conflicts = new Map();
    if (!this.#handedOver) {
      this.#lease.dispose();
      this.#tableLease.dispose();
    }
  }
}
/** Independent leases for dual owners; disposing one never revokes another. */
export function prepareSources(
  view: ReadView,
  workspace: IndexWorkspace,
  options: SourcePreparationOptions = {},
): Generator<SourceWork, SourceIndex, void> {
  return SourceIndex.prepare(view, workspace, options);
}
export function preparedSources(
  view: ReadView,
  required: "facts" | "complete" = "facts",
): SourceIndex | undefined {
  const owners = prepared.get(view);
  if (!owners) return;
  for (let i = owners.length - 1; i >= 0; i--)
    if (required === "facts" || owners[i].complete) return owners[i];
  throw Error("incomplete-conflict-sources");
}
export function sourceMaximumId(view: ReadView): number {
  const index = preparedSources(view);
  if (index) return index.maximumId;
  let maximum = -1;
  for (const id of view.facts.keys()) maximum = Math.max(maximum, id);
  return maximum;
}
export function matchingFacts(view: ReadView, proposition: Proposition): readonly Fact[] {
  const index = preparedSources(view);
  return index
    ? index.matching(proposition)
    : [...view.facts.values()].filter((fact) => key(fact.proposition) === key(proposition));
}
export function sourceFacts(view: ReadView, kind: Proposition["kind"]): readonly Fact[] {
  const index = preparedSources(view);
  return index
    ? index.kind(kind)
    : [...view.facts.values()].filter((fact) => fact.proposition.kind === kind);
}

/** Ordered source IDs for unique-transform's all-original-rules/clues pack. */
export function uniqueSourceFacts(view: ReadView): readonly Fact[] {
  const index = preparedSources(view);
  return index
    ? index.originalSources()
    : [...view.facts.values()].filter(
        (fact) =>
          fact.proposition.kind === "rule" ||
          (fact.proposition.kind === "literal" &&
            fact.proposition.value.positive &&
            view.assembly.problem.givens[fact.proposition.value.cell] ===
              fact.proposition.value.symbol),
      );
}
