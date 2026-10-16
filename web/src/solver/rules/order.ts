import type { ConstraintInstance } from "../problem";
import { BinaryRelationRule } from "./binary-relation";

/**
 * order@1: value(cells[0]) < value(cells[1]). A thermometer is a chain of
 * order instances along its path; futoshiki inequalities are single instances.
 */
export class OrderRule extends BinaryRelationRule {
  readonly type = "order@1";

  constructor() {
    super();
    Object.freeze(this);
  }

  protected holds(left: number, right: number): boolean {
    return left < right;
  }

  protected parameterIssues(rule: ConstraintInstance): readonly string[] {
    return rule.parameters !== null &&
      typeof rule.parameters === "object" &&
      !Array.isArray(rule.parameters) &&
      Object.keys(rule.parameters).length === 0
      ? []
      : ["order@1 accepts no parameters"];
  }
}
