import { expect, test, vi } from "vitest";
import * as evidence from "../../../src/solver/evidence";
import { exactSteps, EXACT_METHOD } from "../../../src/solver/exact";
import { normalizeClassic } from "../../../src/solver/problem";
import { AllDifferentRule } from "../../../src/solver/rules/all-different";
import { assemble } from "../../../src/solver/rules/assemble";
import { initialize } from "../../../src/solver/state/candidates";
import { makeSnapshot, type RunKey } from "../../../src/solver/snapshot";
import u01 from "../../solver/fixtures/U01.json";
import { ConditionalOperation, uniqueAuthorityMatches } from "../../../src/solver/conditional";
import { IndexWorkspace } from "../../../src/solver/indexes/workspace";

const limits = {
  timeMs: 20000,
  workUnits: 10_000_000,
  exactNodes: 1_000_000,
  stepNodes: 4096,
  runNodes: 65536,
  proofBytes: 16_000_000,
  stepBytes: 2_000_000,
  batchBytes: 65536,
  inFlightBatches: 2,
  workspaceBytes: 128_000_000,
};
function primary() {
  const problem = normalizeClassic({
    kind: "classic",
    version: 1,
    width: 9,
    height: 9,
    givens: [...u01.fixtures[0].givens].map(Number),
  });
  const result = assemble(problem, [new AllDifferentRule()]);
  if (!result.ok) throw Error("test-assembly");
  const snapshot = makeSnapshot(problem, { kind: "manual" }, "unique-test", 0);
  const run: RunKey = {
    requestId: "primary",
    snapshotId: snapshot.snapshotId,
    inputRevision: 0,
    problemKey: problem.key,
    operation: "primary",
    mode: "explain",
    engine: "engine@1",
    profile: "classic-expanded@1",
    scheduler: "scheduler@1",
    checker: "checker@1",
    exact: EXACT_METHOD,
    optionsKey: "options",
    parentEvidenceId: null,
  };
  const initialView = initialize(result.value, "primary");
  const context: evidence.EvidenceContext = {
    snapshot,
    run,
    assembly: result.value,
    initialView,
    acceptedView: initialView,
    accepted: [],
    human: "not-started",
    activeExactRun: run,
    phase: "exact",
  };
  let raw: evidence.CountEvidence | undefined;
  const witnesses: (readonly number[])[] = [];
  for (const event of exactSteps(snapshot.problem, context.assembly)) {
    if (event.kind === "witness") witnesses.push(event.values);
    if (event.kind === "exhausted" && witnesses.length === 1)
      raw = {
        kind: "unique",
        witness: witnesses[0],
        evidenceId: "unique-parent",
        rootExhausted: true,
        proof: {
          kind: "root-exhausted",
          key: run,
          method: EXACT_METHOD,
          stats: event.stats,
          frontierEmpty: true,
        },
      };
  }
  if (!raw) throw Error("missing-exact-terminal");
  const merged = evidence.mergeEvidence(
    { kind: "unknown", lowerBound: 0, witnesses: [] },
    raw,
    context,
  );
  expect(merged.diagnostics).toEqual([]);
  expect(merged.count.kind).toBe("unique");
  return { context, raw, count: merged.count };
}

test("accepted primary uniqueness exposes a read-only parent capability", () => {
  expect(evidence).toHaveProperty("acceptedUniqueParent");
});

test("parent capability requires real exact/merge authority and a non-quarantined lifecycle", () => {
  const { context, raw, count } = primary();
  expect(evidence.acceptedUniqueParent(raw, context, false)).toBeUndefined();
  expect(evidence.acceptedUniqueParent(structuredClone(count), context, false)).toBeUndefined();
  expect(evidence.acceptedUniqueParent(count, context, true)).toBeUndefined();
  expect(
    evidence.acceptedUniqueParent(count, { ...context, human: "invalidated" }, false),
  ).toBeUndefined();
  const parent = evidence.acceptedUniqueParent(count, context, false)!;
  expect(parent).toBeDefined();
  expect(Object.keys(parent)).toEqual(["evidenceId"]);
  expect(evidence.uniqueParentDetails(structuredClone(parent))).toBeUndefined();
  expect(evidence.uniqueParentDetails(parent)?.prefix).toEqual([]);
  evidence.revokeUniqueParent(parent);
  expect(evidence.uniqueParentDetails(parent)).toBeUndefined();
});

test("conditional operations have an explicit lifecycle owner", async () => {
  const module = await import("../../../src/solver/conditional").catch(() => ({}));
  expect(module).toHaveProperty("ConditionalOperation");
});

test("fresh workers install authority only at an explicit trusted port boundary", () => {
  expect(ConditionalOperation).toHaveProperty("installTrustedBootstrap");
});

test("operation capabilities reject cloned brands, same-label owners and revoked parents", async () => {
  const { context, count } = primary();
  const parent = evidence.acceptedUniqueParent(count, context, false)!;
  const run: RunKey = {
    ...context.run,
    requestId: "conditional",
    operation: "conditional",
    profile: "classic-conditional@1",
    parentEvidenceId: parent.evidenceId,
  };
  const workspace = new IndexWorkspace({ entryLimit: 1_000_000, byteLimit: limits.workspaceBytes });
  const op = ConditionalOperation.begin(parent, run, limits, workspace);
  expect(uniqueAuthorityMatches(op.authority, op.view)).toBe(false);
  expect([...op.rebuildPrefix()]).toEqual([]);
  expect(uniqueAuthorityMatches(op.authority, op.view)).toBe(true);
  expect(uniqueAuthorityMatches(structuredClone(op.authority), op.view)).toBe(false);
  expect(
    uniqueAuthorityMatches(op.authority, initialize(context.assembly, op.view.state.key.branch)),
  ).toBe(false);
  expect(await op.digestPrefix()).toMatch(/^[a-f0-9]{64}$/);
  evidence.revokeUniqueParent(parent);
  expect(uniqueAuthorityMatches(op.authority, op.view)).toBe(false);
  op.dispose();
  expect(workspace.usage).toEqual({ entries: 0, bytes: 0 });
});

function emptyOperation() {
  const { context, count } = primary(),
    parent = evidence.acceptedUniqueParent(count, context, false)!;
  const run: RunKey = {
    ...context.run,
    requestId: "conditional-port",
    operation: "conditional",
    profile: "classic-conditional@1",
    parentEvidenceId: parent.evidenceId,
  };
  const workspace = new IndexWorkspace({ entryLimit: 1_000_000, byteLimit: limits.workspaceBytes });
  const operation = ConditionalOperation.begin(parent, run, limits, workspace);
  [...operation.rebuildPrefix()];
  return { operation, workspace, parent, context };
}

test("dedicated grant waits for exact prefix, refuses duplicates and releases both owners", async () => {
  const h = emptyOperation(),
    channel = new MessageChannel();
  const expected = await h.operation.grantBootstrap(channel.port1, "nonce-unique-port-0001", 1);
  const workspace = new IndexWorkspace({ entryLimit: 1_000_000, byteLimit: limits.workspaceBytes });
  const installed = ConditionalOperation.installTrustedBootstrap(
    channel.port2,
    expected,
    h.context.assembly,
    limits,
    workspace,
  );
  let ready = false;
  void installed.ready.then(() => {
    ready = true;
  });
  await new Promise((resolve) => setTimeout(resolve, 10));
  expect(ready).toBe(false);
  await installed.providePrefix([]);
  const worker = await installed.ready;
  expect(uniqueAuthorityMatches(worker.authority, worker.view)).toBe(true);
  expect(h.operation.acceptsResult(worker.run, expected.prefix)).toBe(true);
  expect(() =>
    ConditionalOperation.installTrustedBootstrap(
      channel.port2,
      expected,
      h.context.assembly,
      limits,
      workspace,
    ),
  ).toThrow("conditional-port-already-installed");
  channel.port1.postMessage({ kind: "conditional-grant@1", envelope: expected });
  await new Promise((resolve) => setTimeout(resolve, 10));
  expect(worker.active).toBe(false);
  expect(workspace.usage).toEqual({ entries: 0, bytes: 0 });
  evidence.revokeUniqueParent(h.parent);
  expect(h.operation.acceptsResult(worker.run, expected.prefix)).toBe(false);
  h.operation.dispose();
  expect(h.workspace.usage).toEqual({ entries: 0, bytes: 0 });
});

test("concurrent native-port grants claim the endpoint exactly once before hashing", async () => {
  const h = emptyOperation(),
    channel = new MessageChannel();
  const frames: { kind: string }[] = [];
  channel.port2.onmessage = (event) => {
    frames.push(event.data);
  };
  try {
    const results = await Promise.allSettled([
      h.operation.grantBootstrap(channel.port1, "nonce-concurrent-first", 1),
      h.operation.grantBootstrap(channel.port1, "nonce-concurrent-second", 2),
    ]);
    expect(results.map((result) => result.status)).toEqual(["fulfilled", "rejected"]);
    if (results[1].status === "rejected")
      expect(results[1].reason.message).toBe("conditional-grant-lifecycle");
    await vi.waitFor(() =>
      expect(frames.map((frame) => frame.kind)).toEqual(["conditional-grant@1"]),
    );
    h.operation.dispose();
    await vi.waitFor(() =>
      expect(frames.map((frame) => frame.kind)).toEqual([
        "conditional-grant@1",
        "conditional-revoke@1",
      ]),
    );
    expect(h.workspace.usage).toEqual({ entries: 0, bytes: 0 });
  } finally {
    h.operation.dispose();
    channel.port1.close();
    channel.port2.close();
  }
});

test("an asynchronous failed grant closes its claimed endpoint permanently", async () => {
  const h = emptyOperation(),
    failed = new MessageChannel(),
    later = new MessageChannel();
  const close = vi.spyOn(failed.port1, "close");
  const digest = vi
    .spyOn(crypto.subtle, "digest")
    .mockRejectedValueOnce(Error("test-hash-failure"));
  const before = h.workspace.usage;
  try {
    await expect(
      h.operation.grantBootstrap(failed.port1, "nonce-failed-attempt", 1),
    ).rejects.toThrow("test-hash-failure");
    digest.mockRestore();
    expect(close).toHaveBeenCalledOnce();
    expect(h.workspace.usage).toEqual(before);
    expect(h.operation.active).toBe(true);
    await expect(h.operation.grantBootstrap(failed.port1, "nonce-failed-retry", 2)).rejects.toThrow(
      "conditional-grant-lifecycle",
    );
    expect(close).toHaveBeenCalledOnce();
    await expect(
      h.operation.grantBootstrap(later.port1, "nonce-new-endpoint", 3),
    ).resolves.toHaveProperty("generation", 3);
    h.operation.dispose();
    expect(h.workspace.usage).toEqual({ entries: 0, bytes: 0 });
    expect(close).toHaveBeenCalledOnce();
  } finally {
    digest.mockRestore();
    close.mockRestore();
    h.operation.dispose();
    failed.port1.close();
    failed.port2.close();
    later.port1.close();
    later.port2.close();
  }
});

test("foreign or changed grant cannot mint worker authority", async () => {
  const h = emptyOperation(),
    source = new MessageChannel(),
    foreign = new MessageChannel();
  const expected = await h.operation.grantBootstrap(source.port1, "nonce-unique-port-0002", 2);
  const workspace = new IndexWorkspace({ entryLimit: 1_000_000, byteLimit: limits.workspaceBytes });
  const installed = ConditionalOperation.installTrustedBootstrap(
    foreign.port2,
    expected,
    h.context.assembly,
    limits,
    workspace,
  );
  const rejected = expect(installed.ready).rejects.toThrow("conditional-grant-mismatch");
  await installed.providePrefix([]);
  foreign.port1.postMessage({
    kind: "conditional-grant@1",
    envelope: { ...expected, generation: 1 },
  });
  await rejected;
  expect(workspace.usage).toEqual({ entries: 0, bytes: 0 });
  source.port2.close();
  foreign.port1.close();
  h.operation.dispose();
});

test("revocation across awaited hashing disposes every temporary reservation", async () => {
  const h = emptyOperation(),
    original = crypto.subtle.digest.bind(crypto.subtle);
  const spy = vi.spyOn(crypto.subtle, "digest").mockImplementation(async (...args) => {
    const value = await original(...args);
    evidence.revokeUniqueParent(h.parent);
    return value;
  });
  const before = h.workspace.usage;
  try {
    await expect(h.operation.digestPrefix()).rejects.toThrow("revoked-unique-authority");
  } finally {
    spy.mockRestore();
  }
  expect(h.workspace.usage).toEqual(before);
  h.operation.dispose();
  expect(h.workspace.usage).toEqual({ entries: 0, bytes: 0 });
});

test("fresh Node realm independently captures prefix and checks a uniqueness bundle", async () => {
  const { Worker } = await import("node:worker_threads");
  const { uniqueHarness, uniqueLimits } = await import("../../solver/unique-harness");
  const { independentNamedUnique } = await import("../../solver/unique-independent");
  const seed = u01.fixtures[0] as any,
    h = uniqueHarness(seed),
    channel = new MessageChannel();
  const expected = await h.operation.grantBootstrap(channel.port1, "nonce-worker-realm-001", 3);
  const proposal = independentNamedUnique(
    h.operation.view,
    seed,
    h.parent.evidenceId,
    seed.expectedEffects[0],
  );
  const worker = new Worker(new URL("../../solver/unique-worker.mjs", import.meta.url), {
    workerData: {
      expected,
      prefix: h.operation.prefix,
      bundles: [proposal],
      limits: uniqueLimits,
      port: channel.port2,
    },
    transferList: [channel.port2 as any],
  });
  try {
    const result: any = await new Promise((resolve, reject) => {
      worker.once("message", resolve);
      worker.once("error", reject);
    });
    expect(result.error).toBeUndefined();
    expect(result.ready).toBe(true);
    expect(result.events).toEqual([{ kind: "checked", conditional: true }]);
    expect(result.usage).toEqual({ entries: 0, bytes: 0 });
  } finally {
    await worker.terminate();
    h.operation.dispose();
  }
  expect(h.workspace.usage).toEqual({ entries: 0, bytes: 0 });
}, 30000);

test("a valid grant plus partial or altered nonempty prefix never reaches ready", async () => {
  const { uniqueHarness, uniqueLimits } = await import("../../solver/unique-harness");
  const h = uniqueHarness(u01.fixtures[0] as any);
  try {
    expect(h.operation.prefix.length).toBeGreaterThan(1);
    for (const alter of [false, true]) {
      const channel = new MessageChannel(),
        expected = await h.operation.grantBootstrap(
          channel.port1,
          `nonce-partial-prefix-${alter}`,
          4,
        );
      const workspace = new IndexWorkspace({
        entryLimit: 1_000_000,
        byteLimit: uniqueLimits.workspaceBytes,
      });
      const installation = ConditionalOperation.installTrustedBootstrap(
        channel.port2,
        expected,
        h.operation.assembly,
        uniqueLimits,
        workspace,
      );
      const rejected = expect(installation.ready).rejects.toThrow(
        "conditional-prefix-digest-mismatch",
      );
      const prefix = structuredClone(alter ? h.operation.prefix : h.operation.prefix.slice(0, -1));
      if (alter) (prefix[0].pattern as any).alias = "wrong-alias";
      await expect(installation.providePrefix(prefix)).rejects.toThrow(
        "conditional-prefix-digest-mismatch",
      );
      await rejected;
      expect(workspace.usage).toEqual({ entries: 0, bytes: 0 });
    }
  } finally {
    h.operation.dispose();
  }
  expect(h.workspace.usage).toEqual({ entries: 0, bytes: 0 });
}, 30000);

test("conditional disposal preserves the accepted primary parent for a new branch", () => {
  const h = emptyOperation();
  h.operation.dispose();
  const next = ConditionalOperation.begin(
    h.parent,
    { ...h.operation.run, requestId: "conditional-again" },
    limits,
    h.workspace,
  );
  expect(evidence.uniqueParentDetails(h.parent)).toBeDefined();
  [...next.rebuildPrefix()];
  expect(uniqueAuthorityMatches(next.authority, next.view)).toBe(true);
  next.dispose();
  expect(h.workspace.usage).toEqual({ entries: 0, bytes: 0 });
});

test("task-yielded prefix replay stays private and revokes before a second slice", async () => {
  const { uniqueHarness, uniqueLimits } = await import("../../solver/unique-harness");
  const h = uniqueHarness(u01.fixtures[0] as any),
    channel = new MessageChannel();
  const expected = await h.operation.grantBootstrap(channel.port1, "nonce-replay-task-yield", 5);
  const workspace = new IndexWorkspace({
    entryLimit: 1_000_000,
    byteLimit: uniqueLimits.workspaceBytes,
  });
  let slices = 0,
    ready = false,
    release!: () => void,
    paused!: () => void;
  const started = new Promise<void>((resolve) => {
    paused = resolve;
  });
  const installation = ConditionalOperation.installTrustedBootstrap(
    channel.port2,
    expected,
    h.operation.assembly,
    uniqueLimits,
    workspace,
    {
      yieldTask: () => {
        slices++;
        paused();
        return new Promise<void>((resolve) => {
          release = resolve;
        });
      },
    },
  );
  const rejected = expect(installation.ready).rejects.toThrow("revoked-unique-authority");
  void installation.ready.then(
    () => {
      ready = true;
    },
    () => {},
  );
  await installation.providePrefix(h.operation.prefix);
  await started;
  expect(slices).toBe(1);
  expect(ready).toBe(false);
  h.operation.dispose();
  await new Promise((resolve) => setTimeout(resolve, 10));
  release();
  await rejected;
  expect(workspace.usage).toEqual({ entries: 0, bytes: 0 });
}, 30000);

test("public accounting includes initialization and charges scheduler work without resetting allowance", async () => {
  const h = emptyOperation(),
    initial = h.operation.usage.workUnits;
  expect(initial).toBeGreaterThan(0);
  await h.operation.digestPrefix();
  expect(h.operation.usage.workUnits).toBeGreaterThan(initial);
  const before = h.operation.usage.workUnits;
  h.operation.charge(17);
  expect(h.operation.usage.workUnits).toBe(before + 17);
  expect(h.operation.remainingLimits().workUnits).toBe(limits.workUnits - before - 17);
  expect(h.operation.remainingLimits().timeMs).toBeLessThan(limits.timeMs);
  h.operation.dispose();
  expect(() => h.operation.charge(1)).toThrow("revoked-unique-authority");
});

test("conditional replay refuses a shaped operation and its fabricated event stream", async () => {
  const { replayConditional } = await import("../../../src/solver/proof/replay");
  expect([
    ...replayConditional(
      {
        active: true,
        checkAndCommit: function* () {
          yield { kind: "checked", step: {} };
        },
      } as any,
      [],
    ),
  ]).toEqual([{ kind: "rejected", code: "inauthentic-conditional-operation" }]);
});
