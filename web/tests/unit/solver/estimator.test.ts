import { describe, expect, test } from "vitest";
import { canonicalProblem, normalizeClassic } from "../../../src/solver/problem";
import { assemble } from "../../../src/solver/rules/assemble";
import { productionRules } from "../../../src/solver/rules/registry";
import { initialize } from "../../../src/solver/state/candidates";
import {
  BOARD_FEATURE_NAMES,
  BOARD_FEATURE_SCHEMA,
  boardFeatures,
} from "../../../src/solver/scheduling/features-board";
import {
  CONSTANT_MODEL,
  ESTIMATE_MAX,
  ESTIMATE_MIN,
  TechniqueEstimator,
  constantEstimator,
  validateModel,
} from "../../../src/solver/scheduling/estimator";
import { SchedulingLedger } from "../../../src/solver/scheduling/ledger";
import { getTechniques, assembleTechniqueJobs } from "../../../src/solver/techniques/registry";
import { preparedSources } from "../../../src/solver/state/source-index";
import { PUZZLE } from "../../fixtures";

function classicView(givens = PUZZLE) {
  const result = assemble(
    normalizeClassic({
      kind: "classic",
      version: 1,
      width: 9,
      height: 9,
      givens: [...givens].map(Number),
    }),
    productionRules(),
  );
  if (!result.ok) throw new Error("assembly");
  return initialize(result.value, "primary");
}

function killerView() {
  const result = assemble(
    canonicalProblem({
      schema: 1,
      cells: Array.from({ length: 6 }, (_, cell) => cell),
      symbols: Array.from({ length: 9 }, (_, index) => index + 1),
      givens: [0, 0, 0, 0, 0, 4],
      constraints: [
        { id: "k", type: "cage@1", cells: [0, 1, 2], parameters: { total: 6 } },
        { id: "t", type: "order@1", cells: [3, 4], parameters: {} },
        { id: "s", type: "all-different@1", cells: [4, 5], parameters: {} },
      ],
    }),
    productionRules(),
  );
  if (!result.ok) throw new Error("assembly");
  return initialize(result.value, "primary");
}

const index = (name: (typeof BOARD_FEATURE_NAMES)[number]) => BOARD_FEATURE_NAMES.indexOf(name);

describe("board features (T11)", () => {
  test("are integers in the fixed schema order and memoized per view", () => {
    const view = classicView();
    const features = boardFeatures(view);
    expect(features).toHaveLength(BOARD_FEATURE_NAMES.length);
    expect(features.every((value) => Number.isSafeInteger(value) && value >= 0)).toBe(true);
    expect(boardFeatures(view)).toBe(features);
    expect(Object.isFrozen(features)).toBe(true);
    expect(features[index("cells")]).toBe(81);
    expect(features[index("symbols")]).toBe(9);
    expect(features[index("scopes")]).toBe(27);
    expect(features[index("covers")]).toBe(243);
    expect(features[index("sums")]).toBe(27);
    expect(features[index("unsolvedCells")]).toBe([...PUZZLE].filter((c) => c === "0").length);
    expect(features[index("candidates")]).toBeGreaterThan(features[index("unsolvedCells")]);
    expect(features[index("liveRelationCells")]).toBe(0);
    const placed = [...PUZZLE].filter((c) => c !== "0");
    const leastPlaced = Math.min(
      ...Array.from({ length: 9 }, (_, i) => placed.filter((c) => c === String(i + 1)).length),
    );
    expect(features[index("maxPlacementsNeededPerSymbol")]).toBe(9 - leastPlaced);
    expect(features[index("maxThreeSupportCoversPerSymbol")]).toBeLessThanOrEqual(
      features[index("coversWithThreeSupports")],
    );
  });

  test("build no index: no workspace parameter and no prepared sources afterwards", () => {
    // boardFeatures takes no workspace, so it cannot lease one; it reads only
    // maintained supports and must not prepare the view's source index either.
    expect(boardFeatures.length).toBe(1);
    const first = classicView();
    const features = boardFeatures(first);
    expect(preparedSources(first)).toBeUndefined();
    boardFeatures(classicView());
    expect(boardFeatures(first)).toBe(features);
  });

  test("read sums and relations on a variant view", () => {
    const features = boardFeatures(killerView());
    expect(features[index("liveSums")]).toBe(1);
    expect(features[index("smallLiveSums")]).toBe(1);
    expect(features[index("sumSlack")]).toBeGreaterThan(0);
    expect(features[index("liveRelationCells")]).toBe(2);
    expect(features[index("alsScopes")]).toBe(0);
  });
});

describe("technique estimator (T11)", () => {
  test("the constant model returns every descriptor's declared estimate", () => {
    const view = classicView();
    for (const descriptor of getTechniques("classic-conditional@1"))
      expect(constantEstimator.estimate(descriptor.id, view, descriptor.estimate(view))).toEqual(
        descriptor.estimate(view),
      );
    expect(validateModel(CONSTANT_MODEL)).toEqual([]);
  });

  test("a trained family is evaluated in fixed point and clamped", () => {
    const weights = BOARD_FEATURE_NAMES.map(() => 0);
    weights[index("unsolvedCells")] = 1024; // hit = unsolved cells
    const model = {
      id: "test@1",
      featureSchema: BOARD_FEATURE_SCHEMA,
      corpusHash: "x",
      trainerHash: "y",
      families: {
        "c04@1": {
          hit: { bias: 0, weights },
          cost: { bias: 5_000_000, weights: weights.map(() => 0) },
          gain: 3,
        },
      },
    };
    const estimator = new TechniqueEstimator(model);
    const view = classicView();
    const unsolved = boardFeatures(view)[index("unsolvedCells")];
    expect(estimator.estimate("c04@1", view, { hit: 1, gain: 1, cost: 2 })).toEqual({
      hit: unsolved,
      gain: 3,
      cost: ESTIMATE_MAX,
    });
    expect(estimator.estimate("c05@1", view, { hit: 1, gain: 1, cost: 2 })).toEqual({
      hit: 1,
      gain: 1,
      cost: 2,
    });
    const negative = new TechniqueEstimator({
      ...model,
      families: {
        "c04@1": {
          ...model.families["c04@1"],
          hit: { bias: -4096, weights: weights.map(() => 0) },
        },
      },
    });
    expect(negative.estimate("c04@1", view, { hit: 1, gain: 1, cost: 2 }).hit).toBe(ESTIMATE_MIN);
    expect(validateModel({ ...model, featureSchema: "other" })).toContain(
      "feature-schema-mismatch",
    );
    expect(
      validateModel({ ...model, families: { "c04@1": { ...model.families["c04@1"], gain: 1.5 } } }),
    ).toContain("malformed-gain:c04@1");
    expect(() => new TechniqueEstimator({ ...model, featureSchema: "other" })).toThrow();
  });

  test("the ledger routes estimates through the estimator", () => {
    const view = classicView();
    const jobs = assembleTechniqueJobs(view.assembly, "classic-expanded@1");
    const plain = new SchedulingLedger(view, jobs);
    for (const job of plain.jobs)
      if (job.descriptor) expect(job.estimate).toEqual(job.descriptor.estimate(view));
    const weights = BOARD_FEATURE_NAMES.map(() => 0);
    const custom = new TechniqueEstimator({
      id: "test@1",
      featureSchema: BOARD_FEATURE_SCHEMA,
      corpusHash: "",
      trainerHash: "",
      families: {
        "c06@1": {
          hit: { bias: 700 * 1024, weights },
          cost: { bias: 9 * 1024, weights },
          gain: 11,
        },
      },
    });
    const wired = new SchedulingLedger(view, jobs, custom);
    const fish = wired.jobs.find((job) => job.key.technique === "c06@1")!;
    expect(fish.estimate).toEqual({ hit: 700, gain: 11, cost: 9 });
    const other = wired.jobs.find((job) => job.key.technique === "c04@1")!;
    expect(other.estimate).toEqual(other.descriptor!.estimate(view));
  });
});
