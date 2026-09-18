import type { ConstraintInstance } from "../problem";
import { BinaryRelationRule } from "./binary-relation";

export const DIFFERENCE_KINDS = Object.freeze(["consecutive", "ratio", "neither"] as const);
export type DifferenceKind = (typeof DIFFERENCE_KINDS)[number];

/**
 * difference@1 over one adjacent pair: `consecutive` (white kropki dot,
 * |a - b| = 1), `ratio` (black dot, a = 2b or b = 2a) or `neither` (the
 * negative constraint on a pair without a dot). One instance per pair keeps
 * premises exact; a negative-kropki grid publishes one `neither` per dotless
 * adjacency.
 */
export class DifferenceRule extends BinaryRelationRule {
  readonly type = "difference@1";

  constructor() {
    super();
    Object.freeze(this);
  }

  static kindOf(rule: ConstraintInstance): DifferenceKind | undefined {
    const parameters = rule.parameters;
    if (parameters === null || typeof parameters !== "object" || Array.isArray(parameters))
      return undefined;
    const kind = (parameters as { kind?: unknown }).kind;
    return DIFFERENCE_KINDS.find((candidate) => candidate === kind);
  }

  protected holds(left: number, right: number, rule: ConstraintInstance): boolean {
    const consecutive = Math.abs(left - right) === 1;
    const ratio = left === 2 * right || right === 2 * left;
    switch (DifferenceRule.kindOf(rule)) {
      case "consecutive":
        return consecutive;
      case "ratio":
        return ratio;
      default:
        return !consecutive && !ratio;
    }
  }

  protected parameterIssues(rule: ConstraintInstance): readonly string[] {
    const parameters = rule.parameters;
    const valid =
      parameters !== null &&
      typeof parameters === "object" &&
      !Array.isArray(parameters) &&
      Object.keys(parameters).length === 1 &&
      DifferenceRule.kindOf(rule) !== undefined;
    return valid ? [] : ["difference@1 requires exactly one kind: consecutive, ratio or neither"];
  }
}
