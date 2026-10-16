import { describe, expect, test } from "vitest";
import {
  canonicalOptionsKey,
  DEFAULT_POLICY_PARAMETERS,
  POLICY_IDS,
  schedulingOptions,
  type PolicyId,
} from "../../../src/solver/scheduling/work";
import { SchedulingLedger } from "../../../src/solver/scheduling/ledger";
import { StepSelection } from "../../../src/solver/scheduling/select";
import { IndexWorkspace } from "../../../src/solver/indexes/workspace";
import { FairPolicy } from "../../../src/solver/scheduling/policy";
import {
  BOARD_FEATURE_SCHEMA,
  BOARD_FEATURE_NAMES,
} from "../../../src/solver/scheduling/features-board";
import {
  TechniqueEstimator,
  estimatorFor,
  constantEstimator,
} from "../../../src/solver/scheduling/estimator";
import { canonicalProblem } from "../../../src/solver/problem";
import { assemble } from "../../../src/solver/rules/assemble";
import { AllDifferentRule } from "../../../src/solver/rules/all-different";
import { initialize } from "../../../src/solver/state/candidates";
import type { TechniqueDescriptor } from "../../../src/solver/techniques/types";
import { solveClassic, type ClassicSolveEvent } from "../../../src/solver/classic-run";
import { PUZZLE } from "../../fixtures";

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
    canonicalProblem({
      schema: 1,
      cells: [0, 1, 2, 3],
      symbols: [1, 2],
      givens: [1, 0, 0, 0],
      constraints: [
        { id: "a", type: "all-different@1", cells: [0, 1], parameters: {} },
        { id: "b", type: "all-different@1", cells: [1, 2], parameters: {} },
      ],
    }),
    [new AllDifferentRule()],
  );
  if (!assembly.ok) throw Error("fixture");
  return initialize(assembly.value, "primary");
}

function descriptor(id: string, tier: number, cost = 1, hit = 1): TechniqueDescriptor {
  return {
    id,
    aliases: [],
    tier,
    requires: [],
    assumptionPolicy: "unconditional",
    bounds: {
      maxLength: 0,
      maxBranchDepth: 0,
      maxAlternatives: 0,
      maxPatternCells: 0,
      maxSetSize: 0,
    },
    watches: () => [{ kind: "all" }],
    eligible: () => ({ kind: "yes" }),
    estimate: () => ({ hit, gain: 1, cost }),
    *discover() {
      for (let i = 0; i < 100000; i++) yield { kind: "work", units: 1 };
      yield { kind: "exhausted" };
    },
  };
}

describe("scored policies (T12)", () => {
  test("policy ids, parameters and the canonical options key", () => {
    expect(POLICY_IDS).toContain("explain-fair@2");
    expect(POLICY_IDS).toContain("analyze-fair@2");
    const one = schedulingOptions({ limits });
    expect(one.policy).toBe("explain-fair@1");
    expect("policyParameters" in one).toBe(false);
    // @1 keys are byte-identical to M2: no parameter field is encoded.
    expect(canonicalOptionsKey(one)).not.toContain("policyParameters");
    const two = schedulingOptions({ limits, policy: "explain-fair@2" });
    expect(two.policyParameters).toEqual(DEFAULT_POLICY_PARAMETERS);
    const key = canonicalOptionsKey(two);
    expect(key).toContain('"policy":"explain-fair@2"');
    expect(key).toContain('"policyParameters"');
    for (const patch of [{ scoreFromTier: 2 }, { rotationEvery: 8 }, { decayShiftCap: 6 }])
      expect(
        canonicalOptionsKey(
          schedulingOptions({
            limits,
            policy: "explain-fair@2",
            policyParameters: { ...DEFAULT_POLICY_PARAMETERS, ...patch },
          }),
        ),
      ).not.toBe(key);
    expect(() => schedulingOptions({ limits, policy: "analyze-fair@2" })).toThrow(
      "policy-mode-mismatch",
    );
    expect(() =>
      schedulingOptions({ limits, policyParameters: DEFAULT_POLICY_PARAMETERS }),
    ).toThrow("policy-parameters-unscored");
    expect(() =>
      schedulingOptions({
        limits,
        policy: "explain-fair@2",
        policyParameters: { ...DEFAULT_POLICY_PARAMETERS, rotationEvery: 1 },
      }),
    ).toThrow("invalid-policy-parameters");
    expect(estimatorFor("explain-fair@1")).toBe(constantEstimator);
    expect(estimatorFor("analyze-fair@2")).toBeDefined();
  });

  test("Explain @2 keeps the canonical order below scoreFromTier and scores above it", () => {
    const view = fixture();
    const weights = BOARD_FEATURE_NAMES.map(() => 0);
    const model = new TechniqueEstimator({
      id: "test@1",
      featureSchema: BOARD_FEATURE_SCHEMA,
      corpusHash: "",
      trainerHash: "",
      families: {
        "low-b@1": { hit: { bias: 900 * 1024, weights }, cost: { bias: 1024, weights }, gain: 1 },
        "high-b@1": { hit: { bias: 900 * 1024, weights }, cost: { bias: 1024, weights }, gain: 1 },
      },
    });
    const jobs = [
      descriptor("low-a@1", 1, 1),
      descriptor("low-b@1", 1, 1),
      descriptor("high-a@1", 4, 1),
      descriptor("high-b@1", 4, 1),
    ];
    const ledger = new SchedulingLedger(view, { rules: [], techniques: jobs }, model);
    const policy = new FairPolicy("explain-fair@2", jobs, "explain", {
      ...DEFAULT_POLICY_PARAMETERS,
      scoreFromTier: 3,
    });
    // Tier 1 is below the gate: alphabetical canonical order, the model is ignored.
    expect(policy.next(ledger, view).technique).toBe("low-a@1");
    for (const low of ["low-a@1", "low-b@1"])
      ledger.status({ technique: low, scopeKey: "" }, "exhausted");
    // Tier 4 is scored: high-b's modelled hit (900) beats high-a's declared 1.
    expect(policy.next(ledger, view).technique).toBe("high-b@1");
    // A scored Analyze policy compares across tiers on the model: both modelled jobs
    // score 900/1 and the canonical tie-break prefers the lower tier, ahead of the
    // unmodelled tier-1 job that alphabetical order would have picked.
    const analyze = new FairPolicy("analyze-fair@2", jobs, "analyze");
    const fresh = new SchedulingLedger(view, { rules: [], techniques: jobs }, model);
    expect(analyze.next(fresh, view).technique).toBe("low-b@1");
    fresh.status({ technique: "low-b@1", scopeKey: "" }, "exhausted");
    expect(analyze.next(fresh, view).technique).toBe("high-b@1");
  });

  test("deterministic decay halves the effective hit per empty quantum and resets on advance", () => {
    const view = fixture();
    const jobs = [descriptor("hot@1", 4, 1, 512), descriptor("warm@1", 4, 1, 100)];
    const ledger = new SchedulingLedger(view, { rules: [], techniques: jobs });
    const policy = new FairPolicy("explain-fair@2", jobs, "explain", {
      scoreFromTier: 0,
      rotationEvery: 1000,
      decayShiftCap: 4,
    });
    expect(policy.next(ledger, view).technique).toBe("hot@1");
    const hot = { technique: "hot@1", scopeKey: "" };
    ledger.service(hot);
    ledger.noteEmptyQuantum(hot);
    ledger.service(hot);
    ledger.noteEmptyQuantum(hot);
    // 512 >> 2 = 128 still beats 100.
    expect(policy.next(ledger, view).technique).toBe("hot@1");
    ledger.service(hot);
    ledger.noteEmptyQuantum(hot);
    // 512 >> 3 = 64 loses to 100; the cap keeps it at >> 4 afterwards.
    expect(policy.next(ledger, view).technique).toBe("warm@1");
    for (let i = 0; i < 10; i++) {
      ledger.service(hot);
      ledger.noteEmptyQuantum(hot);
    }
    expect(ledger.job(hot).emptyQuanta).toBe(13);
    expect(policy.next(ledger, view).technique).toBe("warm@1");
    ledger.noteProposal(hot);
    expect(ledger.job(hot).emptyQuanta).toBe(0);
    expect(policy.next(ledger, view).technique).toBe("hot@1");
  });

  test("the rotation parameter serves the oldest job every k-th ticket", () => {
    const view = fixture();
    const jobs = Array.from({ length: 6 }, (_, i) =>
      descriptor(`job-${i}@1`, 4, 1, i === 0 ? 1000 : 1),
    );
    for (const rotationEvery of [2, 4, 8]) {
      const ledger = new SchedulingLedger(view, { rules: [], techniques: jobs });
      const policy = new FairPolicy("analyze-fair@2", jobs, "analyze", {
        ...DEFAULT_POLICY_PARAMETERS,
        rotationEvery,
        decayShiftCap: 0,
      });
      const served: string[] = [];
      for (let ticket = 1; ticket <= 40; ticket++) {
        const key = policy.next(ledger, view);
        ledger.service(key);
        served.push(key.technique);
      }
      const favourite = served.filter((id) => id === "job-0@1").length;
      // With decay off, the favourite takes every non-rotation ticket.
      expect(favourite).toBe(40 - Math.floor(40 / rotationEvery));
    }
  });

  test("Explain @2 is deterministic and reproduces @1 on a puzzle that never leaves tiers 0-2", async () => {
    const run = async (policy: PolicyId) => {
      const events: ClassicSolveEvent[] = [];
      await solveClassic(
        {
          givens: [...PUZZLE].map(Number),
          mode: "explain",
          policy,
          limits: { ...limits, timeMs: 600_000, workUnits: 40_000_000, exactNodes: 1_000_000 },
        },
        { clock: { now: () => Date.now() }, emit: (event) => events.push(event) },
      );
      return events
        .filter(
          (event): event is Extract<ClassicSolveEvent, { kind: "step" }> => event.kind === "step",
        )
        .map(
          (step) =>
            `${step.technique}:${step.effects.map((e) => `${e.kind[0]}${e.cell}${e.symbol}`).join("")}`,
        );
    };
    const one = await run("explain-fair@1");
    const two = await run("explain-fair@2");
    const twoAgain = await run("explain-fair@2");
    expect(one.length).toBeGreaterThan(0);
    // Metric F: this puzzle stays within tiers 0-2, so the scored policy changes nothing.
    expect(one.every((step) => !/c(0[7-9]|1[0-9]|2[0-9]|3[0-3])@1/.test(step))).toBe(true);
    expect(two).toEqual(one);
    expect(twoAgain).toEqual(two);
  }, 600_000);

  test("select() feeds the decay counters: an empty quantum decays the favourite until it yields", () => {
    const view = fixture();
    const jobs = [descriptor("hot@1", 4, 1, 512), descriptor("warm@1", 4, 1, 100)];
    const selection = new StepSelection(
      view,
      { rules: [], techniques: jobs },
      {
        ...schedulingOptions({
          limits,
          policy: "explain-fair@2",
          policyParameters: { scoreFromTier: 0, rotationEvery: 1000, decayShiftCap: 4 },
          phaseWorkUnits: 6 * 256,
        }),
        workspace: new IndexWorkspace({ entryLimit: 1000, byteLimit: 64_000_000 }),
        clock: { now: () => 0 },
      },
    );
    try {
      const events = [...selection.select()];
      expect(events.at(-1)?.kind).toBe("logical-stop");
      const hot = selection.ledger.job({ technique: "hot@1", scopeKey: "" });
      const warm = selection.ledger.job({ technique: "warm@1", scopeKey: "" });
      // 512 >> 3 = 64 < 100: three empty quanta hand the ticket to warm@1.
      expect(hot.emptyQuanta).toBeGreaterThanOrEqual(3);
      expect(warm.emptyQuanta).toBeGreaterThanOrEqual(1);
    } finally {
      selection.dispose();
    }
  });

  test("decay resets on a candidate-revision change, not on a same-revision proof addition", () => {
    const view = fixture();
    const jobs = [descriptor("hot@1", 4)];
    const ledger = new SchedulingLedger(view, { rules: [], techniques: jobs });
    const hot = { technique: "hot@1", scopeKey: "" };
    ledger.service(hot);
    ledger.noteEmptyQuantum(hot);
    const changes = {
      before: view.state.key,
      after: view.state.key,
      removed: [],
      placed: [],
      cells: [],
      coverIds: [],
      relationIds: [],
      sumIds: [],
      constraintIds: [],
      graphChanged: false,
      sourceChanged: true,
    };
    ledger.advance(view, changes);
    expect(ledger.job(hot).emptyQuanta).toBe(1);
    ledger.advance(view, { ...changes, removed: [{ cell: 1, symbol: 1, positive: false }] });
    expect(ledger.job(hot).emptyQuanta).toBe(0);
  });

  test("every policy id is deterministic: two runs give identical traces and results", async () => {
    const run = async (policy: PolicyId) => {
      const events: ClassicSolveEvent[] = [];
      await solveClassic(
        {
          givens: [...PUZZLE].map(Number),
          mode: policy.startsWith("analyze") ? "analyze" : "explain",
          policy,
          limits: { ...limits, timeMs: 600_000, workUnits: 40_000_000, exactNodes: 1_000_000 },
        },
        {
          clock: { now: () => 0 },
          emit: (event) => {
            if (event.kind !== "progress") events.push(event);
          },
        },
      );
      return JSON.stringify(events);
    };
    for (const policy of POLICY_IDS) expect(await run(policy)).toBe(await run(policy));
  }, 1_200_000);
});
