import type { CheckedStep } from "../proof/types";
import { isCheckedStep, checkedStepBytes } from "../proof/checker";
import type { ReadView } from "../state/types";
import { compareText } from "./ledger";
import { hasSingleCandidate, symbolMask } from "../state/read";

export function canonicalProof(step: CheckedStep): string {
  if (!isCheckedStep(step)) throw Error("inauthentic-checked-step");
  const order = (value: unknown): unknown =>
    Array.isArray(value)
      ? value.map(order)
      : value && typeof value === "object"
        ? Object.fromEntries(
            Object.keys(value)
              .sort()
              .map((k) => [k, order((value as Record<string, unknown>)[k])]),
          )
        : value;
  return JSON.stringify(order(step.proposal));
}
export interface StepFeatures {
  readonly placements: number;
  readonly removals: number;
  readonly newSingles: number;
  readonly utility: number;
  readonly assumptionDepth: number;
  readonly branchCount: number;
  readonly linkCount: number;
  readonly nodeCount: number;
  readonly effects: string;
  readonly proof: string;
}
/** Reads already checked effects and current domains; never constructs an index. */
export function stepFeatures(step: CheckedStep, view: ReadView): StepFeatures {
  if (!isCheckedStep(step)) throw Error("inauthentic-checked-step");
  const placements = new Set<number>(),
    removals = new Set<string>(),
    domains = new Map<number, number>();
  for (const effect of step.proposal.effects) {
    if (effect.kind === "place") placements.add(effect.cell);
    else {
      removals.add(`${effect.cell}:${effect.symbol}`);
      domains.set(
        effect.cell,
        (domains.get(effect.cell) ?? view.state.domains[effect.cell]) & ~symbolMask(effect.symbol),
      );
    }
  }
  const newSingles = [...domains].filter(
    ([cell, mask]) =>
      !placements.has(cell) &&
      !view.state.values[cell] &&
      !hasSingleCandidate(view.state.domains[cell]) &&
      hasSingleCandidate(mask),
  ).length;
  const nodes = step.proposal.proof.nodes;
  return {
    placements: placements.size,
    removals: removals.size,
    newSingles,
    utility: 16 * placements.size + removals.size + 8 * newSingles,
    assumptionDepth: nodes.reduce((max, n) => Math.max(max, n.scope.length), 0),
    branchCount: nodes.filter((n) => n.rule === "assume@1").length,
    linkCount: nodes.filter((n) => ["weak-link@1", "resolution@1"].includes(n.rule)).length,
    nodeCount: nodes.length,
    effects: JSON.stringify(
      [...step.proposal.effects].sort(
        (left, right) =>
          left.cell - right.cell ||
          left.symbol - right.symbol ||
          compareText(left.kind, right.kind),
      ),
    ),
    proof: canonicalProof(step),
  };
}
export function compareFeatures(left: StepFeatures, right: StepFeatures): number {
  return (
    left.assumptionDepth - right.assumptionDepth ||
    left.branchCount - right.branchCount ||
    left.linkCount - right.linkCount ||
    left.nodeCount - right.nodeCount
  );
}

/** Canonicalization/feature extraction allowance from authentic codec metadata. */
export function featureWork(step: CheckedStep): number {
  return (
    step.proposal.proof.nodes.length * 2 +
    step.proposal.effects.length * 4 +
    Math.ceil(checkedStepBytes(step) / 256) +
    1
  );
}
