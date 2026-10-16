/**
 * Technique profile identities (spec §3.6). Kept free of runtime imports so
 * identity code (conditional binding, options validation) can name profiles
 * without loading the technique catalogue.
 */
export const PROFILES = Object.freeze([
  "classic-expanded@1",
  "classic-conditional@1",
  "variants-expanded@1",
  "variants-conditional@1",
] as const);
export type ProfileId = (typeof PROFILES)[number];

export function isProfile(value: string): value is ProfileId {
  return (PROFILES as readonly string[]).includes(value);
}

/** The profile a problem needs: variant rows only when a non-classic rule is declared. */
export function profileFor(
  problem: { constraints: readonly { type: string }[] },
  conditional = false,
): ProfileId {
  const variant = problem.constraints.some((rule) => rule.type !== "all-different@1");
  return variant
    ? conditional
      ? "variants-conditional@1"
      : "variants-expanded@1"
    : conditional
      ? "classic-conditional@1"
      : "classic-expanded@1";
}
