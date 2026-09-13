/** Shared resource ceilings; consumers charge initialization and retained proofs. */
export interface Limits {
  timeMs: number;
  workUnits: number;
  exactNodes: number;
  stepNodes: number;
  runNodes: number;
  proofBytes: number;
  stepBytes: number;
  batchBytes: number;
  inFlightBatches: number;
  workspaceBytes: number;
}
