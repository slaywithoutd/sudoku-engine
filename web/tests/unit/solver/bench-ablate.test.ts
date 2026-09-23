/**
 * Ablation runner (plan T15). Validation runs in the normal suite; the
 * ablation itself is opt-in:
 *   ABLATE=run ABLATE_CONFIG=<0..9> ABLATE_BUDGET=spec|stop ABLATE_CASES=grid|full
 *     ABLATE_SHARD=i/n [ABLATE_TAG=repeat] CORPUS_OUT=<dir>
 * writes `<dir>/ablation/<label>-<budget>-<cases>[-repeat]-<i>.json` (traces);
 * the `repeat` tag is a second run of the same configuration for metric E. Then
 *   ABLATE=report CORPUS_OUT=<dir>
 * merges the traces and writes `<dir>/ablation-report.json` with metrics A-F
 * for every `@2` configuration against its `@1` counterpart at both budgets,
 * E for every configuration (a missing repeat fails it), and the gate of
 * D101: C at the `spec` budget, A, B, D, F at `stop`, E at both.
 */
import { describe, expect, test } from "vitest";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Corpus, CorpusEntry } from "../../solver/bench/corpus-schema";
import {
  ABLATION_BUDGETS,
  ABLATION_GRID,
  ablationLimits,
  compare,
  configLabel,
  identicalTraces,
  runCase,
  type Budget,
  type Metrics,
  type RunTrace,
} from "../../solver/bench/ablate";
import type { PolicyId, PolicyParameters } from "../../../src/solver/scheduling/work";

const bench = fileURLToPath(new URL("../../solver/bench/", import.meta.url));
const mode = process.env.ABLATE;

interface Config {
  readonly mode: "explain" | "analyze";
  readonly policy: PolicyId;
  readonly parameters?: PolicyParameters;
}

/**
 * Explain only (D101): `analyze-fair@1` stops after its first 4,096-unit
 * selection window with no step on this corpus (a pre-existing M2 defect the
 * M2.6 draft fixes under `analyze-fair@3`), so an Analyze comparison would set
 * zero steps against zero steps. The baseline first, then the grid.
 */
export const CONFIGS: readonly Config[] = [
  { mode: "explain", policy: "explain-fair@1" },
  ...ABLATION_GRID.map((parameters) => ({
    mode: "explain" as const,
    policy: "explain-fair@2" as const,
    parameters,
  })),
];

/** `grid`: the first five held-out cases per family; `full`: every held-out case. */
function heldOut(kind: string): CorpusEntry[] {
  const corpus = JSON.parse(readFileSync(bench + "corpus.json", "utf8")) as Corpus;
  if (kind === "full") return [...corpus.heldOut];
  const perFamily = new Map<string, number>();
  return corpus.heldOut.filter((entry) => {
    const seen = perFamily.get(entry.family) ?? 0;
    perFamily.set(entry.family, seen + 1);
    return seen < 5;
  });
}

function slug(label: string): string {
  return label.replace(/[^a-z0-9]+/gi, "-");
}

describe.skipIf(mode !== "run")("ablation run", () => {
  test(
    "runs one configuration over one shard of the held-out cases",
    async () => {
      const config = CONFIGS[Number(process.env.ABLATE_CONFIG)];
      const cases = process.env.ABLATE_CASES ?? "grid";
      const budget = (process.env.ABLATE_BUDGET ?? "stop") as Budget;
      if (!(budget in ABLATION_BUDGETS)) throw new Error(`unknown budget ${budget}`);
      const tag = process.env.ABLATE_TAG ? `-${process.env.ABLATE_TAG}` : "";
      const [shard, shards] = (process.env.ABLATE_SHARD ?? "0/1").split("/").map(Number);
      const out = `${process.env.CORPUS_OUT ?? bench}/ablation/`;
      mkdirSync(out, { recursive: true });
      const label = configLabel(config.policy, config.parameters);
      const file = `${out}${slug(label)}-${budget}-${cases}${tag}-${shard}.json`;
      const traces: RunTrace[] = [];
      const entries = heldOut(cases).filter((_, index) => index % shards === shard);
      for (const entry of entries) {
        traces.push(
          await runCase(
            entry,
            config.mode,
            config.policy,
            config.parameters,
            ablationLimits(budget),
          ),
        );
        writeFileSync(file, JSON.stringify(traces));
      }
      expect(traces.length).toBe(entries.length);
    },
    24 * 3600_000,
  );
});

describe.skipIf(mode !== "report")("ablation report", () => {
  test("compares every @2 configuration with its @1 counterpart", () => {
    const out = `${process.env.CORPUS_OUT ?? bench}/ablation/`;
    const traces = new Map<string, RunTrace[]>();
    for (const name of readdirSync(out)
      .filter((n) => n.endsWith(".json"))
      .sort()) {
      const key = name.replace(/-\d+\.json$/, "");
      const list = traces.get(key) ?? [];
      list.push(...(JSON.parse(readFileSync(out + name, "utf8")) as RunTrace[]));
      traces.set(key, list);
    }
    const byCase = (list: readonly RunTrace[]) =>
      [...list].sort((a, b) => (a.case < b.case ? -1 : a.case > b.case ? 1 : 0));
    const report: Record<string, unknown> = {};
    for (const cases of ["grid", "full"]) {
      // Metric E: every configuration at every budget needs its repeat; a
      // missing or partial repeat fails E rather than skipping it.
      const determinism: Record<string, boolean> = {};
      for (const config of CONFIGS)
        for (const budget of Object.keys(ABLATION_BUDGETS)) {
          const key = `${slug(configLabel(config.policy, config.parameters))}-${budget}-${cases}`;
          const first = traces.get(key);
          const second = traces.get(`${key}-repeat`);
          if (!first) continue;
          determinism[`${budget} ${configLabel(config.policy, config.parameters)}`] =
            second !== undefined &&
            second.length === first.length &&
            identicalTraces(byCase(first), byCase(second));
        }
      if (Object.keys(determinism).length > 0) report[`${cases} E`] = determinism;
      const deterministic = (label: string) =>
        Object.keys(ABLATION_BUDGETS).every((budget) => determinism[`${budget} ${label}`] === true);
      for (const config of CONFIGS) {
        if (!config.parameters) continue;
        const label = configLabel(config.policy, config.parameters);
        const baseLabel = config.mode === "explain" ? "explain-fair@1" : "analyze-fair@1";
        const metrics: Partial<Record<Budget, Metrics & { cases: number }>> = {};
        for (const budget of Object.keys(ABLATION_BUDGETS) as Budget[]) {
          const candidate = traces.get(`${slug(label)}-${budget}-${cases}`);
          const baseline = traces.get(`${slug(baseLabel)}-${budget}-${cases}`);
          if (candidate && baseline)
            metrics[budget] = { cases: candidate.length, ...compare(baseline, candidate) };
        }
        if (!metrics.spec && !metrics.stop) continue;
        const gate =
          metrics.spec && metrics.stop
            ? {
                A: metrics.stop.pass.A,
                B: metrics.stop.pass.B,
                C: metrics.spec.pass.C,
                D: metrics.stop.pass.D,
                E: deterministic(label) && deterministic(baseLabel),
                F: metrics.stop.pass.F,
              }
            : null;
        report[`${cases} ${label}`] = { ...metrics, gate };
      }
    }
    writeFileSync(
      `${process.env.CORPUS_OUT ?? bench}/ablation-report.json`,
      JSON.stringify(report, null, 1),
    );
    expect(Object.keys(report).length).toBeGreaterThan(0);
  });
});

describe.skipIf(mode !== undefined)("ablation harness (T15)", () => {
  test("metrics A-F over synthetic traces", () => {
    const trace = (
      id: string,
      steps: readonly [string, number, number][],
      stopWork: number,
      human = "solved",
    ): RunTrace => ({
      case: id,
      family: "classic",
      mode: "explain",
      policy: "explain-fair@1",
      steps: steps.map(([technique, tier, workUnits]) => ({
        technique,
        tier,
        workUnits,
        effects: "p0:1",
      })),
      stopWork,
      human,
      outcome: "complete",
    });
    const baseline = [
      trace(
        "a",
        [
          ["c01@1", 0, 10],
          ["c10@1", 3, 1010],
          ["c20@1", 4, 3010],
        ],
        3100,
      ),
      trace("b", [["c01@1", 0, 10]], 2_000_000, "incomplete"),
    ];
    const better = [
      trace(
        "a",
        [
          ["c01@1", 0, 10],
          ["c10@1", 3, 510],
          ["c20@1", 4, 1510],
        ],
        1600,
      ),
      trace("b", [["c01@1", 0, 10]], 2_000_000, "incomplete"),
    ];
    const metrics = compare(baseline, better);
    expect(metrics.A).toEqual({
      baseline: 1500,
      candidate: 750,
      reduction: 0.5,
      states: 2,
      candidateStates: 2,
    });
    // B averages only the pair that reached its logical stop; "b" is censored.
    expect(metrics.B).toEqual({
      baseline: 3100,
      candidate: 1600,
      reduction: 1 - 1600 / 3100,
      censored: 1,
    });
    expect(metrics.C).toEqual({ baseline: 0.5, candidate: 0.5 });
    expect(metrics.D).toEqual({ worst: 1, below: [] });
    expect(metrics.F).toEqual({ identical: 2, total: 2 });
    expect(metrics.pass).toEqual({ A: true, B: true, C: true, D: true, F: true });
    // Dropping a family and reordering a tier-0 prefix fails D and F.
    const worse = [
      trace(
        "a",
        [
          ["c02@1", 0, 10],
          ["c10@1", 3, 1010],
        ],
        3100,
      ),
      trace("b", [["c01@1", 0, 10]], 2_000_000, "incomplete"),
    ];
    const failed = compare(baseline, worse);
    expect(failed.D.below).toEqual(["c01@1", "c20@1"]);
    expect(failed.F).toEqual({ identical: 1, total: 2 });
    // F does not apply to Analyze.
    const analyze = (list: readonly RunTrace[]) =>
      list.map((entry) => ({ ...entry, mode: "analyze" as const }));
    const analyzed = compare(analyze(baseline), analyze(worse));
    expect(analyzed.F).toBeNull();
    expect(analyzed.pass.F).toBe(true);
    expect(identicalTraces(baseline, baseline)).toBe(true);
    expect(identicalTraces(baseline, better)).toBe(false);
  });

  test("metric E: one held-out case runs to identical traces under @1 and @2", async () => {
    const corpus = JSON.parse(readFileSync(bench + "corpus.json", "utf8")) as Corpus;
    const entry = corpus.heldOut.find((candidate) => candidate.family === "classic")!;
    for (const config of [CONFIGS[0], CONFIGS[1]]) {
      const first = await runCase(entry, config.mode, config.policy, config.parameters);
      const second = await runCase(entry, config.mode, config.policy, config.parameters);
      expect(identicalTraces([first], [second])).toBe(true);
      expect(first.steps.length).toBeGreaterThan(0);
      expect(first.stopWork).toBeGreaterThan(0);
    }
  }, 600_000);
});
