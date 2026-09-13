import { canonicalProblem } from "./problem";
import type { EngineProblem, ConstraintInstance } from "./problem";
import type { Assembly } from "./rules/types";
import type { Literal } from "./state/types";

export interface ExactStats { readonly nodes: number; readonly backtracks: number; readonly maxDepth: number }
export type ExactEvent = { readonly kind: "work"; readonly units: number; readonly stats: ExactStats }
  | { readonly kind: "witness"; readonly values: readonly number[]; readonly decisions: readonly Literal[]; readonly stats: ExactStats }
  | { readonly kind: "exhausted" | "cap-reached"; readonly stats: ExactStats };

export const EXACT_METHOD = "original-dfs@1";

export interface ExactInitializationReservation { readonly workUnits: number; readonly workspaceBytes: number }

function requireInput(condition: unknown, code: string): asserts condition {
  if (!condition) throw new Error(code);
}
function dataFields(value: unknown, fields: readonly string[]): void {
  requireInput(value !== null && typeof value === "object" &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null), "exact-invalid-data");
  requireInput(Reflect.ownKeys(value).length === fields.length, "exact-invalid-data");
  for (const field of fields) {
    const descriptor = Object.getOwnPropertyDescriptor(value, field);
    requireInput(descriptor?.enumerable && "value" in descriptor, "exact-invalid-data");
  }
}
function boundedArray(value: unknown, maximum: number, code: string): asserts value is readonly unknown[] {
  requireInput(Array.isArray(value) && value.length <= maximum, code);
  requireInput(Reflect.ownKeys(value).length === value.length + 1, "exact-invalid-data");
  for (let index = 0; index < value.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, index);
    requireInput(descriptor?.enumerable && "value" in descriptor, "exact-invalid-data");
  }
}
/** Finite scalar M2 input gate, deliberately independent of proof/discovery code. */
function inputSize(problem: EngineProblem): { entries: number; characters: number; scopes: number } {
  dataFields(problem, ["schema", "cells", "symbols", "givens", "constraints", "key"]);
  boundedArray(problem.cells, 81, "exact-cell-limit");
  boundedArray(problem.symbols, 9, "exact-symbol-limit");
  boundedArray(problem.givens, 81, "exact-given-limit");
  boundedArray(problem.constraints, 256, "exact-rule-limit");
  requireInput(problem.cells.length > 0 && problem.symbols.length > 0 && problem.givens.length === problem.cells.length, "exact-invalid-size");
  requireInput(typeof problem.key === "string" && problem.key.length <= 1_048_576, "exact-key-limit");
  let entries = problem.cells.length + problem.symbols.length + problem.givens.length, characters = problem.key.length, scopes = 0;
  for (const rule of problem.constraints) {
    dataFields(rule, ["id", "type", "cells", "parameters"]);
    boundedArray(rule.cells, 81, "exact-scope-limit");
    requireInput(rule.cells.length > 0, "exact-scope-limit");
    for (const id of [rule.id, rule.type]) {
      requireInput(typeof id === "string" && id.length > 0 && id.length <= 16_384, "exact-identifier-limit");
      characters += id.length;
    }
    const parameters = rule.parameters;
    requireInput(parameters !== null && typeof parameters === "object" && !Array.isArray(parameters) &&
      (Object.getPrototypeOf(parameters) === Object.prototype || Object.getPrototypeOf(parameters) === null), "exact-parameter-limit");
    const keys = Reflect.ownKeys(parameters);
    requireInput(keys.length <= 16, "exact-parameter-limit");
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(parameters, key)!;
      requireInput(typeof key === "string" && key.length <= 64 && descriptor.enumerable && "value" in descriptor &&
        (typeof descriptor.value === "boolean" || Number.isSafeInteger(descriptor.value)), "exact-parameter-limit");
      characters += key.length;
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
 * one internal preflight, both canonical copies, peer construction and the maximum
 * explicit frontier. The first work event reports this same reservation ONCE;
 * it is not an ordinary cooperative unit. Extra caller preflights need extra budget.
 * Workspace is accounted storage, not measured JavaScript heap. Scalar parameters
 * have <=16 integer/boolean fields, identifiers <=16Ki characters, key <=1Mi
 * characters, and total original text <=2Mi characters per input.
 */
export function exactInitializationReservation(problem: EngineProblem, assembly: Assembly): ExactInitializationReservation {
  dataFields(assembly, ["problem", "modules", "allDifferent", "covers", "relations", "peers", "supportSignature"]);
  const first = inputSize(problem), second = inputSize(assembly.problem);
  const cells = problem.cells.length, symbols = problem.symbols.length;
  const scalarWork = 8 * (first.entries + second.entries + first.characters + second.characters);
  const peerWork = 4 * cells * (problem.constraints.length + first.scopes + cells);
  return Object.freeze({ workUnits: 1 + scalarWork + peerWork,
    workspaceBytes: 64 * (first.entries + second.entries + cells * cells + cells * symbols * (cells + 4)) +
      4 * (first.characters + second.characters) });
}

/** Copies original semantics; capability caches and human domains are never read. */
class OriginalSemantics {
  readonly reservation: ExactInitializationReservation;
  readonly problem: EngineProblem;
  readonly checks: readonly ((values: readonly number[]) => boolean)[];
  readonly houses: readonly ConstraintInstance[];
  readonly peers: readonly (readonly number[])[];
  constructor(problem: EngineProblem, assembly: Assembly) {
    this.reservation = exactInitializationReservation(problem, assembly);
    this.problem = canonicalProblem(problem);
    if (canonicalProblem(assembly.problem).key !== this.problem.key) throw new Error("exact-problem-mismatch");
    if (this.problem.cells.length > 81 || this.problem.symbols.length > 9 || this.problem.constraints.length > 256)
      throw new Error("exact-unsupported-size");
    this.checks = this.problem.constraints.map(rule => {
      const module = assembly.modules.get(rule.id);
      if (!module || module.type !== rule.type || typeof module.checkComplete !== "function" ||
        typeof module.validate !== "function" || module.validate(this.problem, rule).length !== 0)
        throw new Error("exact-unsupported-rule");
      const check = module.checkComplete.bind(module);
      return (values: readonly number[]) => check(rule, { values }) === true;
    });
    this.houses = this.problem.constraints.filter(rule => rule.type === "all-different@1");
    this.peers = this.problem.cells.map(cell => [...new Set(this.houses.filter(rule => rule.cells.includes(cell))
      .flatMap(rule => rule.cells).filter(peer => peer !== cell))].sort((a, b) => a - b));
  }
  validValues(values: unknown): values is readonly number[] {
    if (!Array.isArray(values) || values.length !== this.problem.cells.length) return false;
    for (const cell of this.problem.cells) if (!Number.isSafeInteger(values[cell]) ||
      !this.problem.symbols.includes(values[cell]) || (this.problem.givens[cell] !== 0 && this.problem.givens[cell] !== values[cell])) return false;
    return true;
  }
}

interface Frame { values: number[]; decisions: readonly Literal[] }

/** One explicit DFS frontier. Backtracks count rejected terminal branches. */
class ExactSearchSession {
  private readonly semantics: OriginalSemantics;
  private readonly frontier: Frame[];
  private readonly seen = new Set<string>();
  private nodes = 0;
  private backtracks = 0;
  private maxDepth = 0;
  private readonly reservation: ExactInitializationReservation;
  constructor(problem: EngineProblem, assembly: Assembly) {
    this.semantics = new OriginalSemantics(problem, assembly);
    this.reservation = this.semantics.reservation;
    this.frontier = [{ values: [...this.semantics.problem.givens], decisions: [] }];
  }
  private stats(): ExactStats { return Object.freeze({ nodes: this.nodes, backtracks: this.backtracks, maxDepth: this.maxDepth }); }
  private work(): ExactEvent { return Object.freeze({ kind: "work", units: 1, stats: this.stats() }); }

  /** Each yield follows one bounded cell scan, house/symbol scan or assignment. */
  private *propagate(values: number[]): Generator<ExactEvent, number[] | null, void> {
    const { problem, peers, houses } = this.semantics;
    const full = (1 << problem.symbols.length) - 1;
    for (;;) {
      const masks: number[] = [];
      let single = -1;
      for (const cell of problem.cells) {
        let mask = full;
        for (const peer of peers[cell]) if (values[peer] !== 0) mask &= ~(1 << (values[peer] - 1));
        if (values[cell] !== 0) mask &= 1 << (values[cell] - 1);
        masks[cell] = mask;
        yield this.work();
        if (mask === 0) return null;
        if (values[cell] === 0 && (mask & (mask - 1)) === 0 && single < 0) single = cell;
      }
      if (single >= 0) {
        values[single] = Math.log2(masks[single]) + 1;
        yield this.work();
        continue;
      }
      let hidden: { cell: number; symbol: number } | undefined;
      for (const house of houses) if (house.cells.length === problem.symbols.length) {
        for (const symbol of problem.symbols) {
          const supports = house.cells.filter(cell => (masks[cell] & (1 << (symbol - 1))) !== 0);
          yield this.work();
          if (supports.length === 0) return null;
          if (supports.length === 1 && values[supports[0]] === 0 && !hidden) hidden = { cell: supports[0], symbol };
        }
      }
      if (!hidden) return masks;
      values[hidden.cell] = hidden.symbol;
      yield this.work();
    }
  }

  *steps(): Generator<ExactEvent, void, void> {
    yield Object.freeze({ kind: "work", units: this.reservation.workUnits, stats: this.stats() });
    const { problem, checks } = this.semantics;
    while (this.frontier.length > 0) {
      const frame = this.frontier.pop()!;
      this.nodes++;
      this.maxDepth = Math.max(this.maxDepth, frame.decisions.length);
      yield this.work();
      const masks = yield* this.propagate(frame.values);
      if (!masks) { this.backtracks++; continue; }
      let selected = -1, size = Infinity;
      for (const cell of problem.cells) {
        if (frame.values[cell] !== 0) continue;
        const count = problem.symbols.filter(symbol => (masks[cell] & (1 << (symbol - 1))) !== 0).length;
        if (count < size) { selected = cell; size = count; }
        yield this.work();
      }
      if (selected < 0) {
        const values = Object.freeze([...frame.values]);
        let valid = this.semantics.validValues(values);
        for (const check of checks) {
          if (!valid) break;
          valid = check(values);
          yield this.work();
        }
        if (!valid) { this.backtracks++; continue; }
        const key = values.join(",");
        if (!this.seen.has(key)) {
          this.seen.add(key);
          yield Object.freeze({ kind: "witness", values, decisions: Object.freeze([...frame.decisions]), stats: this.stats() });
          if (this.seen.size === 2) { yield Object.freeze({ kind: "cap-reached", stats: this.stats() }); return; }
        }
      } else {
        for (let index = problem.symbols.length - 1; index >= 0; index--) {
          const symbol = problem.symbols[index];
          if ((masks[selected] & (1 << (symbol - 1))) === 0) continue;
          const values = [...frame.values]; values[selected] = symbol;
          this.frontier.push({ values, decisions: [...frame.decisions, Object.freeze({ cell: selected, symbol, positive: true })] });
          yield this.work();
        }
      }
    }
    // Deliberately not in finally: iterator.return() is never exhaustion.
    yield Object.freeze({ kind: "exhausted", stats: this.stats() });
  }
}

/** Inputs are copied immediately; callers enforce budgets by stopping at work yields. */
export function exactSteps(problem: EngineProblem, assembly: Assembly): Generator<ExactEvent, void, void> {
  return new ExactSearchSession(problem, assembly).steps();
}

/** Global domain/clue validation precedes every declared complete-rule check. */
export function isWitness(problem: EngineProblem, assembly: Assembly, values: unknown): boolean {
  try {
    const semantics = new OriginalSemantics(problem, assembly);
    if (!semantics.validValues(values)) return false;
    const copied = Object.freeze([...values]);
    return semantics.checks.every(check => check(copied));
  } catch { return false; }
}
