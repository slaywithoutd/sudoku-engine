import { describe, expect, test } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  CLASSIC_SOLVE_LIMITS,
  solveClassic,
  type ClassicSolveEvent,
} from "../../../src/solver/classic-run";
import { IndexWorkspace } from "../../../src/solver/indexes/workspace";
import { normalizeClassic } from "../../../src/solver/problem";
import { assemble } from "../../../src/solver/rules/assemble";
import { productionRules } from "../../../src/solver/rules/registry";
import { StepSelection } from "../../../src/solver/scheduling/select";
import {
  canonicalOptionsKey,
  schedulingOptions,
  type PolicyId,
} from "../../../src/solver/scheduling/work";
import {
  commitChecked,
  initialize,
  retainCheckedFacts,
} from "../../../src/solver/state/candidates";
import { coverageEntries, variantEntries } from "../../../src/solver/techniques/manifest";
import { PROFILES } from "../../../src/solver/techniques/profiles";
import { assembleTechniqueJobs, getTechniques } from "../../../src/solver/techniques/registry";
import {
  lowestTierOff,
  profileRowIds,
  resolveTechniqueSet,
  TECHNIQUE_PRESETS,
  TECHNIQUE_ROWS,
  type TechniqueSelection,
} from "../../../src/solver/techniques/technique-sets";
import evalCorpus from "../../solver/bench/eval-corpus.json";

/**
 * M2.7 S2 (D105): technique sets, by the test plan of
 * docs/specs/2026-11-10-technique-set-semantics.md §6 (tables 1–3 here;
 * table 4 in technique-sets-corpus.test.ts; table 5 in the settings and
 * backup tests). Every run is cut by work units under a constant clock, so
 * no assertion depends on wall time.
 */

// Table 1.1: the ten default keys, recorded from `master` at 77856f7 (the
// M2.7 approval merge, engine identical to the M2.6 merge 846267e) before any
// S2 edit, with CLASSIC_SOLVE_LIMITS.
const DEFAULT_KEYS: Readonly<Record<string, string>> = {
  "explain-fair@1 explain":
    '{"limits":{"batchBytes":65536,"exactNodes":1000000,"inFlightBatches":2,"proofBytes":8000000,"runNodes":65536,"stepBytes":2000000,"stepNodes":4096,"timeMs":60000,"workUnits":7200000,"workspaceBytes":64000000},"mode":"explain","phaseTimeMs":60000,"phaseWorkUnits":7200000,"policy":"explain-fair@1","profile":"classic-expanded@1","rollout":false}',
  "explain-fair@2 explain":
    '{"limits":{"batchBytes":65536,"exactNodes":1000000,"inFlightBatches":2,"proofBytes":8000000,"runNodes":65536,"stepBytes":2000000,"stepNodes":4096,"timeMs":60000,"workUnits":7200000,"workspaceBytes":64000000},"mode":"explain","phaseTimeMs":60000,"phaseWorkUnits":7200000,"policy":"explain-fair@2","policyParameters":{"decayShiftCap":4,"rotationEvery":4,"scoreFromTier":3},"profile":"classic-expanded@1","rollout":false}',
  "explain-fair@3 explain":
    '{"limits":{"batchBytes":65536,"exactNodes":1000000,"inFlightBatches":2,"proofBytes":8000000,"runNodes":65536,"stepBytes":2000000,"stepNodes":4096,"timeMs":60000,"workUnits":7200000,"workspaceBytes":64000000},"mode":"explain","phaseTimeMs":60000,"phaseWorkUnits":7200000,"policy":"explain-fair@3","profile":"classic-expanded@1","rollout":false,"tierCap":{"fromTier":3,"unitsPerJobPerState":100000}}',
  "analyze-fair@1 analyze":
    '{"limits":{"batchBytes":65536,"exactNodes":1000000,"inFlightBatches":2,"proofBytes":8000000,"runNodes":65536,"stepBytes":2000000,"stepNodes":4096,"timeMs":60000,"workUnits":7200000,"workspaceBytes":64000000},"mode":"analyze","phaseTimeMs":60000,"phaseWorkUnits":7200000,"policy":"analyze-fair@1","profile":"classic-expanded@1","rollout":false}',
  "analyze-fair@2 analyze":
    '{"limits":{"batchBytes":65536,"exactNodes":1000000,"inFlightBatches":2,"proofBytes":8000000,"runNodes":65536,"stepBytes":2000000,"stepNodes":4096,"timeMs":60000,"workUnits":7200000,"workspaceBytes":64000000},"mode":"analyze","phaseTimeMs":60000,"phaseWorkUnits":7200000,"policy":"analyze-fair@2","policyParameters":{"decayShiftCap":4,"rotationEvery":4,"scoreFromTier":3},"profile":"classic-expanded@1","rollout":false}',
  "analyze-fair@3 analyze":
    '{"limits":{"batchBytes":65536,"exactNodes":1000000,"inFlightBatches":2,"proofBytes":8000000,"runNodes":65536,"stepBytes":2000000,"stepNodes":4096,"timeMs":60000,"workUnits":7200000,"workspaceBytes":64000000},"mode":"analyze","phaseTimeMs":60000,"phaseWorkUnits":7200000,"policy":"analyze-fair@3","profile":"classic-expanded@1","rollout":false}',
  "fixed-scan@1 explain":
    '{"limits":{"batchBytes":65536,"exactNodes":1000000,"inFlightBatches":2,"proofBytes":8000000,"runNodes":65536,"stepBytes":2000000,"stepNodes":4096,"timeMs":60000,"workUnits":7200000,"workspaceBytes":64000000},"mode":"explain","phaseTimeMs":60000,"phaseWorkUnits":7200000,"policy":"fixed-scan@1","profile":"classic-expanded@1","rollout":false}',
  "fixed-scan@1 analyze":
    '{"limits":{"batchBytes":65536,"exactNodes":1000000,"inFlightBatches":2,"proofBytes":8000000,"runNodes":65536,"stepBytes":2000000,"stepNodes":4096,"timeMs":60000,"workUnits":7200000,"workspaceBytes":64000000},"mode":"analyze","phaseTimeMs":60000,"phaseWorkUnits":7200000,"policy":"fixed-scan@1","profile":"classic-expanded@1","rollout":false}',
  "event-fixed@1 explain":
    '{"limits":{"batchBytes":65536,"exactNodes":1000000,"inFlightBatches":2,"proofBytes":8000000,"runNodes":65536,"stepBytes":2000000,"stepNodes":4096,"timeMs":60000,"workUnits":7200000,"workspaceBytes":64000000},"mode":"explain","phaseTimeMs":60000,"phaseWorkUnits":7200000,"policy":"event-fixed@1","profile":"classic-expanded@1","rollout":false}',
  "event-fixed@1 analyze":
    '{"limits":{"batchBytes":65536,"exactNodes":1000000,"inFlightBatches":2,"proofBytes":8000000,"runNodes":65536,"stepBytes":2000000,"stepNodes":4096,"timeMs":60000,"workUnits":7200000,"workspaceBytes":64000000},"mode":"analyze","phaseTimeMs":60000,"phaseWorkUnits":7200000,"policy":"event-fixed@1","profile":"classic-expanded@1","rollout":false}',
};

const POLICY_MODES: readonly (readonly [PolicyId, "explain" | "analyze"])[] = [
  ["explain-fair@1", "explain"],
  ["explain-fair@2", "explain"],
  ["explain-fair@3", "explain"],
  ["analyze-fair@1", "analyze"],
  ["analyze-fair@2", "analyze"],
  ["analyze-fair@3", "analyze"],
  ["fixed-scan@1", "explain"],
  ["fixed-scan@1", "analyze"],
  ["event-fixed@1", "explain"],
  ["event-fixed@1", "analyze"],
];
const limits = CLASSIC_SOLVE_LIMITS;
const CLASSIC = "classic-expanded@1" as const;
const FULL = profileRowIds(CLASSIC);
const tiers = new Map(
  [...coverageEntries, ...variantEntries].map((entry) => [entry.version, entry.tier] as const),
);
const rowOf = new Map(
  [...coverageEntries, ...variantEntries].map((entry) => [entry.version, entry.id] as const),
);
const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => `C${String(from + i).padStart(2, "0")}`);
const offAllBut = (on: readonly string[]): TechniqueSelection => ({
  off: FULL.filter((id) => !on.includes(id)),
});
const puzzle = (id: string) => {
  const entry = evalCorpus.cases.find((candidate) => candidate.id === id);
  if (!entry) throw new Error(id);
  return entry.puzzle;
};
/**
 * The proposal's §2 stall puzzle (docs/specs/2026-10-22-technique-selection-and-solve-views.md)
 * is AI Escargot, the corpus case `escargot` (stall-case.test.ts pins this).
 */
const STALL = puzzle("escargot");
const assembled = (givens: string) => {
  const problem = normalizeClassic({
    kind: "classic",
    version: 1,
    width: 9,
    height: 9,
    givens: [...givens].map(Number),
  });
  const result = assemble(problem, productionRules());
  if (!result.ok) throw new Error("assembly");
  return result.value;
};

describe("table 1: identity of the default set", () => {
  test("1.1 the ten default keys are byte-identical to master", () => {
    for (const [policy, mode] of POLICY_MODES)
      expect(canonicalOptionsKey(schedulingOptions({ limits, mode, policy }))).toBe(
        DEFAULT_KEYS[`${policy} ${mode}`],
      );
  });
  test("1.2 the full list, in any order, is the default key", () => {
    const shuffled = [...FULL].sort(
      (a, b) => ((a.charCodeAt(2) * 7) % 11) - ((b.charCodeAt(2) * 7) % 11),
    );
    for (const [policy, mode] of POLICY_MODES)
      for (const techniques of [FULL, [...FULL].reverse(), shuffled]) {
        const options = schedulingOptions({ limits, mode, policy, techniques });
        expect("techniques" in options).toBe(false);
        const key = canonicalOptionsKey(options);
        expect(key).toBe(DEFAULT_KEYS[`${policy} ${mode}`]);
        expect(key).not.toContain("techniques");
      }
  });
  test("1.6 assembleTechniqueJobs with no set and with the full set", () => {
    const assembly = assembled(puzzle("easy"));
    const none = assembleTechniqueJobs(assembly, CLASSIC).techniques,
      full = assembleTechniqueJobs(assembly, CLASSIC, FULL).techniques;
    expect(full.length).toBe(none.length);
    full.forEach((descriptor, i) => expect(descriptor).toBe(none[i]));
  });
  test("1.5 a run with no selection and a run with all@1 emit identical events", async () => {
    for (const id of ["easy", "escargot"]) {
      const plain = await run(puzzle(id), undefined, 400_000),
        all = await run(puzzle(id), { preset: "all@1" }, 400_000);
      expect(all.events).toEqual(plain.events);
      expect("techniqueSet" in plain.result).toBe(false);
      expect(plain.steps.some((step) => "setLimited" in step)).toBe(false);
    }
  });
});

describe("rows and presets", () => {
  test("the row table is the manifest's: ids, tiers, order and profile membership", () => {
    const manifest = [...coverageEntries, ...variantEntries];
    expect(TECHNIQUE_ROWS.map((row) => [row.id, row.tier])).toEqual(
      manifest.map((entry) => [entry.id, entry.tier]),
    );
    for (const profile of PROFILES)
      expect(profileRowIds(profile)).toEqual(
        getTechniques(profile).map((descriptor) => rowOf.get(descriptor.id)),
      );
    expect(new Set(TECHNIQUE_ROWS.map((row) => row.label)).size).toBe(TECHNIQUE_ROWS.length);
  });
  test("2.1 each preset resolved on classic-expanded@1 is the pinned list", () => {
    const pinned: Record<string, readonly string[]> = {
      "all@1": range(1, 33),
      "singles@1": ["C01", "C02"],
      "up-to-subsets@1": range(1, 5),
      "up-to-wings-fish@1": [...range(1, 6), "C10", "C11", "C13"],
      "no-fish@1": range(1, 33).filter((id) => !["C06", "C07", "C08", "C09", "C24"].includes(id)),
    };
    expect(TECHNIQUE_PRESETS.map((preset) => preset.id)).toEqual(Object.keys(pinned));
    for (const preset of TECHNIQUE_PRESETS)
      expect(resolveTechniqueSet(CLASSIC, { preset: preset.id })).toEqual(pinned[preset.id]);
    expect(resolveTechniqueSet(CLASSIC, { preset: "no-fish@1" })).toHaveLength(28);
  });
  test("2.9 a switched-off U row is ignored on classic-expanded@1; unknown ids are not", () => {
    expect(resolveTechniqueSet(CLASSIC, { off: ["U01"] })).toEqual(FULL);
    expect(resolveTechniqueSet(CLASSIC, undefined)).toBeUndefined();
    for (const [selection, code] of [
      [{ off: ["X99"] }, "unknown-technique"],
      [{ off: "C01" }, "invalid-technique-set"],
      [{ off: [1] }, "invalid-technique-set"],
      [{ off: ["C01", "C01"] }, "invalid-technique-set"],
      [{ preset: "nope@1" }, "invalid-technique-set"],
      [{ preset: "all@1", off: [] }, "invalid-technique-set"],
      ["all@1", "invalid-technique-set"],
      [null, "invalid-technique-set"],
      [[], "invalid-technique-set"],
    ] as const)
      expect(() => resolveTechniqueSet(CLASSIC, selection), JSON.stringify(selection)).toThrow(
        code,
      );
  });
});

describe("table 2: key and validation for restricted sets", () => {
  const key = (techniques: unknown, extra: Record<string, unknown> = {}) =>
    canonicalOptionsKey(
      schedulingOptions({
        limits,
        policy: "explain-fair@3",
        techniques: techniques as readonly string[],
        ...extra,
      }),
    );
  test("2.2 order does not matter; 2.3 different sets differ; 2.4 a custom set equal to a preset", () => {
    expect(key(["C02", "C01"])).toBe(key(["C01", "C02"]));
    expect(key(["C01", "C02"])).toContain('"techniques":["C01","C02"]');
    // RunKey.optionsKey differs, so sameRun (evidence.ts) keeps the runs apart.
    expect(key(["C01", "C02"])).not.toBe(key(["C01", "C02", "C03"]));
    expect(key(resolveTechniqueSet(CLASSIC, { off: range(3, 33) }))).toBe(
      key(resolveTechniqueSet(CLASSIC, { preset: "singles@1" })),
    );
  });
  test("2.5 malformed lists and 2.5b unknown ids are rejected", () => {
    for (const bad of [["C01", "C01"], "C01", [1]])
      expect(() => key(bad)).toThrow("invalid-technique-set");
    for (const bad of [["X99"], ["U01"]]) expect(() => key(bad)).toThrow("unknown-technique");
    // U01 is a row of the conditional profile.
    expect(() =>
      schedulingOptions({ limits, profile: "classic-conditional@1", techniques: ["U01"] }),
    ).not.toThrow();
  });
  test("2.6 the empty set is kept; 2.7 rollout needs the full set", () => {
    expect(key([])).toContain('"techniques":[]');
    expect(() =>
      schedulingOptions({ limits, mode: "analyze", rollout: true, techniques: ["C01"] }),
    ).toThrow("rollout-requires-full-set");
    expect(() =>
      schedulingOptions({ limits, mode: "analyze", rollout: true, techniques: FULL }),
    ).not.toThrow();
  });
  test("2.8 the field sits between rollout and tierCap", () => {
    expect(key(["C01", "C02"])).toBe(
      DEFAULT_KEYS["explain-fair@3 explain"].replace(
        '"rollout":false,',
        '"rollout":false,"techniques":["C01","C02"],',
      ),
    );
  });
  test("lowestTierOff", () => {
    expect(lowestTierOff(CLASSIC, undefined)).toBeUndefined();
    expect(lowestTierOff(CLASSIC, resolveTechniqueSet(CLASSIC, { preset: "no-fish@1" }))).toBe(2);
    expect(lowestTierOff(CLASSIC, ["C01", "C02"])).toBe(0);
  });
});

type Step = Extract<ClassicSolveEvent, { kind: "step" }>;
type Result = Extract<ClassicSolveEvent, { kind: "result" }>;
async function run(
  givens: string,
  techniqueSelection: TechniqueSelection | undefined,
  workUnits: number,
  policy: PolicyId = "explain-fair@3",
) {
  const events: ClassicSolveEvent[] = [];
  await solveClassic(
    {
      givens: [...givens].map(Number),
      mode: "explain",
      policy,
      limits: { ...CLASSIC_SOLVE_LIMITS, timeMs: 3_600_000, workUnits },
      ...(techniqueSelection ? { techniqueSelection } : {}),
    },
    { clock: { now: () => 0 }, emit: (event) => events.push(event) },
  );
  const result = events.at(-1);
  if (result?.kind !== "result") throw new Error("no result");
  return {
    events: events.filter((event) => event.kind !== "progress"),
    result,
    steps: events.filter((event): event is Step => event.kind === "step"),
  };
}

const consistent: Record<Result["stopReason"], readonly Result["human"][]> = {
  "not-started": ["not-started"],
  solved: ["solved"],
  contradiction: ["contradiction", "invalidated"],
  "profile-stall": ["stalled-within-profile"],
  "tier-cap": ["stalled-within-profile", "incomplete"],
  "lower-interrupted": ["incomplete"],
  "work-limit": ["incomplete"],
  "time-limit": ["incomplete"],
};
const SETS: Record<string, TechniqueSelection> = {
  ...Object.fromEntries(TECHNIQUE_PRESETS.map((preset) => [preset.id, { preset: preset.id }])),
  empty: { off: [...FULL] },
  "C01,C02,C22": offAllBut(["C01", "C02", "C22"]),
  "no tier 3": { off: ["C14", "C15"] },
  // A gap at tier 0: every step from tier 1 up is set-limited (seventeen takes some).
  "no hidden single": { off: ["C02"] },
};
const CASES: Record<string, string> = {
  ...Object.fromEntries(
    ["easy", "hidden-singles", "seventeen", "escargot", "inkala-2012", "golden-nugget"].map(
      (id) => [id, puzzle(id)],
    ),
  ),
};
// The singles cases need about 650k logical units on any set that holds C01
// and C02 (Easy: 78 steps), so they get 1.2M; the hard cases end on a 600k
// cut, which leaves the logical phase enough after the count and the basic
// eliminations (about 200k) to stall a prefix set and to reach tier 6.
const SINGLES_CASES = ["easy", "hidden-singles", "seventeen"];
const unitsFor = (caseId: string) => (SINGLES_CASES.includes(caseId) ? 1_200_000 : 600_000);
const nameOf = new Map(
  [...coverageEntries, ...variantEntries].map(
    (entry) => [entry.id, entry.aliases[0] ?? entry.id] as const,
  ),
);

/**
 * Named outcomes, recorded once and pinned (S1 note §6): regenerate
 * deliberately with TECHNIQUE_OUTCOMES=write; a diff must be explained.
 */
const outcomesPath = fileURLToPath(
  new URL("../../solver/fixtures/technique-set-outcomes.json", import.meta.url),
);
const writing = process.env.TECHNIQUE_OUTCOMES === "write";
interface Outcome {
  readonly human: string;
  readonly stopReason: string;
  readonly steps: number;
  readonly setLimitedSteps: number;
  readonly highestTierTried: number;
}
const pinned: Record<string, Outcome> = writing
  ? {}
  : (JSON.parse(readFileSync(outcomesPath, "utf8")) as Record<string, Outcome>);
const recorded: Record<string, Outcome> = {};

/** S1 note §6 table 3, assertions 3.1–3.4, 3.7 and 3.8, for one set on every case. */
async function checkSet(policy: PolicyId, setName: string, selection: TechniqueSelection) {
  const enabled = new Set(resolveTechniqueSet(CLASSIC, selection));
  const lowest = lowestTierOff(CLASSIC, [...enabled]);
  for (const [caseId, givens] of Object.entries(CASES)) {
    const label = `${policy} ${setName} on ${caseId}`;
    const first = await run(givens, selection, unitsFor(caseId), policy),
      { result, steps } = first;
    // 3.1
    expect(consistent[result.stopReason], label).toContain(result.human);
    expect(result.outcome, label).not.toBe("error");
    // 3.2
    for (const step of steps)
      expect(
        step.technique.startsWith("rule-") || enabled.has(rowOf.get(step.technique) ?? ""),
        `${label}: ${step.technique}`,
      ).toBe(true);
    // 3.3 the coverage lists and notSelected partition the profile's rows.
    const { exhausted, capped, notStarted } = result.coverage;
    const notSelected = result.techniqueSet?.notSelected ?? [];
    const listed = [...exhausted, ...capped, ...notStarted, ...notSelected];
    expect(new Set(listed).size, label).toBe(listed.length);
    expect(new Set(listed), label).toEqual(new Set(FULL.map((id) => nameOf.get(id))));
    expect(new Set(notSelected), label).toEqual(
      new Set(FULL.filter((id) => !enabled.has(id)).map((id) => nameOf.get(id))),
    );
    // 3.4
    if (result.human === "stalled-within-profile") {
      expect(capped, label).toEqual([]);
      expect(notStarted, label).toEqual([]);
    }
    // 3.7
    for (const step of steps) {
      const tier = tiers.get(step.technique) ?? -1;
      expect(step.setLimited === true, `${label}: step ${step.index}`).toBe(
        lowest !== undefined && tier > lowest,
      );
    }
    const setLimitedSteps = steps.filter((step) => step.setLimited).length;
    if (enabled.size === FULL.length) expect(result.techniqueSet, label).toBeUndefined();
    else {
      expect(result.techniqueSet?.enabled, label).toEqual([...enabled].sort());
      expect(result.techniqueSet?.lowestTierNotSelected, label).toBe(lowest);
      expect(result.techniqueSet?.setLimitedSteps, label).toBe(setLimitedSteps);
    }
    if (["singles@1", "up-to-subsets@1", "up-to-wings-fish@1"].includes(setName))
      expect(setLimitedSteps, label).toBe(0);
    // 3.8
    expect((await run(givens, selection, unitsFor(caseId), policy)).events, label).toEqual(
      first.events,
    );
    // Named outcomes of the S1 note §6, then the pinned record of every pair.
    if (setName === "singles@1" && SINGLES_CASES.includes(caseId))
      expect(result.human, label).toBe("solved");
    if (setName === "empty" && result.human !== "solved") {
      expect(result.human, label).toBe("stalled-within-profile");
      expect(result.coverage.highestTierTried, label).toBe(-1);
      expect(
        steps.every((step) => step.technique.startsWith("rule-")),
        label,
      ).toBe(true);
    }
    if (setName === "up-to-subsets@1" && caseId === "escargot")
      expect(`${result.human}/${result.stopReason}`, label).toBe(
        "stalled-within-profile/profile-stall",
      );
    if (setName === "C01,C02,C22" && caseId === "escargot")
      expect(result.coverage.highestTierTried, label).toBe(6);
    const outcome: Outcome = {
      human: result.human,
      stopReason: result.stopReason,
      steps: result.steps,
      setLimitedSteps,
      highestTierTried: result.coverage.highestTierTried,
    };
    recorded[label] = outcome;
    if (!writing) expect(outcome, label).toEqual(pinned[label]);
  }
}

describe("table 3: each set terminates with a status consistent with its set", () => {
  for (const [setName, selection] of Object.entries(SETS))
    test(`${setName} under explain-fair@3`, () => checkSet("explain-fair@3", setName, selection));
  for (const preset of TECHNIQUE_PRESETS)
    test(`${preset.id} under explain-fair@1`, () =>
      checkSet("explain-fair@1", preset.id, { preset: preset.id }));
  test("the pinned record is complete, and gap sets do mark set-limited steps", () => {
    if (writing) writeFileSync(outcomesPath, JSON.stringify(recorded, null, 2) + "\n");
    else expect(Object.keys(recorded).sort()).toEqual(Object.keys(pinned).sort());
    // 3.7 is not vacuous: some step of a gap set is set-limited.
    const gapLimited = Object.entries(recorded)
      .filter(([label]) => /no-fish@1|no tier 3|no hidden single|C01,C02,C22/.test(label))
      .reduce((sum, [, outcome]) => sum + outcome.setLimitedSteps, 0);
    expect(gapLimited).toBeGreaterThan(0);
  });
});

/** Drives the selection directly, as policies-v3.test.ts does (3.5, 3.6). */
function selectionSteps(
  givens: string,
  enabled: readonly string[],
  policy: PolicyId,
  units: number,
) {
  const assembly = assembled(givens);
  let view = initialize(assembly, "primary");
  const selectionLimits = { ...CLASSIC_SOLVE_LIMITS, timeMs: 3_600_000, workUnits: units };
  const options = schedulingOptions({
    limits: selectionLimits,
    mode: "explain",
    policy,
    techniques: enabled,
  });
  const selection = new StepSelection(
    view,
    assembleTechniqueJobs(assembly, CLASSIC, options.techniques),
    {
      ...options,
      workspace: new IndexWorkspace({
        entryLimit: 100_000,
        byteLimit: selectionLimits.workspaceBytes,
      }),
      clock: { now: () => 0 },
    },
  );
  const off = new Set(
    FULL.filter((id) => !enabled.includes(id)).map(
      (id) => coverageEntries.find((entry) => entry.id === id)?.version,
    ),
  );
  let claims = 0;
  let stop: string | undefined;
  try {
    for (let n = 0; n < 200 && stop === undefined; n++) {
      let checked: { step: Parameters<typeof commitChecked>[1]; claim: boolean } | undefined;
      for (const event of selection.select()) {
        if (event.kind === "checked-step")
          checked = { step: event.step, claim: event.canClaimSimplerExhausted };
        if (event.kind === "logical-stop") {
          stop = event.reason;
          // 3.5: a gap never stops the climb; only an interrupted or disabled
          // enabled job (or rule job) does.
          if (stop === "incomplete-cheaper-tier") {
            // Explain serves the lowest active tier: that is the job the gate blocked.
            const blocked = Math.min(...selection.ledger.active.map((job) => job.tier));
            expect(
              selection.ledger.jobs.some(
                (job) =>
                  job.tier < blocked && (job.status === "interrupted" || job.status === "disabled"),
              ),
            ).toBe(true);
          }
        }
      }
      // No ledger row names a switched-off technique.
      expect(selection.ledger.jobs.some((job) => off.has(job.descriptor?.id))).toBe(false);
      if (!checked) break;
      const tier = tiers.get(checked.step.proposal.technique) ?? -1;
      // 3.6, independently of the ledger helpers.
      const unsettled = selection.ledger.jobs.some(
        (job) => job.tier < tier && job.status !== "exhausted" && job.status !== "excluded",
      );
      expect(checked.claim).toBe(!unsettled);
      if (checked.claim) claims++;
      view =
        checked.step.proposal.effects.length > 0
          ? commitChecked(view, checked.step).view
          : retainCheckedFacts(view, checked.step);
      selection.advance(view);
    }
  } finally {
    selection.dispose();
  }
  return { claims, stop };
}

describe("table 3 at the selection level", () => {
  test("3.5 and 3.6 on gap sets: claims hold within the set; a gap never stops the climb", () => {
    const gap = ["C01", "C02", "C22"];
    const climbed = selectionSteps(puzzle("escargot"), gap, "explain-fair@3", 600_000);
    expect(climbed.stop).not.toBe("incomplete-cheaper-tier");
    expect(climbed.claims).toBeGreaterThan(0);
    const noFish = resolveTechniqueSet(CLASSIC, { preset: "no-fish@1" }) ?? [];
    expect(
      selectionSteps(puzzle("golden-nugget"), noFish, "explain-fair@3", 600_000).stop,
    ).not.toBe("incomplete-cheaper-tier");
  });
  test("3.5 an interrupted enabled lower job still stops @1 (the S1 check 1 case)", () => {
    // C33 is interrupted by its fixed tuple bound on the stall puzzle; under
    // @1 that blocks the tier-6 job above it, whatever the set.
    const heavy = ["C01", "C02", "C03", ...range(22, 28), "C33"];
    expect(selectionSteps(STALL, heavy, "explain-fair@1", 7_200_000).stop).toBe(
      "incomplete-cheaper-tier",
    );
  });
});

describe("table 5.5: a malformed selection never runs the full set", () => {
  test.each<[unknown, string]>([
    [{ off: "C01" }, "invalid-technique-set"],
    [{ off: [1] }, "invalid-technique-set"],
    [{ off: ["C01", "C01"] }, "invalid-technique-set"],
    [{ off: ["X99"] }, "unknown-technique"],
    [{ preset: "nope@1" }, "invalid-technique-set"],
    [{ preset: "all@1", off: [] }, "invalid-technique-set"],
    ["singles@1", "invalid-technique-set"],
    [null, "invalid-technique-set"],
  ])("%j ends with an error result and no step", async (selection, code) => {
    const events: ClassicSolveEvent[] = [];
    await solveClassic(
      {
        givens: [...puzzle("easy")].map(Number),
        limits: { ...CLASSIC_SOLVE_LIMITS, timeMs: 3_600_000, workUnits: 400_000 },
        techniqueSelection: selection as TechniqueSelection,
      },
      { clock: { now: () => 0 }, emit: (event) => events.push(event) },
    );
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: "result", outcome: "error", code, steps: 0 });
  });
});
