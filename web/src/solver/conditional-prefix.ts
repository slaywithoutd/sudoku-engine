import type { DeductionProposal, Limits, ProofNode } from "./proof/types";
import { captureProofRecord } from "./proof/checker";
import { requireProof } from "./proof/primitives";
import type { IndexWorkspace, WorkspaceReservation } from "./indexes/workspace";

export interface ConditionalPrefixDescriptor {
  readonly bundles: number;
  readonly nodes: number;
  readonly bytes: number;
  readonly digest: string;
}
export interface CapturedConditionalPrefix {
  readonly descriptor: ConditionalPrefixDescriptor;
  readonly proposals: readonly DeductionProposal[];
  /** Transferred ownership: the receiver disposes this after its operation ends. */
  readonly lease: WorkspaceReservation;
}
const encoder = new TextEncoder();
/** Property order is canonical within each already bounded, captured record. */
function encode(value: unknown): Uint8Array {
  return encoder.encode(
    JSON.stringify(value, (_key, item) =>
      item && typeof item === "object" && !Array.isArray(item)
        ? Object.fromEntries(
            Object.keys(item)
              .sort()
              .map((key) => [key, item[key]]),
          )
        : item,
    ),
  );
}
function data(value: unknown, key: string): any {
  requireProof(value !== null && typeof value === "object", "conditional-prefix-data");
  const property = Object.getOwnPropertyDescriptor(value, key);
  requireProof(property?.enumerable && "value" in property, "conditional-prefix-data");
  return property.value;
}
function shape(value: unknown, keys: readonly string[]): void {
  requireProof(
    value !== null &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null),
    "conditional-prefix-data",
  );
  const actual = Reflect.ownKeys(value);
  requireProof(
    actual.length === keys.length && actual.every((k) => typeof k === "string" && keys.includes(k)),
    "conditional-prefix-fields",
  );
  keys.forEach((k) => data(value, k));
}
function boundedArray(value: unknown, cap: number): asserts value is readonly unknown[] {
  requireProof(Array.isArray(value) && value.length <= cap, "conditional-prefix-array");
}

/**
 * Domain-separated SHA-256 framing: each bundle hashes its bounded header hash
 * followed by ordered node hashes; the prefix hashes ordered bundle hashes and
 * exact bundle/node/byte counts. No whole bundle or prefix is stringified.
 * The helper issues DATA ONLY; a matching digest never grants proof authority.
 */
export async function captureConditionalPrefix(
  input: readonly DeductionProposal[],
  limits: Limits,
  workspace: IndexWorkspace,
  charge: (units: number) => void,
  active: () => boolean,
  copy: boolean,
): Promise<CapturedConditionalPrefix> {
  boundedArray(input, limits.runNodes);
  const bundleCount = input.length;
  const lease = workspace.reserve(bundleCount + 1, bundleCount * 64 + 128),
    proposals: DeductionProposal[] = [];
  let nodes = 0,
    bytes = 0,
    done = false;
  const checkpoint = (units = 1) => {
    workspace.checkpoint();
    charge(units);
    requireProof(active(), "revoked-unique-authority");
  };
  const hash = async (value: Uint8Array): Promise<Uint8Array> => {
    checkpoint(Math.max(1, Math.ceil(value.byteLength / 1024)));
    const output = new Uint8Array(await crypto.subtle.digest("SHA-256", value as BufferSource));
    checkpoint();
    return output;
  };
  let prefixBufferLease: WorkspaceReservation | undefined;
  try {
    requireProof(Reflect.ownKeys(input).length === bundleCount + 1, "conditional-prefix-array");
    prefixBufferLease = workspace.reserve(1, (bundleCount + 1) * 32 + 128);
    const bundleHashes = new Uint8Array((bundleCount + 1) * 32);
    for (let right = 0; right < bundleCount; right++) {
      checkpoint();
      const proposal = data(input, String(right));
      shape(proposal, ["technique", "state", "effects", "proof", "pattern"]);
      const proof = data(proposal, "proof");
      shape(proof, ["state", "nodes", "imports", "roots"]);
      const wireNodes = data(proof, "nodes");
      boundedArray(wireNodes, limits.stepNodes);
      const nodeCount = wireNodes.length;
      nodes += nodeCount;
      requireProof(nodes <= limits.runNodes, "conditional-prefix-node-limit");
      const header = {
        technique: data(proposal, "technique"),
        state: data(proposal, "state"),
        effects: data(proposal, "effects"),
        pattern: data(proposal, "pattern"),
        proof: {
          state: data(proof, "state"),
          imports: data(proof, "imports"),
          roots: data(proof, "roots"),
          nodes: [],
        },
      };
      const bundleLease = workspace.reserve(1, (nodeCount + 1) * 48 + 16384 * 12);
      try {
        requireProof(
          Reflect.ownKeys(wireNodes).length === nodeCount + 1,
          "conditional-prefix-array",
        );
        const framed = new Uint8Array((nodeCount + 1) * 32);
        const captured = captureProofRecord(header, 16384);
        let bundleBytes = captured.bytes + Math.max(0, nodeCount - 1);
        requireProof(bundleBytes <= limits.stepBytes, "conditional-prefix-step-limit");
        const encoded = encode(captured.value);
        framed.set(await hash(encoded), 0);
        const copiedNodes: ProofNode[] = [];
        if (copy) lease.grow(1, captured.bytes * 2 + nodeCount * 16 + 1024);
        for (let n = 0; n < nodeCount; n++) {
          checkpoint();
          const nodeLease = workspace.reserve(1, 16384 * 12);
          try {
            const node = captureProofRecord(data(wireNodes, String(n)) as ProofNode, 16384);
            bundleBytes += node.bytes;
            requireProof(bundleBytes <= limits.stepBytes, "conditional-prefix-step-limit");
            framed.set(await hash(encode(node.value)), (n + 1) * 32);
            if (copy) {
              lease.grow(1, node.bytes * 2 + 512);
              copiedNodes.push(node.value);
            }
          } finally {
            nodeLease.dispose();
          }
        }
        bytes += bundleBytes;
        requireProof(bytes <= limits.proofBytes, "conditional-prefix-byte-limit");
        // Framing includes a header in slot zero, so an empty bundle differs
        // from no bundle, and node/bundle boundaries cannot concatenate away.
        bundleHashes.set(await hash(framed), (right + 1) * 32);
        proposals.push(
          copy
            ? Object.freeze({
                ...captured.value,
                proof: Object.freeze({
                  ...captured.value.proof,
                  nodes: Object.freeze(copiedNodes),
                }),
              })
            : proposal,
        );
      } finally {
        bundleLease.dispose();
      }
    }
    bundleHashes.set(
      await hash(encoder.encode(`conditional-prefix@1:${bundleCount}:${nodes}:${bytes}`)),
      0,
    );
    const digest = Array.from(await hash(bundleHashes), (right) =>
      right.toString(16).padStart(2, "0"),
    ).join("");
    done = true;
    return Object.freeze({
      descriptor: Object.freeze({ bundles: bundleCount, nodes, bytes, digest }),
      proposals: Object.freeze(proposals),
      lease,
    });
  } finally {
    prefixBufferLease?.dispose();
    if (!done) lease.dispose();
  }
}
