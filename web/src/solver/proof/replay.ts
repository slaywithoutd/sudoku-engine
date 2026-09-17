import { isConditionalOperation } from "../conditional";
import { utf8Length } from "../utf8";
import type { SolverSnapshot } from "../snapshot";
import type { Assembly } from "../rules/types";
import type { CheckEvent, DeductionProposal, Limits, Proposition } from "./types";
import { checkProposal, checkedHeaderBytes, checkedWorkUnits } from "./checker";
import { initialize, commitChecked, retainedProof, retainCheckedFacts } from "../state/candidates";
import { assertM2RootAssemblyBounds, ProofError, requireProof, sameValue } from "./primitives";

export interface InitializationReservation {
  readonly nodes: number;
  readonly proofBytes: number;
  readonly workUnits: number;
  /** Conservative accounted object/index entries; not a measured JS heap size. */
  readonly workspaceBytes: number;
}

/**
 * Pure, cooperative reservation: describe original nodes without issuing facts.
 * Structural bounds run before descriptor traversal; each bounded serialization
 * is preceded by a work yield. The returned work reserves synchronous root and
 * index construction separately from this estimator's own emitted work.
 */
export function* initializationReservation(
  assembly: Assembly,
): Generator<CheckEvent, InitializationReservation, void> {
  assertM2RootAssemblyBounds(assembly);
  const problem = assembly.problem;
  let nodes = 0,
    proofBytes = 0;
  const add = (
    rule: string,
    conclusion: Proposition,
    premises: readonly number[] = [],
    parameters = {},
  ) => {
    const text = JSON.stringify({ id: nodes++, rule, conclusion, premises, parameters, scope: [] });
    const bytes = utf8Length(text);
    requireProof(bytes <= 16384, "proof-byte-limit");
    proofBytes += bytes;
  };
  for (const cell of problem.cells) {
    yield { kind: "work", units: 1 };
    add("domain-axiom@1", { kind: "domain", cell, mask: 2 ** problem.symbols.length - 1 });
  }
  for (const cell of problem.cells)
    if (problem.givens[cell]) {
      yield { kind: "work", units: 1 };
      add("given@1", {
        kind: "literal",
        value: { cell, symbol: problem.givens[cell], positive: true },
      });
    }
  const handles = new Map<number, string>();
  for (const rule of problem.constraints) {
    yield { kind: "work", units: 1 };
    handles.set(nodes, rule.id);
    add("rule-instance@1", { kind: "rule", constraintId: rule.id });
  }
  const sorted = <T extends { id: string }>(values: readonly T[]) =>
    [...values].sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
  for (const scope of sorted(assembly.allDifferent)) {
    yield { kind: "work", units: 1 };
    add("all-different@1", { kind: "all-different", cells: scope.cells }, [scope.premise], {
      constraintId: handles.get(scope.premise),
    });
  }
  for (const cover of sorted(assembly.covers)) {
    yield { kind: "work", units: 1 };
    add("cover@1", { kind: "cover", cells: cover.cells, symbol: cover.symbol }, [cover.premise], {
      constraintId: handles.get(cover.premise),
    });
  }
  for (const relation of sorted(assembly.relations)) {
    yield { kind: "work", units: 1 };
    add(
      "relation@1",
      { kind: "relation", cells: relation.cells, tuples: relation.tuples },
      [relation.premise],
      { constraintId: handles.get(relation.premise) },
    );
  }
  const scopeEntries = [
    ...problem.constraints,
    ...assembly.allDifferent,
    ...assembly.covers,
    ...assembly.relations,
  ].reduce((total, scope) => total + scope.cells.length, 0);
  const tupleEntries = assembly.relations.reduce(
    (total, relation) => total + relation.cells.length * relation.tuples.length,
    0,
  );
  return Object.freeze({
    nodes,
    proofBytes,
    workUnits: nodes * 16 + problem.cells.length * scopeEntries + tupleEntries,
    workspaceBytes: nodes * 64 + problem.cells.length * 32 + scopeEntries * 24 + tupleEntries * 8,
  });
}

/** Rebuild original roots and check each saved transaction; never call discovery. */
export function* replay(
  snapshot: SolverSnapshot,
  bundles: readonly DeductionProposal[],
  assembly: Assembly,
  limits: Limits,
): Generator<CheckEvent, void, void> {
  try {
    limits = { ...limits };
    requireProof(
      sameValue(
        Object.keys(limits).sort(),
        [
          "timeMs",
          "workUnits",
          "exactNodes",
          "stepNodes",
          "runNodes",
          "proofBytes",
          "stepBytes",
          "batchBytes",
          "inFlightBatches",
          "workspaceBytes",
        ].sort(),
      ),
      "invalid-proof-limit",
    );
    for (const value of Object.values(limits))
      requireProof(Number.isSafeInteger(value) && value >= 0, "invalid-proof-limit");
    requireProof(
      limits.stepNodes <= 16384 && Number.isSafeInteger(limits.timeMs) && limits.timeMs > 0,
      "invalid-proof-limit",
    );
    const deadline = performance.now() + limits.timeMs;
    let work = 0,
      headers = 0;
    const charge = (units: number) => {
      requireProof(performance.now() < deadline, "proof-time-limit");
      requireProof((work += units) <= limits.workUnits, "proof-work-limit");
    };
    charge(1);
    const estimating = initializationReservation(assembly);
    let next = estimating.next();
    while (!next.done) {
      charge(next.value.kind === "work" ? next.value.units : 0);
      yield next.value;
      next = estimating.next();
    }
    const startup = next.value;
    requireProof(startup.nodes <= limits.runNodes, "proof-run-node-limit");
    requireProof(
      startup.proofBytes <= limits.proofBytes &&
        startup.proofBytes + startup.workspaceBytes <= limits.workspaceBytes,
      "proof-byte-limit",
    );
    for (let remaining = startup.workUnits; remaining > 0; remaining -= 256) {
      const units = Math.min(remaining, 256);
      charge(units);
      yield { kind: "work", units };
    }
    requireProof(sameValue(snapshot.problem, assembly.problem), "replay-problem-mismatch");
    let view = initialize(assembly, "primary");
    requireProof(performance.now() < deadline, "proof-time-limit");
    for (const proposal of bundles) {
      let checked = false;
      const beforeWork = work;
      for (const event of checkProposal(proposal, {
        view,
        retained: retainedProof(view),
        policy: "discharged",
        uniqueEvidenceId: null,
        limits: {
          ...limits,
          timeMs: Math.max(0, Math.floor(deadline - performance.now())),
          workUnits: Math.max(0, limits.workUnits - work),
          proofBytes: Math.max(0, limits.proofBytes - headers),
          workspaceBytes: Math.max(0, limits.workspaceBytes - headers - startup.workspaceBytes),
        },
      })) {
        if (event.kind === "work") {
          work += event.units;
          yield event;
        } else if (event.kind === "rejected") {
          yield event;
          return;
        } else {
          requireProof(performance.now() < deadline, "proof-time-limit");
          work = beforeWork + checkedWorkUnits(event.step);
          headers += checkedHeaderBytes(event.step);
          view =
            event.step.proposal.effects.length > 0
              ? commitChecked(view, event.step).view
              : retainCheckedFacts(view, event.step);
          checked = true;
          yield event;
        }
      }
      requireProof(checked, "incomplete-replay-check");
    }
  } catch (error) {
    yield { kind: "rejected", code: error instanceof ProofError ? error.code : "malformed-replay" };
  }
}

/**
 * Fresh conditional replay takes an authenticated, prefix-ready operation. The
 * owner independently rechecks saved bundles; ordinary replay remains primary.
 * The caller retains/disposes this owner and binds transport identity before use.
 */
export function* replayConditional(
  operation: import("../conditional").ConditionalOperation,
  bundles: readonly DeductionProposal[],
): Generator<CheckEvent, void, void> {
  try {
    requireProof(isConditionalOperation(operation), "inauthentic-conditional-operation");
    requireProof(operation.active, "revoked-unique-authority");
    for (const proposal of bundles) {
      for (const event of operation.checkAndCommit(proposal)) {
        yield event;
        if (event.kind === "rejected") return;
      }
    }
  } catch (error) {
    yield {
      kind: "rejected",
      code: error instanceof ProofError ? error.code : "malformed-conditional-replay",
    };
  }
}
