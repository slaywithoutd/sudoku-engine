import type { RunKey, StateKey } from "../snapshot";
import type { Effect } from "../proof/types";
import type { Limits } from "../limits";

export type ProofHeader = {
  readonly stepId: number;
  readonly state: StateKey;
  readonly technique: string;
  readonly effects: readonly Effect[];
  readonly roots: readonly number[];
  readonly imports: readonly number[];
  readonly pattern: unknown;
  readonly nodeCount: number;
  readonly byteCount: number;
  readonly chunkCount: number;
};
export type WorkerMessage = {
  readonly protocol: 2;
  readonly key: RunKey;
  readonly seq: number;
  readonly type: string;
  readonly [name: string]: unknown;
};
const runFields = [
  "requestId",
  "snapshotId",
  "inputRevision",
  "problemKey",
  "operation",
  "mode",
  "engine",
  "profile",
  "scheduler",
  "checker",
  "exact",
  "optionsKey",
  "parentEvidenceId",
] as const;
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw Error("protocol-object");
  return value as Record<string, unknown>;
}
function validKey(value: unknown): value is RunKey {
  const item = object(value);
  return (
    runFields.every((field) => Object.hasOwn(item, field)) &&
    typeof item.requestId === "string" &&
    typeof item.snapshotId === "string" &&
    typeof item.problemKey === "string" &&
    typeof item.optionsKey === "string" &&
    Number.isSafeInteger(item.inputRevision) &&
    (item.operation === "primary" || item.operation === "conditional") &&
    (item.mode === "explain" || item.mode === "analyze")
  );
}
export function decodeMessage(value: unknown): WorkerMessage {
  const item = object(value);
  if (
    item.protocol !== 2 ||
    typeof item.seq !== "number" ||
    !Number.isSafeInteger(item.seq) ||
    item.seq < 1 ||
    typeof item.type !== "string" ||
    !validKey(item.key)
  )
    throw Error("protocol-envelope");
  if (item.type === "proof-chunk" && !(item.bytes instanceof Uint8Array))
    throw Error("protocol-chunk");
  return item as WorkerMessage;
}
export type { Limits };
