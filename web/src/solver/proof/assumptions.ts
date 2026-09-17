import {
  derived,
  domainAssertion,
  literals,
  premises,
  requireProof,
  sameValue,
  validLiteral,
} from "./primitives";
import type { CheckContext, CheckedInference, PrimitiveInput, ProofNode } from "./types";

/** Lexical scopes are ancestor chains; a numeric list is never assumption authority. */
export function checkScope(node: ProofNode, context: CheckContext): void {
  for (const [index, id] of node.scope.entries()) {
    const ancestor = context.retained.get(id);
    requireProof(
      ancestor?.rule === "assume@1" &&
        id < node.id &&
        sameValue(ancestor.scope, node.scope.slice(0, index)),
      "invalid-assumption-ancestor",
    );
  }
  if (node.rule === "discharge@1" || node.rule === "cases@1") return;
  for (const id of node.premises) {
    const premise = context.retained.get(id)!;
    const scope = premise.rule === "assume@1" ? [...premise.scope, id] : premise.scope;
    requireProof(
      scope.every((ancestor, index) => node.scope[index] === ancestor),
      "sibling-assumption-import",
    );
    requireProof(
      context.premiseInferences
        ?.get(id)
        ?.openAssumptions.every((ancestor) => node.scope.includes(ancestor)),
      "escaped-assumption",
    );
  }
}

export class AssumptionStrategy {
  readonly id = "assume@1";
  check(input: PrimitiveInput, context: CheckContext): CheckedInference {
    const node = context.currentNode;
    requireProof(
      node &&
        context.policy !== "unconditional" &&
        input.premises.length === 0 &&
        sameValue(input.parameters, {}) &&
        input.conclusion.kind === "literal" &&
        validLiteral(input.conclusion.value, context) &&
        sameValue(input.conclusion, { kind: "literal", value: input.conclusion.value }),
      "invalid-assumption",
    );
    return Object.freeze({
      conclusion: input.conclusion,
      openAssumptions: Object.freeze([...node.scope, node.id]),
      conditional: false,
      rules: Object.freeze([]),
    });
  }
}

/** Introduction is exact; elimination names one existing conjunct by index. */
export class ConjunctionStrategy {
  readonly id = "conjunction@1";
  check(input: PrimitiveInput, context: CheckContext): CheckedInference {
    if (sameValue(input.parameters, {})) {
      const terms = premises(input, context, input.premises.length);
      requireProof(
        terms.length > 0 && sameValue(input.conclusion, { kind: "and", terms }),
        "invalid-conjunction",
      );
    } else {
      const index = (input.parameters as { index: number }).index;
      const source = context.retained.get(input.premises[0])?.conclusion;
      requireProof(
        input.premises.length === 1 &&
          Number.isSafeInteger(index) &&
          index >= 0 &&
          sameValue(input.parameters, { index }) &&
          source?.kind === "and" &&
          index < source.terms.length &&
          sameValue(input.conclusion, source.terms[index]),
        "invalid-conjunction-projection",
      );
    }
    return derived(input, context);
  }
}

export class ContradictionStrategy {
  readonly id = "contradiction@1";
  check(input: PrimitiveInput, context: CheckContext): CheckedInference {
    const sources = premises(input, context, input.premises.length);
    requireProof(sameValue(input.conclusion, { kind: "false" }), "invalid-contradiction");
    let valid =
      sources.length === 1 &&
      (sources[0].kind === "false" || domainAssertion(sources[0])?.mask === 0);
    if (sources.length === 2 && sources.every((p) => p.kind === "literal")) {
      const [a, b] = sources.map((p) => (p.kind === "literal" ? p.value : undefined));
      valid = a!.cell === b!.cell && a!.symbol === b!.symbol && a!.positive !== b!.positive;
    }
    if (sources[0]?.kind === "clause") {
      const alternatives = sources[0].alternatives;
      valid =
        alternatives.length === sources.length - 1 &&
        alternatives.every((value, index) =>
          sameValue(sources[index + 1], {
            kind: "literal",
            value: { ...value, positive: !value.positive },
          }),
        );
    }
    requireProof(valid, "invalid-contradiction");
    return derived(input, context);
  }
}

function branch(
  input: PrimitiveInput,
  context: CheckContext,
  assumptionId: number,
  resultId: number,
): void {
  const parent = context.currentNode?.scope;
  const assumption = context.retained.get(assumptionId),
    result = context.retained.get(resultId);
  requireProof(
    parent &&
      assumption?.rule === "assume@1" &&
      sameValue(assumption.scope, parent) &&
      result &&
      sameValue(result.rule === "assume@1" ? [...result.scope, result.id] : result.scope, [
        ...parent,
        assumptionId,
      ]),
    "invalid-discharge-branch",
  );
  requireProof(
    context.premiseInferences
      ?.get(resultId)
      ?.openAssumptions.every((id) => parent.includes(id) || id === assumptionId),
    "escaped-assumption",
  );
  requireProof(input.premises.includes(assumptionId), "missing-assumption");
}

function close(
  input: PrimitiveInput,
  context: CheckContext,
  discharged: readonly number[],
): CheckedInference {
  const result = derived(input, context);
  return Object.freeze({
    ...result,
    openAssumptions: Object.freeze(result.openAssumptions.filter((id) => !discharged.includes(id))),
  });
}

export class DischargeStrategy {
  readonly id = "discharge@1";
  check(input: PrimitiveInput, context: CheckContext): CheckedInference {
    const [assumption, result] = premises(input, context, 2);
    branch(input, context, input.premises[0], input.premises[1]);
    requireProof(
      assumption.kind === "literal" &&
        result.kind === "false" &&
        sameValue(input.conclusion, {
          kind: "literal",
          value: { ...assumption.value, positive: !assumption.value.positive },
        }),
      "invalid-discharge",
    );
    return close(input, context, [input.premises[0]]);
  }
}

export class CasesStrategy {
  readonly id = "cases@1";
  check(input: PrimitiveInput, context: CheckContext): CheckedInference {
    const sources = premises(input, context, input.premises.length);
    const alternatives = literals(sources[0]);
    requireProof(
      alternatives.length > 0 && input.premises.length === 1 + alternatives.length * 2,
      "incomplete-cases",
    );
    const parent = context.currentNode!.scope;
    requireProof(
      context
        .premiseInferences!.get(input.premises[0])!
        .openAssumptions.every((id) => parent.includes(id)) &&
        context.retained.get(input.premises[0])!.scope.every((id, index) => parent[index] === id),
      "scoped-case-cover",
    );
    const discharged: number[] = [];
    alternatives.forEach((value, index) => {
      const offset = 1 + index * 2;
      branch(input, context, input.premises[offset], input.premises[offset + 1]);
      requireProof(
        sameValue(sources[offset], { kind: "literal", value }) &&
          (sameValue(sources[offset + 1], input.conclusion) ||
            sources[offset + 1].kind === "false"),
        "invalid-case-conclusion",
      );
      discharged.push(input.premises[offset]);
    });
    return close(input, context, discharged);
  }
}
