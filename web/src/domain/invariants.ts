/**
 * Unwraps a value the surrounding code already guarantees to exist. The solver
 * keeps its own copy in `solver/invariants.ts` so the domain never imports from
 * the solver and the solver never imports from the domain.
 */
export function defined<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined) throw Error(`missing-${what}`);
  return value;
}

/**
 * Reads a record entry as the possibly-absent value it is at runtime. Ids
 * arrive from routes, storage and imports, so the `Record<string, T>` index
 * signature's promise that every key exists is not one the caller can trust.
 */
export function lookup<T>(records: Readonly<Record<string, T>>, id: string): T | undefined {
  return Object.hasOwn(records, id) ? records[id] : undefined;
}
