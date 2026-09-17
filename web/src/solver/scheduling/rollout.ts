import { HypotheticalSession, retainedProof } from "../state/candidates";
import { prepareSources, type SourceIndex } from "../state/source-index";
import { checkedStepBytes } from "../proof/checker";
import { getTechniques } from "../techniques/registry";
import type { CheckedStep } from "../proof/types";
import type { ReadView } from "../state/types";
import type { Limits } from "../limits";
import type { IndexWorkspace } from "../indexes/workspace";
import { IndexInterrupted } from "../indexes/workspace";
import { WorkBudget, WorkLimit, type ReservableBudget } from "./work";
import { canonicalProof, stepFeatures, featureWork } from "./features";
import { compareText } from "./ledger";

export interface RolloutShare {
  readonly allowance: number;
  readonly usedWork: number;
  readonly steps: number;
  readonly utility: number;
  readonly complete: boolean;
  readonly reason?: string;
}
export type RolloutEvent =
  | { kind: "work"; units: number }
  | {
      kind: "rollout";
      selected: CheckedStep;
      primaryRevision: number;
      usedWork: number;
      shares: readonly RolloutShare[];
    };
/** Metrics and first-candidate identity only; no hypothetical proof or view escapes. */
export function* rolloutCandidates(
  view: ReadView,
  candidates: readonly CheckedStep[],
  context: { workspace: IndexWorkspace; limits: Limits; budget: ReservableBudget },
): Generator<RolloutEvent, void, void> {
  if (!candidates.length || candidates.length > 4) throw Error("invalid-rollout-candidates");
  const productive = candidates.filter((step) => step.proposal.effects.length > 0);
  if (!productive.length) {
    yield {
      kind: "rollout",
      selected: candidates[0],
      primaryRevision: view.state.key.revision,
      usedWork: 0,
      shares: candidates.map(() => ({
        allowance: 0,
        usedWork: 0,
        steps: 0,
        utility: 0,
        complete: false,
        reason: "proof-only",
      })),
    };
    return;
  }
  const allowance = Math.min(8192, Math.floor(context.budget.remaining() / 10)),
    share = Math.floor(allowance / productive.length);
  const costs = productive.map((step) => featureWork(step) + 1);
  // An unaffordable comparison performs no speculative work and preserves the
  // caller's baseline first candidate, explicitly reporting no evaluated branch.
  if (costs.some((cost) => cost > share)) {
    yield {
      kind: "rollout",
      selected: productive[0],
      primaryRevision: view.state.key.revision,
      usedWork: 0,
      shares: productive.map(() => ({
        allowance: share,
        usedWork: 0,
        steps: 0,
        utility: 0,
        complete: false,
        reason: "insufficient-share",
      })),
    };
    return;
  }
  const shares: RolloutShare[] = [];
  let usedWork = 0;
  const ordering = context.workspace.reserve(
    candidates.length,
    4096 + candidates.reduce((n, step) => n + checkedStepBytes(step) * 4, 0),
  );
  try {
    const entries = productive
      .map((step, i) => {
        context.workspace.checkpoint();
        if (!context.budget.spend(costs[i])) throw new WorkLimit();
        usedWork += costs[i];
        return { step, cost: costs[i], key: canonicalProof(step) };
      })
      .sort((left, right) => compareText(left.key, right.key));
    const ordered = entries.map((entry) => entry.step);
    const cheap = getTechniques("classic-expanded@1").filter(
      (descriptor) => descriptor.tier <= 1 && /^c0[1-5]@1$/.test(descriptor.id),
    );
    for (const entry of entries) {
      const first = entry.step,
        budget = new WorkBudget(share);
      budget.charge(entry.cost);
      let session: HypotheticalSession | undefined,
        source: SourceIndex | undefined,
        steps = 0,
        complete = false,
        reason: string | undefined,
        utility = 0;
      const charge = (units: number) => {
        context.workspace.checkpoint();
        budget.charge(units);
        if (!context.budget.spend(units)) throw new WorkLimit();
        usedWork += units;
      };
      try {
        charge(1); // branch ordering/scoring header
        session = HypotheticalSession.fromChecked(
          view,
          first,
          "rollout",
          context.workspace,
          charge,
        );
        utility = stepFeatures(first, view).utility;
        for (; steps < 16;) {
          const preparing = prepareSources(session.view, context.workspace, {
            level: "facts",
            reserveWork: (maximum) => {
              const local = budget.reserve(maximum);
              let shared;
              try {
                shared = context.budget.reserve(maximum);
              } catch (error) {
                local.dispose();
                throw error;
              }
              return {
                settle: (actual) => {
                  local.settle(actual);
                  shared.settle(actual);
                  usedWork += actual;
                },
                dispose: () => {
                  local.dispose();
                  shared.dispose();
                },
              };
            },
          });
          try {
            let next = preparing.next();
            while (!next.done) {
              if (!next.value.prepaid) charge(next.value.units);
              yield next.value;
              next = preparing.next();
            }
            source = next.value;
          } finally {
            preparing.return(undefined as never);
          }
          let productive = false;
          for (const descriptor of cheap) {
            const cursor = descriptor.discover(session.view, {
              workspace: context.workspace,
              limits: { ...context.limits, workUnits: budget.remaining() },
            });
            try {
              for (const event of cursor) {
                if (event.kind === "work") {
                  charge(event.units);
                  yield event;
                } else if (event.kind === "proposal") {
                  // Producer remains paused until independent checking consumes its borrowed
                  // proposal.
                  const lease = context.workspace.reserve(
                    1,
                    context.limits.stepBytes * 3 + retainedProof(session.view).size * 128,
                  );
                  try {
                    charge(
                      1 + event.proposal.proof.nodes.length + event.proposal.proof.imports.length,
                    );
                    const checking = session.check(event.proposal, {
                      ...context.limits,
                      workUnits: budget.remaining(),
                    });
                    try {
                      for (const checked of checking) {
                        if (checked.kind === "work") {
                          charge(checked.units);
                          yield checked;
                        } else if (checked.kind === "rejected") {
                          if (/limit|cancel/.test(checked.code)) throw new WorkLimit(checked.code);
                        } else if (checked.certificate.proposal.effects.length) {
                          charge(
                            checked.certificate.proposal.proof.nodes.length * 24 +
                              session.view.state.domains.length * 16 +
                              2,
                          );
                          const before = session.view.state;
                          session.publish(checked.certificate);
                          const after = session.view.state;
                          for (const cell of after.values.keys()) {
                            if (before.values[cell] !== after.values[cell]) utility += 16;
                            let mask = before.domains[cell] & ~after.domains[cell];
                            while (mask) {
                              utility++;
                              mask &= mask - 1;
                            }
                            if (
                              !after.values[cell] &&
                              after.domains[cell] &&
                              (after.domains[cell] & (after.domains[cell] - 1)) === 0 &&
                              (before.domains[cell] & (before.domains[cell] - 1)) !== 0
                            )
                              utility += 8;
                          }
                          steps++;
                          productive = true;
                          break;
                        }
                      }
                    } finally {
                      checking.return(undefined);
                    }
                  } finally {
                    lease.dispose();
                  }
                  if (productive) break;
                } else if (event.kind === "interrupted") throw new WorkLimit(event.reason);
              }
            } finally {
              cursor.return();
            }
            if (productive) break;
          }
          source.dispose();
          source = undefined;
          if (!productive) {
            complete = true;
            break;
          }
        }
        if (steps === 16) complete = true;
      } catch (error) {
        if (error instanceof WorkLimit || error instanceof IndexInterrupted) reason = error.reason;
        else throw error;
      } finally {
        source?.dispose();
        session?.dispose();
      }
      shares.push(
        Object.freeze({
          allowance: share,
          usedWork: budget.used,
          steps,
          utility,
          complete,
          ...(reason ? { reason } : {}),
        }),
      );
    }
    // A bounded prefix is a metric, never a completion claim. Canonical ties remain fixed.
    let best = 0;
    for (let i = 1; i < ordered.length; i++) if (shares[i].utility > shares[best].utility) best = i;
    yield {
      kind: "rollout",
      selected: ordered[best],
      primaryRevision: view.state.key.revision,
      usedWork,
      shares: Object.freeze(shares),
    };
  } finally {
    ordering.dispose();
  }
}
