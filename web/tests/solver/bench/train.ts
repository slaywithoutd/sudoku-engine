/**
 * Trainer (spec §3.9–3.10, plan T14). A plain fit with no external library:
 * per technique family, ridge-regularized least squares over the board
 * feature vector for `hit` (target 0/1024) and `cost` (work quanta to the
 * first checked proposal, censored at the cap) plus a constant `gain` (mean
 * accepted-step utility). Weights are emitted as x1024 integers for the
 * fixed-point estimator; families with fewer than MIN_POSITIVES positive
 * states in the calibration partition are refused and listed.
 */
import { createHash } from "node:crypto";
import {
  BOARD_FEATURE_NAMES,
  BOARD_FEATURE_SCHEMA,
} from "../../../src/solver/scheduling/features-board";
import type { EstimatorModel, FamilyModel } from "../../../src/solver/scheduling/estimator";
import { ESTIMATE_MAX, ESTIMATE_MIN, SCALE_SHIFT } from "../../../src/solver/scheduling/estimator";
import { QUANTUM } from "../../../src/solver/scheduling/work";
import type { StateSample } from "./sample";

export const TRAINER_VERSION = "trainer@1";
export const MIN_POSITIVES = 200;
/** Ridge strength relative to the sample count; keeps the normal equations well posed. */
const RIDGE = 1e-2;

export interface TrainingReport {
  readonly model: EstimatorModel;
  readonly fitted: readonly string[];
  readonly refused: readonly { id: string; positives: number; states: number }[];
  readonly samples: number;
  readonly samplesHash: string;
}

export function samplesHash(samples: readonly StateSample[]): string {
  return createHash("sha256").update(JSON.stringify(samples)).digest("hex");
}

/** Solves (A^T A + λI) w = A^T y by Gaussian elimination with partial pivoting. */
export function ridgeFit(
  rows: readonly (readonly number[])[],
  targets: readonly number[],
  lambda: number,
): number[] {
  const width = rows[0].length;
  const matrix = Array.from({ length: width }, () => Array<number>(width + 1).fill(0));
  rows.forEach((row, index) => {
    for (let i = 0; i < width; i += 1) {
      for (let j = 0; j < width; j += 1) matrix[i][j] += row[i] * row[j];
      matrix[i][width] += row[i] * targets[index];
    }
  });
  for (let i = 0; i < width; i += 1) matrix[i][i] += lambda;
  for (let column = 0; column < width; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < width; row += 1)
      if (Math.abs(matrix[row][column]) > Math.abs(matrix[pivot][column])) pivot = row;
    [matrix[column], matrix[pivot]] = [matrix[pivot], matrix[column]];
    const head = matrix[column][column];
    if (head === 0) continue;
    for (let row = 0; row < width; row += 1) {
      if (row === column) continue;
      const factor = matrix[row][column] / head;
      if (factor === 0) continue;
      for (let j = column; j <= width; j += 1) matrix[row][j] -= factor * matrix[column][j];
    }
  }
  return matrix.map((row, i) => (row[i] === 0 ? 0 : row[width] / row[i]));
}

function fixedPoint(weights: readonly number[]): { bias: number; weights: number[] } {
  const scaled = weights.map((weight) => Math.round(weight * 2 ** SCALE_SHIFT));
  return { bias: scaled[0], weights: scaled.slice(1) };
}

function clamp(value: number): number {
  return Math.max(ESTIMATE_MIN, Math.min(ESTIMATE_MAX, Math.round(value)));
}

export function train(
  samples: readonly StateSample[],
  identity: { policyId: string; corpusHash: string; trainerHash: string },
): TrainingReport {
  const calibration = samples.filter((sample) => sample.partition === "calibration");
  const perFamily = new Map<
    string,
    { rows: number[][]; hits: number[]; quanta: number[]; utilities: number[] }
  >();
  for (const sample of calibration) {
    const row = [1, ...sample.features];
    if (row.length !== BOARD_FEATURE_NAMES.length + 1) throw new Error("feature-schema-mismatch");
    for (const [id, [hit, work, utility]] of Object.entries(sample.techniques)) {
      const bucket = perFamily.get(id) ?? { rows: [], hits: [], quanta: [], utilities: [] };
      bucket.rows.push(row);
      bucket.hits.push(hit * ESTIMATE_MAX);
      bucket.quanta.push(Math.max(1, Math.ceil(work / QUANTUM)));
      if (hit) bucket.utilities.push(utility);
      perFamily.set(id, bucket);
    }
  }
  const families: Record<string, FamilyModel> = {};
  const fitted: string[] = [];
  const refused: { id: string; positives: number; states: number }[] = [];
  for (const [id, bucket] of [...perFamily].sort(([a], [b]) => (a < b ? -1 : 1))) {
    const positives = bucket.utilities.length;
    if (positives < MIN_POSITIVES) {
      refused.push({ id, positives, states: bucket.rows.length });
      continue;
    }
    const lambda = RIDGE * bucket.rows.length;
    const hit = fixedPoint(ridgeFit(bucket.rows, bucket.hits, lambda));
    const cost = fixedPoint(ridgeFit(bucket.rows, bucket.quanta, lambda));
    const gain = clamp(bucket.utilities.reduce((a, b) => a + b, 0) / positives);
    families[id] = { hit, cost, gain };
    fitted.push(id);
  }
  return {
    model: {
      id: identity.policyId,
      featureSchema: BOARD_FEATURE_SCHEMA,
      corpusHash: identity.corpusHash,
      trainerHash: identity.trainerHash,
      families,
    },
    fitted,
    refused,
    samples: calibration.length,
    samplesHash: samplesHash(samples),
  };
}
