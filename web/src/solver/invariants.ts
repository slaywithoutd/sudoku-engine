/**
 * Unwraps a value the surrounding code already guarantees to exist. The plain
 * Error keeps proof checkers classifying the failure as malformed input, just
 * as the property access on `undefined` it replaces would have.
 */
export function defined<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined) throw Error(`missing-${what}`);
  return value;
}

/**
 * The shape of `T` as seen by a validator: every field may be absent and every
 * leaf may hold anything, because the value arrived through a cast, a rule
 * module or a serialized proof rather than through the type checker.
 */
export type Unverified<T> = T extends readonly (infer Item)[]
  ? readonly Unverified<Item>[] | null | undefined
  : T extends (...args: never[]) => unknown
    ? unknown
    : T extends object
      ? { readonly [Key in keyof T]?: Unverified<T[Key]> } | null | undefined
      : unknown;

/** Reads a trusted-typed value as the untrusted data it really is. */
export function unverified<T>(value: T): Unverified<T> {
  return value as Unverified<T>;
}

/** Destructuring reads the first element as possibly absent, matching the runtime. */
export function optionalHead<T>(items: readonly T[]): [T | undefined, ...T[]] {
  return [items[0], ...items.slice(1)];
}

/** Fields of a cast value, each read as unknown so a validator's checks stay real. */
export type Claimed<T> = { readonly [Key in keyof T]?: unknown };

/** Reads the fields a cast promised without trusting any of them. */
export function claimed<T extends object>(value: T): Claimed<T> {
  return value;
}
