import type { WorkHold } from "../scheduling/work";
import { conditionalViewAuthority, uniqueAuthorityOwns } from "../conditional";
import type { Fact, ReadView, Proposition, Literal } from "./types";
import { assertOwnedView } from "./candidates";
import { captureProofRecord } from "../proof/checker";
import type { IndexWorkspace, WorkspaceReservation } from "../indexes/workspace";

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
  const ordered = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(ordered)
      : v && typeof v === "object"
        ? Object.fromEntries(
            Object.keys(v)
              .sort()
              .map((k) => [k, ordered((v as Record<string, unknown>)[k])]),
          )
        : v;
  return JSON.stringify(ordered(value));
}
/** Exact immutable fact identities, in publication order; no deduction authority is issued. */
export class SourceIndex {
  readonly #byProposition = new Map<string, Fact[]>();
  readonly #byKind = new Map<string, Fact[]>();
  readonly #conflicts = new Map<string, Fact>();
  readonly #scopePairs = new Map<string, Fact>();
  readonly #originalSources: Fact[] = [];
  #maximum = -1;
  #active = true;
  readonly #level: "facts" | "complete";
  #pair(a: Literal, b: Literal): string {
    const x = a.cell * 9 + a.symbol - 1,
      y = b.cell * 9 + b.symbol - 1;
    return x < y ? `${x}:${y}` : `${y}:${x}`;
  }
  conflictSource(a: Literal, b: Literal): Fact | undefined {
    this.assertActive();
    if (this.#level !== "complete") throw Error("incomplete-conflict-sources");
    return this.#conflicts.get(this.#pair(a, b));
  }
  scopePair(a: number, b: number): Fact | undefined {
    this.assertActive();
    if (this.#level !== "complete") throw Error("incomplete-conflict-sources");
    return this.#scopePairs.get(a < b ? `${a}:${b}` : `${b}:${a}`);
  }
  *#incidence(
    fact: Fact,
    workspace: IndexWorkspace,
  ): Generator<{ kind: "work"; units: number }, void, void> {
    const p = fact.proposition;
    if (fact.openAssumptions.length || (p.kind !== "all-different" && p.kind !== "relation"))
      return;
    // Indexed values remain actual source facts. Pair projections use current
    // domains and preserve the first eligible fact in exact publication order.
    for (let i = 0; i < p.cells.length; i++)
      for (let j = i + 1; j < p.cells.length; j++) {
        workspace.checkpoint();
        yield { kind: "work", units: 1 };
        const a = p.cells[i],
          b = p.cells[j],
          pair = a < b ? `${a}:${b}` : `${b}:${a}`;
        if (p.kind === "all-different" && !this.#scopePairs.has(pair)) {
          this.#lease.grow(1, 128);
          this.#scopePairs.set(pair, fact);
        }
        const allowed = new Set<string>();
        const temporary = workspace.reserve(0, 4096);
        try {
          if (p.kind === "relation")
            for (const tuple of p.tuples) {
              let live = true;
              for (let k = 0; k < p.cells.length; k++) {
                workspace.checkpoint();
                yield { kind: "work", units: 1 };
                if (!(this.#source.state.domains[p.cells[k]] & (1 << (tuple[k] - 1)))) live = false;
              }
              if (live) allowed.add(`${tuple[i]}:${tuple[j]}`);
            }
          for (const x of this.#source.assembly.problem.symbols)
            for (const y of this.#source.assembly.problem.symbols) {
              workspace.checkpoint();
              yield { kind: "work", units: 1 };
              if (p.kind === "all-different" ? x !== y : allowed.has(`${x}:${y}`)) continue;
              const identity = this.#pair(
                { cell: a, symbol: x, positive: true },
                { cell: b, symbol: y, positive: true },
              );
              if (!this.#conflicts.has(identity)) {
                this.#lease.grow(1, 128);
                this.#conflicts.set(identity, fact);
              }
            }
        } finally {
          temporary.dispose();
        }
      }
  }
  readonly #source: ReadView;
  readonly #lease: WorkspaceReservation;
  private constructor(source: ReadView, lease: WorkspaceReservation, level: "facts" | "complete") {
    this.#source = source;
    this.#lease = lease;
    this.#level = level;
  }
  static *prepare(
    view: ReadView,
    workspace: IndexWorkspace,
    options: SourcePreparationOptions = {},
  ): Generator<SourceWork, SourceIndex, void> {
    assertOwnedView(view);
    const index = new SourceIndex(view, workspace.reserve(1, 65536), options.level ?? "complete");
    let published = false;
    try {
      for (const fact of view.facts.values()) {
        workspace.checkpoint();
        // Each proposition is bounded by the 16KiB node codec. Reserve copying and
        // canonical encoding BEFORE allocation; this also accounts malformed data.
        if (options.reserveWork) {
          const hold = options.reserveWork(65);
          let settled = false;
          try {
            const actual = index.#add(fact);
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
          index.#add(fact);
        }
        if (index.#level === "complete") yield* index.#incidence(fact, workspace);
      }
      for (const lists of [index.#byProposition, index.#byKind])
        for (const list of lists.values()) {
          workspace.checkpoint();
          yield { kind: "work", units: 1 + Math.ceil(list.length / 256) };
          Object.freeze(list);
        }
      yield { kind: "work", units: 1 + Math.ceil(index.#originalSources.length / 256) };
      Object.freeze(index.#originalSources);
      workspace.checkpoint();
      const owners = prepared.get(view) ?? [];
      owners.push(index);
      prepared.set(view, owners);
      published = true;
      return index;
    } finally {
      if (!published) index.dispose();
    }
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
  #add(fact: Fact): number {
    if (this.#source.facts.get(fact.id) !== fact) throw Error("foreign-source-fact");
    const encoded = captureProofRecord(fact.proposition, 16384);
    this.#lease.grow(
      1,
      1024 + encoded.bytes * 4 + fact.rules.length * 128 + fact.openAssumptions.length * 8,
    );
    const identity = key(encoded.value);
    this.#maximum = Math.max(this.#maximum, fact.id);
    const p = fact.proposition;
    if (
      p.kind === "rule" ||
      (p.kind === "literal" &&
        p.value.positive &&
        this.#source.assembly.problem.givens[p.value.cell] === p.value.symbol)
    )
      this.#originalSources.push(fact);
    const list = this.#byProposition.get(identity) ?? [];
    list.push(fact);
    this.#byProposition.set(identity, list);
    const kind = this.#byKind.get(fact.proposition.kind) ?? [];
    kind.push(fact);
    this.#byKind.set(fact.proposition.kind, kind);
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
  dispose(): void {
    if (!this.#active) return;
    this.#active = false;
    const owners = prepared.get(this.#source);
    if (owners) {
      const i = owners.indexOf(this);
      if (i >= 0) owners.splice(i, 1);
      if (!owners.length) prepared.delete(this.#source);
    }
    this.#byProposition.clear();
    this.#byKind.clear();
    this.#scopePairs.clear();
    this.#conflicts.clear();
    this.#lease.dispose();
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
    : [...view.facts.values()].filter((f) => key(f.proposition) === key(proposition));
}
export function sourceFacts(view: ReadView, kind: Proposition["kind"]): readonly Fact[] {
  const index = preparedSources(view);
  return index
    ? index.kind(kind)
    : [...view.facts.values()].filter((f) => f.proposition.kind === kind);
}

/** Ordered source IDs for unique-transform's all-original-rules/clues pack. */
export function uniqueSourceFacts(view: ReadView): readonly Fact[] {
  const index = preparedSources(view);
  return index
    ? index.originalSources()
    : [...view.facts.values()].filter(
        (f) =>
          f.proposition.kind === "rule" ||
          (f.proposition.kind === "literal" &&
            f.proposition.value.positive &&
            view.assembly.problem.givens[f.proposition.value.cell] === f.proposition.value.symbol),
      );
}
