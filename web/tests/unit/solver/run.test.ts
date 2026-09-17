import { describe, expect, test } from "vitest";
import { runSolver } from "../../../src/solver/run";
import { assemble } from "../../../src/solver/rules/assemble";
import { canonicalProblem } from "../../../src/solver/problem";
import { makeSnapshot } from "../../../src/solver/snapshot";
import { initialize } from "../../../src/solver/state/candidates";
import { AllDifferentRule } from "../../../src/solver/rules/all-different";
import { IndexWorkspace } from "../../../src/solver/indexes/workspace";
import { schedulingOptions } from "../../../src/solver/scheduling/work";

describe("bounded solver phases", () => {
  test("does not resume human discovery after exact fallback starts", async () => {
    const published: Array<{ kind?: string }> = [];
    let accepted = 0;
    await runSolver(
      {
        mode: "conditional",
        conditional: true,
        run: { operation: "conditional" },
        human: async () => ({ human: "incomplete" }),
      },
      {
        clock: { now: () => 0 },
        yieldTask: async () => {},
        publish: async (event: unknown) => published.push(event as { kind?: string }),
        awaitAcceptance: async () => "human-stopped",
      } as any,
    );
    expect(accepted).toBe(0);
    expect(published.some((event) => event.kind === "terminal")).toBe(true);
  });
  test("runs a complete logical phase into independently exhausted exact evidence", async () => {
    const problem = canonicalProblem({
        schema: 1,
        cells: [0],
        symbols: [1],
        givens: [1],
        constraints: [],
      }),
      assembled = assemble(problem, []);
    if (!assembled.ok) throw Error("fixture");
    const snapshot = makeSnapshot(problem, { kind: "manual" }, "run-test", 0),
      view = initialize(assembled.value, "primary"),
      workspace = new IndexWorkspace({ entryLimit: 100000, byteLimit: 64000000 });
    const limits = {
      timeMs: 10000,
      workUnits: 100000,
      exactNodes: 10000,
      stepNodes: 4096,
      runNodes: 65536,
      proofBytes: 8000000,
      stepBytes: 1000000,
      batchBytes: 65536,
      inFlightBatches: 2,
      workspaceBytes: 64000000,
    };
    const run = {
      requestId: "run-test",
      snapshotId: snapshot.snapshotId,
      inputRevision: 0,
      problemKey: problem.key,
      operation: "primary" as const,
      mode: "explain" as const,
      engine: "engine@1",
      profile: "classic-expanded@1",
      scheduler: "scheduler@1",
      checker: "checker@1",
      exact: "original-dfs@1",
      optionsKey: "options",
      parentEvidenceId: null,
    };
    const published: Array<{ kind?: string; count?: { kind?: string } }> = [];
    await runSolver(
      {
        snapshot,
        assembly: assembled.value,
        view,
        registry: { rules: [], techniques: [] },
        workspace,
        limits,
        options: { ...schedulingOptions({ limits }), workspace },
        run,
        accept: () => view,
      },
      {
        clock: { now: () => Date.now() },
        yieldTask: async () => {},
        publish: async (event) => {
          published.push(event as (typeof published)[number]);
        },
        awaitAcceptance: async () => "accepted",
      },
    );
    if (!published.find((event) => event.kind === "evidence" && event.count?.kind === "unique"))
      throw Error(JSON.stringify(published));
    expect(published.at(-1)?.kind).toBe("terminal");
    expect(workspace.usage.bytes).toBe(0);
  });
  test("an exhausted exact root without witnesses is zero evidence, not unknown", async () => {
    const problem = canonicalProblem({
        schema: 1,
        cells: [0, 1],
        symbols: [1],
        givens: [0, 0],
        constraints: [{ id: "pair", type: "all-different@1", cells: [0, 1], parameters: {} }],
      }),
      assembled = assemble(problem, [new AllDifferentRule()]);
    if (!assembled.ok) throw Error("fixture");
    const snapshot = makeSnapshot(problem, { kind: "manual" }, "zero-test", 0),
      view = initialize(assembled.value, "primary"),
      workspace = new IndexWorkspace({ entryLimit: 100000, byteLimit: 64000000 });
    const limits = {
      timeMs: 10000,
      workUnits: 100000,
      exactNodes: 10000,
      stepNodes: 4096,
      runNodes: 65536,
      proofBytes: 8000000,
      stepBytes: 1000000,
      batchBytes: 65536,
      inFlightBatches: 2,
      workspaceBytes: 64000000,
    };
    const run = {
      requestId: "zero-test",
      snapshotId: snapshot.snapshotId,
      inputRevision: 0,
      problemKey: problem.key,
      operation: "primary" as const,
      mode: "explain" as const,
      engine: "engine@1",
      profile: "classic-expanded@1",
      scheduler: "scheduler@1",
      checker: "checker@1",
      exact: "original-dfs@1",
      optionsKey: "options",
      parentEvidenceId: null,
    };
    const published: Array<{ kind?: string; outcome?: string; count?: { kind?: string } }> = [];
    await runSolver(
      {
        snapshot,
        assembly: assembled.value,
        view,
        registry: { rules: [], techniques: [] },
        workspace,
        limits,
        options: { ...schedulingOptions({ limits }), workspace },
        run,
        accept: () => view,
      },
      {
        clock: { now: () => Date.now() },
        yieldTask: async () => {},
        publish: async (event) => {
          published.push(event as (typeof published)[number]);
        },
        awaitAcceptance: async () => "accepted",
      },
    );
    expect(published.at(-1)).toMatchObject({
      kind: "terminal",
      outcome: "complete",
      count: { kind: "zero" },
    });
  });
});
