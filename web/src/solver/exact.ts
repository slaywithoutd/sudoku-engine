import { canonicalProblem } from "./problem";
import type { EngineProblem, ConstraintInstance } from "./problem";
import type { Assembly, RuleModule } from "./rules/types";
import type { Literal } from "./state/types";
import { symbolMask } from "./state/read";
import { defined } from "./invariants";

export interface ExactStats {
  readonly nodes: number;
  readonly backtracks: number;
  readonly maxDepth: number;
}
export type ExactEvent =
  | { readonly kind: "work"; readonly units: number; readonly stats: ExactStats }
  | {
      readonly kind: "witness";
      readonly values: readonly number[];
      readonly decisions: readonly Literal[];
      readonly stats: ExactStats;
    }
  | { readonly kind: "exhausted" | "cap-reached"; readonly stats: ExactStats };

export const EXACT_METHOD = "original-dfs@2";

export interface ExactInitializationReservation {
  readonly workUnits: number;
  readonly workspaceBytes: number;
}

function requireInput(condition: unknown, code: string): asserts condition {
  if (!condition) throw new Error(code);
}
function dataFields(value: unknown, fields: readonly string[]): void {
  requireInput(
    value !== null &&
      typeof value === "object" &&
      (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null),
    "exact-invalid-data",
  );
  requireInput(Reflect.ownKeys(value).length === fields.length, "exact-invalid-data");
  for (const field of fields) {
    const descriptor = Object.getOwnPropertyDescriptor(value, field);
    requireInput(descriptor?.enumerable && "value" in descriptor, "exact-invalid-data");
  }
}
function boundedArray(
  value: unknown,
  maximum: number,
  code: string,
): asserts value is readonly unknown[] {
  requireInput(Array.isArray(value) && value.length <= maximum, code);
  requireInput(Reflect.ownKeys(value).length === value.length + 1, "exact-invalid-data");
  for (let index = 0; index < value.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, index);
    requireInput(descriptor?.enumerable && "value" in descriptor, "exact-invalid-data");
  }
}
/** Finite scalar M2 input gate, deliberately independent of proof/discovery code. */
function inputSize(problem: EngineProblem): {
  entries: number;
  characters: number;
  scopes: number;
} {
  dataFields(problem, ["schema", "cells", "symbols", "givens", "constraints", "key"]);
  boundedArray(problem.cells, 81, "exact-cell-limit");
  boundedArray(problem.symbols, 9, "exact-symbol-limit");
  boundedArray(problem.givens, 81, "exact-given-limit");
  boundedArray(problem.constraints, 256, "exact-rule-limit");
  requireInput(
    problem.cells.length > 0 &&
      problem.symbols.length > 0 &&
      problem.givens.length === problem.cells.length,
    "exact-invalid-size",
  );
  requireInput(
    typeof problem.key === "string" && problem.key.length <= 1_048_576,
    "exact-key-limit",
  );
  let entries = problem.cells.length + problem.symbols.length + problem.givens.length,
    characters = problem.key.length,
    scopes = 0;
  for (const rule of problem.constraints) {
    dataFields(rule, ["id", "type", "cells", "parameters"]);
    boundedArray(rule.cells, 81, "exact-scope-limit");
    requireInput(rule.cells.length > 0, "exact-scope-limit");
    for (const id of [rule.id, rule.type]) {
      requireInput(
        typeof id === "string" && id.length > 0 && id.length <= 16_384,
        "exact-identifier-limit",
      );
      characters += id.length;
    }
    const parameters = rule.parameters;
    requireInput(
      parameters !== null &&
        typeof parameters === "object" &&
        !Array.isArray(parameters) &&
        (Object.getPrototypeOf(parameters) === Object.prototype ||
          Object.getPrototypeOf(parameters) === null),
      "exact-parameter-limit",
    );
    const keys = Reflect.ownKeys(parameters);
    requireInput(keys.length <= 16, "exact-parameter-limit");
    for (const key of keys) {
      const descriptor = defined(
        Object.getOwnPropertyDescriptor(parameters, key),
        "getOwnPropertyDescriptor",
      );
      requireInput(
        typeof key === "string" &&
          key.length <= 64 &&
          descriptor.enumerable &&
          "value" in descriptor &&
          (typeof descriptor.value === "boolean" ||
            Number.isSafeInteger(descriptor.value) ||
            (typeof descriptor.value === "string" &&
              descriptor.value.length >= 1 &&
              descriptor.value.length <= 32)),
        "exact-parameter-limit",
      );
      characters +=
        key.length + (typeof descriptor.value === "string" ? descriptor.value.length : 0);
    }
    scopes += rule.cells.length;
    entries += rule.cells.length + keys.length + 4;
    requireInput(characters <= 2_097_152, "exact-input-text-limit");
  }
  return { entries, characters, scopes };
}

/**
 * Reserve before calling exactSteps and check deadline before/after construction.
 * This conservative entry/character model covers one caller reservation preflight,
 * one internal preflight, both canonical copies, peer and house-pair construction
 * and the maximum explicit frontier (values and masks per frame). The first work
 * event reports this same reservation ONCE;
 * it is not an ordinary cooperative unit. Extra caller preflights need extra budget.
 * Workspace is accounted storage, not measured JavaScript heap. Scalar parameters
 * have <=16 integer/boolean fields, identifiers <=16Ki characters, key <=1Mi
 * characters, and total original text <=2Mi characters per input.
 */
export function exactInitializationReservation(
  problem: EngineProblem,
  assembly: Assembly,
): ExactInitializationReservation {
  dataFields(assembly, [
    "problem",
    "modules",
    "allDifferent",
    "covers",
    "relations",
    "sums",
    "peers",
    "supportSignature",
  ]);
  const first = inputSize(problem),
    second = inputSize(assembly.problem);
  const cells = problem.cells.length,
    symbols = problem.symbols.length;
  const scalarWork = 8 * (first.entries + second.entries + first.characters + second.characters);
  const peerWork = 4 * cells * (problem.constraints.length + first.scopes + cells);
  // Locked-candidate pairs: at most one per two full houses sharing a cell,
  // each holding at most 2 * symbols cells.
  const memberships = new Map<unknown, number>();
  for (const rule of problem.constraints)
    if (rule.type === "all-different@1" && rule.cells.length === symbols)
      for (const cell of rule.cells) memberships.set(cell, (memberships.get(cell) ?? 0) + 1);
  let pairs = 0;
  for (const houses of memberships.values()) pairs += (houses * (houses - 1)) / 2;
  const pairWork = 4 * (first.scopes + pairs * (1 + 2 * symbols));
  return Object.freeze({
    workUnits: 1 + scalarWork + peerWork + pairWork,
    workspaceBytes:
      64 *
        (first.entries +
          second.entries +
          cells * cells +
          cells * symbols * (2 * cells + 4) +
          pairs * 2 * symbols) +
      4 * (first.characters + second.characters),
  });
}

/** Copies original semantics; capability caches and human domains are never read. */
class OriginalSemantics {
  readonly reservation: ExactInitializationReservation;
  readonly problem: EngineProblem;
  readonly checks: readonly ((values: readonly number[]) => boolean)[];
  readonly houses: readonly ConstraintInstance[];
  readonly peers: readonly (readonly number[])[];
  /** All-different houses that hold every symbol once; they support hidden singles. */
  readonly fullHouses: readonly (readonly number[])[];
  /**
   * Pairs of full houses sharing at least two cells (box and line in classic).
   * A symbol confined to the shared cells in one house leaves the rest of the
   * other house (locked candidates: pointing and claiming).
   */
  readonly lockedPairs: readonly {
    readonly shared: readonly number[];
    readonly onlyFirst: readonly number[];
    readonly onlySecond: readonly number[];
  }[];
  readonly full: number;
  /** Rules whose module offers a forward check (spec §3.13); all-different is covered by peers. */
  readonly pruners: readonly {
    readonly rule: ConstraintInstance;
    readonly prune: NonNullable<RuleModule["prune"]>;
  }[];
  constructor(problem: EngineProblem, assembly: Assembly) {
    this.reservation = exactInitializationReservation(problem, assembly);
    this.problem = canonicalProblem(problem);
    if (canonicalProblem(assembly.problem).key !== this.problem.key)
      throw new Error("exact-problem-mismatch");
    if (
      this.problem.cells.length > 81 ||
      this.problem.symbols.length > 9 ||
      this.problem.constraints.length > 256
    )
      throw new Error("exact-unsupported-size");
    this.checks = this.problem.constraints.map((rule) => {
      const module = assembly.modules.get(rule.id);
      if (
        !module ||
        module.type !== rule.type ||
        typeof module.checkComplete !== "function" ||
        typeof module.validate !== "function" ||
        module.validate(this.problem, rule).length !== 0
      )
        throw new Error("exact-unsupported-rule");
      const check = module.checkComplete.bind(module);
      return (values: readonly number[]) => check(rule, { values }) === true;
    });
    this.houses = this.problem.constraints.filter((rule) => rule.type === "all-different@1");
    this.pruners = this.problem.constraints.flatMap((rule) => {
      const module = defined(assembly.modules.get(rule.id), "module");
      return typeof module.prune === "function"
        ? [{ rule, prune: module.prune.bind(module) as NonNullable<RuleModule["prune"]> }]
        : [];
    });
    this.peers = this.problem.cells.map((cell) =>
      [
        ...new Set(
          this.houses
            .filter((rule) => rule.cells.includes(cell))
            .flatMap((rule) => rule.cells)
            .filter((peer) => peer !== cell),
        ),
      ].sort((left, right) => left - right),
    );
    this.full = this.problem.symbols.reduce((mask, symbol) => mask | symbolMask(symbol), 0);
    const full = this.houses.filter((rule) => rule.cells.length === this.problem.symbols.length);
    this.fullHouses = full.map((rule) => [...rule.cells]);
    const membership = this.problem.cells.map(() => [] as number[]);
    full.forEach((rule, index) => {
      for (const cell of rule.cells) membership[cell].push(index);
    });
    const pairs = new Map<number, number>();
    for (const houses of membership)
      for (let left = 0; left < houses.length; left++)
        for (let right = left + 1; right < houses.length; right++) {
          const key = houses[left] * full.length + houses[right];
          pairs.set(key, (pairs.get(key) ?? 0) + 1);
        }
    this.lockedPairs = [...pairs]
      .filter(([, shared]) => shared >= 2)
      .sort(([left], [right]) => left - right)
      .map(([key]) => {
        const first = new Set(full[Math.floor(key / full.length)].cells),
          second = new Set(full[key % full.length].cells);
        return {
          shared: [...first].filter((cell) => second.has(cell)),
          onlyFirst: [...first].filter((cell) => !second.has(cell)),
          onlySecond: [...second].filter((cell) => !first.has(cell)),
        };
      });
  }
  validValues(values: unknown): values is readonly number[] {
    if (!Array.isArray(values) || values.length !== this.problem.cells.length) return false;
    for (const cell of this.problem.cells)
      if (
        !Number.isSafeInteger(values[cell]) ||
        !this.problem.symbols.includes(values[cell]) ||
        (this.problem.givens[cell] !== 0 && this.problem.givens[cell] !== values[cell])
      )
        return false;
    return true;
  }
}

interface Frame {
  values: number[];
  /**
   * The parent's fixed-point masks with the branched cell already narrowed to
   * its symbol, or null at the root.
   */
  masks: number[] | null;
  /** The branched cell whose symbol still has to leave its peers; -1 at the root. */
  branch: number;
  decisions: readonly Literal[];
}

/** Symbol of a single-bit mask (symbol s is bit s - 1, as in symbolMask). */
function symbolOf(mask: number): number {
  return 32 - Math.clz32(mask);
}
function popcount(mask: number): number {
  let count = 0;
  for (let rest = mask; rest !== 0; rest &= rest - 1) count++;
  return count;
}

/**
 * One explicit DFS frontier. A node is one popped frame: propagation to a fixed
 * point, then MRV branching in ascending symbol order. Backtracks count rejected
 * nodes. Sibling branches differ in the branched cell, so witnesses are distinct.
 */
class ExactSearchSession {
  private readonly semantics: OriginalSemantics;
  private readonly frontier: Frame[];
  private nodes = 0;
  private backtracks = 0;
  private maxDepth = 0;
  private witnesses = 0;
  /**
   * Counted operations of the current node, reported by its single work event
   * (spec §4.1): one for the node, one per mask computed, assignment, prune
   * call and leaf rule check.
   */
  private units = 0;
  private readonly reservation: ExactInitializationReservation;
  constructor(problem: EngineProblem, assembly: Assembly) {
    this.semantics = new OriginalSemantics(problem, assembly);
    this.reservation = this.semantics.reservation;
    this.frontier = [
      { values: [...this.semantics.problem.givens], masks: null, branch: -1, decisions: [] },
    ];
  }
  private stats(): ExactStats {
    return Object.freeze({
      nodes: this.nodes,
      backtracks: this.backtracks,
      maxDepth: this.maxDepth,
    });
  }

  /** Places a symbol and removes it from every peer; false on a contradiction. */
  private assign(values: number[], masks: number[], cell: number, bit: number): boolean {
    this.units++;
    values[cell] = symbolOf(bit);
    masks[cell] = bit;
    for (const peer of this.semantics.peers[cell])
      if ((masks[peer] & bit) !== 0) {
        masks[peer] &= ~bit;
        if (masks[peer] === 0) return false;
      }
    return true;
  }

  /**
   * Bulk naked and hidden singles, module forward checks and locked candidates
   * to a fixed point. Every step only removes candidates that no completion of
   * `values` uses. Returns the masks, or null on a contradiction.
   */
  private propagate(frame: Frame): number[] | null {
    const { problem, peers, pruners, fullHouses, lockedPairs, full } = this.semantics;
    const values = frame.values;
    let masks: number[];
    if (frame.masks) {
      // The parent's masks already exclude every other placed symbol; the
      // frame owns this copy.
      masks = frame.masks;
      if (!this.assign(values, masks, frame.branch, masks[frame.branch])) return null;
    } else {
      masks = [];
      for (const cell of problem.cells) {
        let mask = full;
        for (const peer of peers[cell]) if (values[peer] !== 0) mask &= ~symbolMask(values[peer]);
        if (values[cell] !== 0) mask &= symbolMask(values[cell]);
        this.units++;
        if (mask === 0) return null;
        masks[cell] = mask;
      }
    }
    for (;;) {
      let changed = false;
      for (const cell of problem.cells)
        if (values[cell] === 0 && (masks[cell] & (masks[cell] - 1)) === 0) {
          if (!this.assign(values, masks, cell, masks[cell])) return null;
          changed = true;
        }
      for (const house of fullHouses) {
        let once = 0,
          twice = 0;
        for (const cell of house) {
          twice |= once & masks[cell];
          once |= masks[cell];
        }
        if (once !== full) return null;
        for (let singles = once & ~twice; singles !== 0; singles &= singles - 1) {
          const bit = singles & -singles;
          let cell = -1;
          for (const member of house)
            if ((masks[member] & bit) !== 0) {
              cell = member;
              break;
            }
          // An assignment earlier in this sweep removed the house's only support.
          if (cell < 0) return null;
          if (values[cell] === 0) {
            if (!this.assign(values, masks, cell, bit)) return null;
            changed = true;
          }
        }
      }
      if (changed) continue;
      // Module forward checks. A hook may only shrink the masks of its own
      // cells; anything else it returns is ignored.
      for (const { rule, prune } of pruners) {
        this.units++;
        const next = prune(rule, problem, values, masks);
        if (next === null) return null;
        for (const cell of rule.cells) {
          const mask = next[cell] & masks[cell];
          if (mask === 0) return null;
          if (mask !== masks[cell]) {
            masks[cell] = mask;
            changed = true;
          }
        }
      }
      if (changed) continue;
      for (const { shared, onlyFirst, onlySecond } of lockedPairs) {
        let inside = 0,
          first = 0,
          second = 0;
        for (const cell of shared) inside |= masks[cell];
        for (const cell of onlyFirst) first |= masks[cell];
        for (const cell of onlySecond) second |= masks[cell];
        // Confined to the shared cells in one house: gone from the other's rest.
        const fromSecond = inside & ~first & second,
          fromFirst = inside & ~second & first;
        if (fromSecond !== 0)
          for (const cell of onlySecond) {
            masks[cell] &= ~fromSecond;
            if (masks[cell] === 0) return null;
          }
        if (fromFirst !== 0)
          for (const cell of onlyFirst) {
            masks[cell] &= ~fromFirst;
            if (masks[cell] === 0) return null;
          }
        if (fromSecond !== 0 || fromFirst !== 0) changed = true;
      }
      if (!changed) return masks;
    }
  }

  /** Propagation alone from `values`, as at the root; see exactFixedPoint. */
  fixedPoint(values: readonly number[]): readonly number[] | null {
    return this.propagate({ values: [...values], masks: null, branch: -1, decisions: [] });
  }

  *steps(): Generator<ExactEvent, void, void> {
    yield Object.freeze({ kind: "work", units: this.reservation.workUnits, stats: this.stats() });
    const { problem, checks } = this.semantics;
    while (this.frontier.length > 0) {
      const frame = defined(this.frontier.pop(), "frontier");
      this.nodes++;
      this.maxDepth = Math.max(this.maxDepth, frame.decisions.length);
      this.units = 1;
      const masks = this.propagate(frame);
      let selected = -1,
        size = Infinity;
      if (masks)
        for (const cell of problem.cells) {
          if (frame.values[cell] !== 0) continue;
          const count = popcount(masks[cell]);
          if (count < size) {
            selected = cell;
            size = count;
          }
        }
      let valid = masks !== null;
      if (masks && selected < 0) {
        const values = Object.freeze([...frame.values]);
        valid = this.semantics.validValues(values);
        for (const check of checks) {
          if (!valid) break;
          valid = check(values);
          this.units++;
        }
      }
      // One work event per node, carrying the node's counted operations.
      yield Object.freeze({ kind: "work", units: this.units, stats: this.stats() });
      if (!masks || !valid) {
        this.backtracks++;
        continue;
      }
      if (selected < 0) {
        yield Object.freeze({
          kind: "witness",
          values: Object.freeze([...frame.values]),
          decisions: Object.freeze([...frame.decisions]),
          stats: this.stats(),
        });
        if (++this.witnesses === 2) {
          yield Object.freeze({ kind: "cap-reached", stats: this.stats() });
          return;
        }
        continue;
      }
      for (let index = problem.symbols.length - 1; index >= 0; index--) {
        const symbol = problem.symbols[index],
          bit = symbolMask(symbol);
        if ((masks[selected] & bit) === 0) continue;
        const values = frame.values.slice(),
          childMasks = masks.slice();
        values[selected] = symbol;
        childMasks[selected] = bit;
        this.frontier.push({
          values,
          masks: childMasks,
          branch: selected,
          decisions: [
            ...frame.decisions,
            Object.freeze({ cell: selected, symbol, positive: true }),
          ],
        });
      }
    }
    // Deliberately not in finally: iterator.return() is never exhaustion.
    yield Object.freeze({ kind: "exhausted", stats: this.stats() });
  }
}

/** Inputs are copied immediately; callers enforce budgets by stopping at work yields. */
export function exactSteps(
  problem: EngineProblem,
  assembly: Assembly,
): Generator<ExactEvent, void, void> {
  return new ExactSearchSession(problem, assembly).steps();
}

/**
 * The exact phase's propagation fixed point for a partial assignment, without
 * branching: null on a contradiction, otherwise the candidate masks. Exposed
 * for soundness property tests (spec M2.6 §7); the search never calls it.
 */
export function exactFixedPoint(
  problem: EngineProblem,
  assembly: Assembly,
  values: readonly number[],
): readonly number[] | null {
  return new ExactSearchSession(problem, assembly).fixedPoint(values);
}

/** Global domain/clue validation precedes every declared complete-rule check. */
export function isWitness(problem: EngineProblem, assembly: Assembly, values: unknown): boolean {
  try {
    const semantics = new OriginalSemantics(problem, assembly);
    if (!semantics.validValues(values)) return false;
    const copied = Object.freeze([...values]);
    return semantics.checks.every((check) => check(copied));
  } catch {
    return false;
  }
}
