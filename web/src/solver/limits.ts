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

/**
 * Structural M2 safety ceilings, not runtime defaults or custom-grid support.
 * 256 rules is necessary but not sufficient: the later profile assembly must
 * also keep the combined rule/technique job count within the protocol's 256.
 */
export const M2_ROOT_LIMITS = Object.freeze({
  cells: 81,
  symbols: 9,
  rules: 256,
  allDifferent: 256,
  covers: 2304,
  nodes: 2978, // 81 domains + 81 clues + 256 rules + 256 scopes + 2304 covers.
  scopeCells: 81,
  identifierCharacters: 16 * 1024,
});
