import type { CheckedStep } from "../proof/types";
import { isCheckedStep, checkedStepBytes } from "../proof/checker";
import type { ReadView } from "../state/types";
import { compareText } from "./ledger";
import { hasSingleCandidate, symbolMask } from "../state/read";

export function canonicalProof(step: CheckedStep): string {
  if (!isCheckedStep(step)) throw Error("inauthentic-checked-step");
  const order = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(order)
      : v && typeof v === "object"
        ? Object.fromEntries(
            Object.keys(v)
              .sort()
              .map((k) => [k, order((v as Record<string, unknown>)[k])]),
          )
        : v;
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
        (a, b) => a.cell - b.cell || a.symbol - b.symbol || compareText(a.kind, b.kind),
      ),
    ),
    proof: canonicalProof(step),
  };
}
export function compareFeatures(a: StepFeatures, b: StepFeatures): number {
  return (
    a.assumptionDepth - b.assumptionDepth ||
    a.branchCount - b.branchCount ||
    a.linkCount - b.linkCount ||
    a.nodeCount - b.nodeCount
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
