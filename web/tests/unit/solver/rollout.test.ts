import { describe, expect, test } from "vitest";
import { canonicalProblem } from "../../../src/solver/problem";
import { assemble } from "../../../src/solver/rules/assemble";
import { AllDifferentRule } from "../../../src/solver/rules/all-different";
import {
  initialize,
  HypotheticalSession,
  commitChecked,
  retainedProof,
} from "../../../src/solver/state/candidates";
import {
  checkProposal,
  checkedStepMatchesSource,
  checkUsage,
} from "../../../src/solver/proof/checker";
import { IndexWorkspace } from "../../../src/solver/indexes/workspace";
import { rolloutCandidates } from "../../../src/solver/scheduling/rollout";
import { WorkBudget } from "../../../src/solver/scheduling/work";
import { getTechniques } from "../../../src/solver/techniques/registry";
import type { CheckedStep } from "../../../src/solver/proof/types";
const limits = {
  timeMs: 10000,
  workUnits: 1000000,
  exactNodes: 10000,
  stepNodes: 4096,
  runNodes: 65536,
  proofBytes: 8000000,
  stepBytes: 1000000,
  batchBytes: 65536,
  inFlightBatches: 2,
  workspaceBytes: 64000000,
};
function fixture() {
  const assembly = assemble(
    canonicalProblem({ schema: 1, cells: [0, 1], symbols: [1], givens: [0, 0], constraints: [] }),
    [new AllDifferentRule()],
  );
  if (!assembly.ok) throw Error("fixture");
  const view = initialize(assembly.value, "primary");
  const workspace = new IndexWorkspace({ entryLimit: 100000, byteLimit: limits.workspaceBytes });
  const descriptor = getTechniques("classic-expanded@1")[0];
  const discovery = descriptor.discover(view, { workspace, limits });
  const proposals = [...discovery].filter((e) => e.kind === "proposal");
  const steps = proposals.map((e) => {
    const events = [
      ...checkProposal(e.proposal, {
        view,
        retained: retainedProof(view),
        limits,
        policy: "unconditional",
        uniqueEvidenceId: null,
      }),
    ];
    const last = events.at(-1);
    if (last?.kind !== "checked") throw Error(JSON.stringify(last));
    return last.step;
  });
  return { view, workspace, steps };
}
describe("confined checked-candidate rollout", () => {
  test("adoption authenticates exact source and releases all fork ownership", () => {
    const { view, workspace, steps } = fixture();
    let charged = 0;
    const before = workspace.usage;
    expect(checkedStepMatchesSource(steps[0], view)).toBe(true);
    const session = HypotheticalSession.fromChecked(
      view,
      steps[0],
      "rollout",
      workspace,
      (n) => (charged += n),
    );
    const fork = session.view;
    expect(fork.state.values[0]).toBe(1);
    expect(view.state.values[0]).toBe(0);
    expect(fork.state.key.branch).not.toBe(view.state.key.branch);
    expect(charged).toBeGreaterThan(0);
    expect(() => commitChecked(fork, steps[0])).toThrow();
    session.dispose();
    expect(workspace.usage).toEqual(before);
    expect(() => retainedProof(fork)).toThrow();
    expect(() =>
      HypotheticalSession.fromChecked(
        view,
        { ...steps[0] } as CheckedStep,
        "fake",
        workspace,
        () => {},
      ),
    ).toThrow();
    const sibling = initialize(view.assembly, "primary");
    expect(() =>
      HypotheticalSession.fromChecked(sibling, steps[0], "foreign", workspace, () => {}),
    ).toThrow();
    const advanced = commitChecked(view, steps[0]).view;
    expect(() =>
      HypotheticalSession.fromChecked(advanced, steps[0], "stale", workspace, () => {}),
    ).toThrow();
  });
  test("failed and prematurely closed checks expose actual nonfree work", () => {
    const { view, steps } = fixture();
    const proposal = steps[0].proposal;
    const checking = checkProposal(
      { ...proposal, technique: "wrong@1" },
      {
        view,
        retained: retainedProof(view),
        limits,
        policy: "unconditional",
        uniqueEvidenceId: null,
      },
    );
    expect([...checking].at(-1)?.kind).toBe("rejected");
    expect(checkUsage(checking).workUnits).toBeGreaterThan(0);
    const stopped = checkProposal(proposal, {
      view,
      retained: retainedProof(view),
      limits,
      policy: "unconditional",
      uniqueEvidenceId: null,
    });
    stopped.next();
    stopped.return();
    expect(checkUsage(stopped).workUnits).toBeGreaterThan(0);
  });
  test("equal confined shares include all work and leave primary unchanged", () => {
    const { view, workspace, steps } = fixture(),
      budget = new WorkBudget(100000);
    const before = view.state.key.revision,
      usage = workspace.usage;
    const events = [...rolloutCandidates(view, steps, { workspace, limits, budget })];
    const result = events.at(-1);
    expect(result?.kind).toBe("rollout");
    if (result?.kind !== "rollout") throw Error("no result");
    expect(result.primaryRevision).toBe(before);
    expect(view.state.values).toEqual([0, 0]);
    expect(result.usedWork).toBeLessThanOrEqual(8192);
    expect(result.shares.map((s) => s.allowance)).toEqual([4096, 4096]);
    expect(result.shares.every((s) => s.steps > 0)).toBe(true);
    expect(budget.used).toBe(result.usedWork);
    expect(workspace.usage).toEqual(usage);
  });
  test("zero allowance is explicitly incomplete and allocates no fork", () => {
    const { view, workspace, steps } = fixture(),
      budget = new WorkBudget(0),
      usage = workspace.usage;
    const events = [...rolloutCandidates(view, steps, { workspace, limits, budget })];
    const result = events.at(-1);
    if (result?.kind !== "rollout") throw Error("no result");
    expect(result.shares.every((s) => !s.complete && s.steps === 0)).toBe(true);
    expect(workspace.usage).toEqual(usage);
  });
  test("closing an active rollout releases the branch and partial preparation", () => {
    const { view, workspace, steps } = fixture(),
      budget = new WorkBudget(100000),
      usage = workspace.usage;
    const cursor = rolloutCandidates(view, steps, { workspace, limits, budget });
    expect(cursor.next().value?.kind).toBe("work");
    expect(workspace.usage.bytes).toBeGreaterThan(usage.bytes);
    cursor.return();
    expect(workspace.usage).toEqual(usage);
    expect(budget.used).toBeGreaterThan(0);
  });
});

import fixtures from "../../solver/fixtures/C22.json";
import { fixtureView, type TechniqueFixture } from "../../solver/acceptance";
import { independentForcing } from "../../solver/forcing-acceptance";
import { discoveryContext } from "../../solver/discovery-context";
import { uniqueHarness } from "../../solver/unique-harness";
import u01 from "../../solver/fixtures/U01.json";

test("an authentic advanced discharged first deduction keeps scoped intermediate facts confined", () => {
  const f = fixtures[0] as unknown as TechniqueFixture,
    view = fixtureView(f),
    proposal = independentForcing(f),
    context = discoveryContext();
  const checked = [
    ...checkProposal(proposal, {
      view,
      retained: retainedProof(view),
      limits: context.limits,
      policy: "discharged",
      uniqueEvidenceId: null,
    }),
  ].at(-1);
  if (checked?.kind !== "checked") throw Error(JSON.stringify(checked));
  expect(checked.step.proposal.proof.nodes.some((n) => n.scope.length > 0)).toBe(true);
  const session = HypotheticalSession.fromChecked(
    view,
    checked.step,
    "advanced",
    context.workspace,
    () => {},
  );
  try {
    expect(session.view.state.key.branch).not.toBe(view.state.key.branch);
    for (const node of checked.step.proposal.proof.nodes) {
      expect(retainedProof(session.view).get(node.id)).toBe(node);
      expect(session.view.facts.get(node.id)?.proposition).toEqual(node.conclusion);
    }
  } finally {
    session.dispose();
  }
  expect(context.workspace.usage.bytes).toBe(0);
}, 30000);

test("conditional and revoked operation sources cannot enter ordinary rollout", async () => {
  const h = uniqueHarness(u01.fixtures[0] as any);
  try {
    const view = h.operation.view;
    // Even an already valid primary step cannot launder a conditional origin.
    const ordinary = fixture();
    expect(() =>
      HypotheticalSession.fromChecked(
        view,
        ordinary.steps[0],
        "conditional",
        h.workspace,
        () => {},
      ),
    ).toThrow("rollout-primary-source-required");
    h.operation.dispose();
    expect(() =>
      HypotheticalSession.fromChecked(view, ordinary.steps[0], "revoked", h.workspace, () => {}),
    ).toThrow();
  } finally {
    h.operation.dispose();
  }
}, 30000);

import { normalizeClassic } from "../../../src/solver/problem";

test("classic primary rule deduction has a productive named cheap continuation inside8192 units", () => {
  const values = Array.from(
    { length: 81 },
    (_, c) => ((Math.floor(c / 9) * 3 + Math.floor(c / 27) + (c % 9)) % 9) + 1,
  );
  values[0] = 0;
  values[40] = 0;
  const assembly = assemble(
    normalizeClassic({ kind: "classic", version: 1, width: 9, height: 9, givens: values }),
    [new AllDifferentRule()],
  );
  if (!assembly.ok) throw Error("classic");
  const view = initialize(assembly.value, "primary"),
    w = new IndexWorkspace({ entryLimit: 1000000, byteLimit: limits.workspaceBytes });
  let first: CheckedStep | undefined;
  for (const rule of view.assembly.problem.constraints) {
    for (const event of view.assembly.modules.get(rule.id)!.propagate(view, rule))
      if (event.kind === "proposal") {
        const checked = [
          ...checkProposal(event.proposal, {
            view,
            retained: retainedProof(view),
            policy: "unconditional",
            uniqueEvidenceId: null,
            limits,
          }),
        ].at(-1);
        if (checked?.kind === "checked") {
          first = checked.step;
          break;
        }
      }
    if (first) break;
  }
  if (!first) throw Error("missing primary rule deduction");
  const events = [
      ...rolloutCandidates(view, [first], { workspace: w, limits, budget: new WorkBudget(100000) }),
    ],
    result = events.at(-1);
  if (result?.kind !== "rollout") throw Error("missing rollout");
  expect(result.shares[0].steps, JSON.stringify(result.shares)).toBeGreaterThan(0);
  expect(result.usedWork).toBeLessThanOrEqual(8192);
  expect(view.state.values).toEqual(values);
  expect(w.usage.bytes).toBe(0);
}, 30000);

test("work reservations settle measured cost once and release only unused held capacity", () => {
  const budget = new WorkBudget(100),
    reservation = budget.reserve(80);
  expect(budget.remaining()).toBe(20);
  expect(budget.spend(21)).toBe(false);
  expect(budget.used).toBe(0);
  expect(() => reservation.settle(81)).toThrow("work-reservation-overflow");
  reservation.settle(12);
  expect(budget.used).toBe(12);
  expect(budget.remaining()).toBe(88);
  expect(() => reservation.settle(0)).toThrow("settled-work-reservation");
  reservation.dispose();
  expect(budget.used).toBe(12);
  const abandoned = budget.reserve(80);
  abandoned.dispose();
  expect(budget.remaining()).toBe(88);
});
