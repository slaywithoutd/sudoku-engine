/**
 * Unwraps a value the surrounding code already guarantees to exist. The plain
 * Error keeps proof checkers classifying the failure as malformed input, just
 * as the property access on `undefined` it replaces would have.
 */
export function defined<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined) throw Error(`missing-${what}`);
  return value;
}
