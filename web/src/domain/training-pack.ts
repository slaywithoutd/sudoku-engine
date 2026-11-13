/**
 * The training pack (spec §5.1, D106): positions harvested offline from
 * checked Explain traces by `tests/solver/bench/training-pack.ts`. The app
 * reads it as data; nothing here imports the solver.
 */
export const TRAINING_PACK_SCHEMA = "training-pack@1";

export type PositionKind = "scan" | "technique";

export interface TrainingPosition {
  /** sha256 of givens, values and kind (16 hex digits). */
  readonly id: string;
  readonly kind: PositionKind;
  /** 81 digits each, 0 for an open cell; `values` includes the givens. */
  readonly givens: string;
  readonly values: string;
  /** Technique positions only: the engine's candidates before the key step, 0 on a filled cell. */
  readonly candidates?: readonly number[];
  readonly solution: string;
  /** Catalogue tier, versioned technique id and display name of the key step. */
  readonly tier: number;
  readonly technique: string;
  readonly name: string;
  /** Pattern cells and removed [cell, digit] candidates of the key step. */
  readonly cells: readonly number[];
  readonly removed: readonly (readonly [number, number])[];
  /** [cell, digit] placements that are singles once the key step is applied. */
  readonly targets: readonly (readonly [number, number])[];
  readonly source: {
    readonly seed: number;
    readonly step: number;
    readonly policy: string;
    readonly method: string;
  };
}

export interface TrainingPack {
  readonly schema: typeof TRAINING_PACK_SCHEMA;
  readonly generator: string;
  readonly license: "repository-generated";
  readonly policy: string;
  readonly seeds: { readonly base: number; readonly tried: number };
  readonly positions: readonly TrainingPosition[];
}

export function digitsOf(grid: string): number[] {
  return [...grid].map(Number);
}

let loading: Promise<TrainingPack> | undefined;
/** The committed pack, fetched on first use as its own chunk. */
export function loadTrainingPack(): Promise<TrainingPack> {
  loading ??= import("../assets/training-pack.json").then((module) => {
    const pack = module.default as unknown as TrainingPack;
    if (pack.schema !== TRAINING_PACK_SCHEMA || !Array.isArray(pack.positions))
      throw new Error("The training pack could not be read.");
    return pack;
  });
  loading.catch(() => (loading = undefined));
  return loading;
}
