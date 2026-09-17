import { expect, test } from "vitest";
import { encodeRecords, decodeRecords } from "../../../src/solver/transport/codec";
import { createSender } from "../../../src/solver/transport/sender";
import { createReceiver } from "../../../src/solver/transport/receiver";

const key = {
  requestId: "r",
  snapshotId: "s",
  inputRevision: 0,
  problemKey: "p",
  operation: "primary" as const,
  mode: "explain" as const,
  engine: "engine@1",
  profile: "classic-expanded@1",
  scheduler: "scheduler@1",
  checker: "checker@1",
  exact: "original-dfs@1",
  optionsKey: "o",
  parentEvidenceId: null,
};
const limits = {
  timeMs: 1000,
  workUnits: 10000,
  exactNodes: 1000,
  stepNodes: 4096,
  runNodes: 10000,
  proofBytes: 100000,
  stepBytes: 100000,
  batchBytes: 65536,
  inFlightBatches: 2,
  workspaceBytes: 1000000,
};
test("codec round-trips records split across bounded UTF-8 chunks", () => {
  const chunks = [...encodeRecords([{ message: "😀".repeat(10000) }], 1024)];
  expect(chunks.length).toBeGreaterThan(2);
  expect(decodeRecords(chunks)).toEqual([{ message: "😀".repeat(10000) }]);
});
test("receiver ACKs staged chunks and accepts only after proof end", () => {
  const acks: number[] = [];
  let accepted = 0;
  const receiver = createReceiver(
    { key, limits },
    () => {
      accepted++;
      return 1;
    },
    (seq) => acks.push(seq),
  );
  receiver.receive({
    protocol: 2,
    key,
    seq: 1,
    type: "proof-begin",
    header: {
      stepId: 1,
      state: { problemKey: "p", branch: "primary", revision: 0 },
      technique: "c01@1",
      effects: [],
      roots: [],
      imports: [],
      pattern: {},
      nodeCount: 0,
      byteCount: 2,
      chunkCount: 1,
    },
  });
  receiver.receive({
    protocol: 2,
    key,
    seq: 2,
    type: "proof-chunk",
    batchSeq: 1,
    stepId: 1,
    chunk: 0,
    bytes: new TextEncoder().encode("{}"),
  });
  expect(accepted).toBe(0);
  receiver.receive({ protocol: 2, key, seq: 3, type: "proof-end", stepId: 1 });
  expect(accepted).toBe(1);
  expect(acks).toEqual([1]);
  const gap = createReceiver(
    { key, limits },
    () => 1,
    () => {},
  );
  gap.receive({
    protocol: 2,
    key,
    seq: 1,
    type: "proof-begin",
    header: {
      stepId: 2,
      state: { problemKey: "p", branch: "primary", revision: 0 },
      technique: "c01@1",
      effects: [],
      roots: [],
      imports: [],
      pattern: {},
      nodeCount: 0,
      byteCount: 0,
      chunkCount: 0,
    },
  });
  expect(() => gap.receive({ protocol: 2, key, seq: 3, type: "proof-end", stepId: 2 })).toThrow(
    "protocol-sequence",
  );
});
test("sender never exceeds two unacknowledged proof batches", async () => {
  const senderLimits = { ...limits, batchBytes: 1024 };
  let sender!: ReturnType<typeof createSender>;
  const messages: unknown[] = [];
  sender = createSender(
    (message) => {
      messages.push(message);
      const frame = message as { type?: string; batchSeq?: number };
      if (frame.type === "proof-chunk") sender.ack(frame.batchSeq!);
    },
    key,
    senderLimits,
  );
  const records = [{ message: "😀".repeat(10000) }],
    chunks = encodeRecords(records, 1024),
    header = {
      stepId: 3,
      state: { problemKey: "p", branch: "primary", revision: 0 },
      technique: "c01@1",
      effects: [],
      roots: [],
      imports: [],
      pattern: {},
      nodeCount: 0,
      byteCount: chunks.reduce((n, c) => n + c.length, 0),
      chunkCount: chunks.length,
    };
  await sender.sendProof(header, records);
  expect(sender.maxUnacked).toBeLessThanOrEqual(2);
  expect(messages.at(-1)).toMatchObject({ type: "proof-end" });
});
