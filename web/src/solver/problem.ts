/** Dense zero-based cell identifier within one normalized problem. */
export type CellId = number;
/** Dense one-based symbol identifier within one normalized problem. */
export type SymbolId = number;
export type Mask = number;
export type Json =
  | null
  | boolean
  | number
  | string
  | readonly Json[]
  | { readonly [key: string]: Json };
export type VersionId = string;
export type ConstraintId = string;
export type BranchId = string;
/** Complete canonical serialization; consumers must never compare a digest alone. */
export type ProblemKey = string;

export interface ConstraintInstance {
  id: ConstraintId;
  type: VersionId;
  /** Rule strategies decide whether this order is semantic or set-valued. */
  cells: readonly CellId[];
  parameters: Json;
}

export interface EngineProblem {
  schema: 1;
  cells: readonly CellId[];
  symbols: readonly SymbolId[];
  givens: readonly (SymbolId | 0)[];
  constraints: readonly ConstraintInstance[];
  key: ProblemKey;
}

const VERSION_ID = /^[a-z][a-z0-9-]*@[1-9]\d*$/;
const CONSTRAINT_ID = /^[A-Za-z0-9][A-Za-z0-9:._-]*$/;

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export class ProblemInputError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ProblemInputError";
  }
}

function fail(code: string, message: string): never {
  throw new ProblemInputError(code, message);
}

function assertPlainObject(
  value: unknown,
  label: string,
): asserts value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    fail("invalid-shape", `${label} must be a plain object`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null)
    fail("invalid-json", `${label} must be a plain JSON object`);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    if (
      typeof key !== "string" ||
      !descriptor.enumerable ||
      !("value" in descriptor)
    )
      fail("invalid-json", `${label} contains a non-JSON property`);
  }
}

function assertFields(
  value: Record<string, unknown>,
  allowed: readonly string[],
  required: readonly string[],
  label: string,
): void {
  const allowedSet = new Set(allowed);
  const unknown = Object.keys(value).find((key) => !allowedSet.has(key));
  if (unknown !== undefined)
    fail("unknown-field", `${label} contains unknown field ${unknown}`);
  const missing = required.find((key) => !Object.hasOwn(value, key));
  if (missing !== undefined) fail("missing-field", `${label} is missing ${missing}`);
}

function assertDenseArray(value: unknown, label: string): asserts value is unknown[] {
  if (!Array.isArray(value)) fail("invalid-shape", `${label} must be an array`);
  for (const key of Reflect.ownKeys(value)) {
    if (key === "length") continue;
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    if (
      typeof key !== "string" ||
      !/^(0|[1-9]\d*)$/.test(key) ||
      Number(key) >= value.length ||
      !descriptor.enumerable ||
      !("value" in descriptor)
    )
      fail("invalid-json", `${label} contains a non-JSON property`);
  }
  for (let index = 0; index < value.length; index++)
    if (!Object.hasOwn(value, index))
      fail("invalid-json", `${label} must not contain sparse entries`);
}

function normalizeJsonValue(value: unknown, path: string, active: WeakSet<object>): Json {
  if (value === null || typeof value === "boolean" || typeof value === "string")
    return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) fail("invalid-json", `${path} must be finite`);
    return Object.is(value, -0) ? 0 : value;
  }
  if (typeof value !== "object") fail("invalid-json", `${path} is not JSON`);
  if (active.has(value)) fail("invalid-json", `${path} contains a cycle`);
  active.add(value);
  try {
    if (Array.isArray(value)) {
      assertDenseArray(value, path);
      return Object.freeze(
        value.map((entry, index) => normalizeJsonValue(entry, `${path}[${index}]`, active)),
      );
    }
    assertPlainObject(value, path);
    const normalized: Record<string, Json> = {};
    for (const key of Object.keys(value).sort()) {
      const normalizedValue = normalizeJsonValue(value[key], `${path}.${key}`, active);
      // Assignment to "__proto__" on an ordinary object invokes a legacy
      // inherited setter. Defining a data property preserves it as JSON data
      // and prevents distinct semantic parameters from sharing one key.
      Object.defineProperty(normalized, key, {
        value: normalizedValue,
        enumerable: true,
        configurable: true,
        writable: true,
      });
    }
    return Object.freeze(normalized);
  } finally {
    active.delete(value);
  }
}

/** Serializes JSON with recursively sorted object keys and retained array order. */
export function canonicalJson(value: Json): string {
  return JSON.stringify(normalizeJsonValue(value, "$", new WeakSet()));
}

function copyJson(value: unknown, path: string): Json {
  return normalizeJsonValue(value, path, new WeakSet());
}

function integerArray(value: unknown, label: string): number[] {
  assertDenseArray(value, label);
  return value.map((entry, index) => {
    if (!Number.isSafeInteger(entry))
      fail("invalid-number", `${label}[${index}] must be a safe integer`);
    return entry as number;
  });
}

function normalizeConstraint(value: unknown, index: number): ConstraintInstance {
  const label = `constraints[${index}]`;
  assertPlainObject(value, label);
  assertFields(value, ["id", "type", "cells", "parameters"], ["id", "type", "cells", "parameters"], label);
  if (typeof value.id !== "string" || !CONSTRAINT_ID.test(value.id))
    fail("invalid-constraint-id", `${label}.id is invalid`);
  if (typeof value.type !== "string" || !VERSION_ID.test(value.type))
    fail("invalid-version", `${label}.type must be identifier@positive-integer`);
  return Object.freeze({
    id: value.id,
    type: value.type,
    cells: Object.freeze(integerArray(value.cells, `${label}.cells`)),
    parameters: copyJson(value.parameters, `${label}.parameters`),
  });
}

function semanticProblem(problem: Omit<EngineProblem, "key">): Json {
  return {
    schema: problem.schema,
    cells: problem.cells,
    symbols: problem.symbols,
    givens: problem.givens,
    constraints: problem.constraints.map(({ id, type, cells, parameters }) => ({
      id,
      type,
      cells,
      parameters,
    })),
  };
}

/**
 * Validates, isolates and canonically orders an engine problem. Constraint cell
 * order is deliberately retained; only a rule strategy may declare it set-valued.
 */
export function canonicalProblem(input: unknown): EngineProblem {
  assertPlainObject(input, "problem");
  assertFields(
    input,
    ["schema", "cells", "symbols", "givens", "constraints", "key"],
    ["schema", "cells", "symbols", "givens", "constraints"],
    "problem",
  );
  if (input.schema !== 1) fail("unsupported-schema", "problem.schema must be 1");

  const cells = integerArray(input.cells, "problem.cells");
  if (cells.length === 0 || cells.some((cell, index) => cell !== index))
    fail("invalid-cells", "problem.cells must be dense zero-based identifiers");

  const symbols = integerArray(input.symbols, "problem.symbols");
  if (symbols.length === 0 || symbols.some((symbol, index) => symbol !== index + 1))
    fail("invalid-symbols", "problem.symbols must be dense one-based identifiers");

  const givens = integerArray(input.givens, "problem.givens");
  if (
    givens.length !== cells.length ||
    givens.some((given) => given !== 0 && !symbols.includes(given))
  )
    fail("invalid-givens", "problem.givens must contain one known symbol or zero per cell");

  assertDenseArray(input.constraints, "problem.constraints");
  const constraints = input.constraints
    .map(normalizeConstraint)
    .sort((left, right) => compareText(left.id, right.id));
  const duplicate = constraints.find((constraint, index) => constraint.id === constraints[index - 1]?.id);
  if (duplicate) fail("duplicate-constraint-id", `duplicate constraint ID ${duplicate.id}`);
  for (const constraint of constraints)
    if (constraint.cells.some((cell) => !cells.includes(cell)))
      fail("invalid-scope", `${constraint.id} references an unknown cell`);

  const normalized = {
    schema: 1 as const,
    cells: Object.freeze(cells),
    symbols: Object.freeze(symbols),
    givens: Object.freeze(givens),
    constraints: Object.freeze(constraints),
  };
  const key = canonicalJson(semanticProblem(normalized));
  if (input.key !== undefined && (typeof input.key !== "string" || input.key !== key))
    fail("forged-key", "problem.key does not match its complete canonical semantics");
  return Object.freeze({ ...normalized, key });
}

/** Strict classic adapter: 81 cells, symbols 1-9, and 27 stable houses. */
export function normalizeClassic(input: unknown): EngineProblem {
  assertPlainObject(input, "classic definition");
  assertFields(
    input,
    ["kind", "version", "width", "height", "givens"],
    ["kind", "version", "width", "height", "givens"],
    "classic definition",
  );
  if (input.kind !== "classic" || input.version !== 1 || input.width !== 9 || input.height !== 9)
    fail("unsupported-classic", "classic definition must be classic version 1 at 9 by 9");
  const givens = integerArray(input.givens, "classic definition.givens");
  if (givens.length !== 81 || givens.some((given) => given < 0 || given > 9))
    fail("invalid-givens", "classic givens must contain exactly 81 values from 0 through 9");

  const constraints: ConstraintInstance[] = [];
  for (let index = 0; index < 9; index++) {
    const boxRow = Math.floor(index / 3) * 3;
    const boxColumn = (index % 3) * 3;
    constraints.push(
      {
        id: `row:${index}`,
        type: "all-different@1",
        cells: Array.from({ length: 9 }, (_, column) => index * 9 + column),
        parameters: {},
      },
      {
        id: `column:${index}`,
        type: "all-different@1",
        cells: Array.from({ length: 9 }, (_, row) => row * 9 + index),
        parameters: {},
      },
      {
        id: `box:${index}`,
        type: "all-different@1",
        cells: Array.from(
          { length: 9 },
          (_, offset) =>
            (boxRow + Math.floor(offset / 3)) * 9 + boxColumn + (offset % 3),
        ),
        parameters: {},
      },
    );
  }
  return canonicalProblem({
    schema: 1,
    cells: Array.from({ length: 81 }, (_, cell) => cell),
    symbols: Array.from({ length: 9 }, (_, index) => index + 1),
    givens,
    constraints,
  });
}
