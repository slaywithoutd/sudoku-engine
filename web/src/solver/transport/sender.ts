import type { RunKey } from "../snapshot";
import type { Limits } from "../limits";
import type { ProofHeader } from "./protocol";
import { encodeRecords } from "./codec";
import { defined } from "../invariants";
export interface Sender {
  sendProof(header: ProofHeader, records: readonly unknown[]): Promise<void>;
  ack(batchSeq: number): void;
  accepted(stepId: number, revision: number): void;
  cancel(): void;
  readonly maxUnacked: number;
}
export function createSender(
  send: (message: unknown) => void,
  key: RunKey,
  limits: Limits,
): Sender {
  let seq = 0,
    batch = 0,
    unacked = new Set<number>(),
    maximum = 0,
    cancelled = false;
  const waiters: (() => void)[] = [];
  // Re-read after each await: cancel() may have run while this send was parked.
  const isCancelled = () => cancelled;
  const frame = (type: string, extra: Record<string, unknown>) =>
    send({ protocol: 2, key, seq: ++seq, type, ...extra });
  return {
    async sendProof(header, records) {
      if (cancelled) throw Error("transport-cancelled");
      frame("proof-begin", { header });
      const chunks = encodeRecords(records, Math.min(limits.batchBytes, 64 * 1024));
      for (const bytes of chunks) {
        while (unacked.size >= Math.min(2, limits.inFlightBatches)) {
          await new Promise<void>((resolve) => waiters.push(resolve));
          if (isCancelled()) throw Error("transport-cancelled");
        }
        const id = ++batch;
        unacked.add(id);
        maximum = Math.max(maximum, unacked.size);
        frame("proof-chunk", { batchSeq: id, stepId: header.stepId, chunk: id - 1, bytes });
      }
      while (unacked.size) {
        await new Promise<void>((resolve) => waiters.push(resolve));
      }
      frame("proof-end", { stepId: header.stepId });
    },
    ack(id) {
      if (!unacked.delete(id)) return;
      while (waiters.length) defined(waiters.shift(), "waiter")();
    },
    accepted() {},
    cancel() {
      cancelled = true;
      while (waiters.length) defined(waiters.shift(), "waiter")();
      unacked.clear();
    },
    get maxUnacked() {
      return maximum;
    },
  };
}
