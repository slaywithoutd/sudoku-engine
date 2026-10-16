import { AllDifferentRule } from "./all-different";
import { ArrowRule } from "./arrow";
import { CageRule } from "./cage";
import { DifferenceRule } from "./difference";
import { OrderRule } from "./order";
import type { RuleModule } from "./types";

/**
 * Rule modules the application registers. Classic problems only contain
 * all-different instances, so adding variant modules here changes nothing
 * for them; a problem with an unregistered type still fails assembly.
 */
export function productionRules(): readonly RuleModule[] {
  return Object.freeze([
    new AllDifferentRule(),
    new OrderRule(),
    new DifferenceRule(),
    new CageRule(),
    new ArrowRule(),
  ]);
}
