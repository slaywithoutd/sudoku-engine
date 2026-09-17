import { canonicalProblem, ProblemInputError } from "./problem";
import type { BranchId, EngineProblem, ProblemKey, VersionId } from "./problem";

export type SourceRef =
  | { kind: "manual" | "paste" }
  | {
      kind: "draft" | "puzzle";
      id: string;
      name: string;
      libraryRevision: number;
      unsaved: boolean;
    };

export interface SolverSnapshot {
  snapshotId: string;
  inputRevision: number;
  problem: EngineProblem;
  source: SourceRef;
}

export interface RunKey {
  requestId: string;
  snapshotId: string;
  inputRevision: number;
  problemKey: ProblemKey;
  operation: "primary" | "conditional";
  mode: "explain" | "analyze";
  engine: VersionId;
  profile: VersionId;
  scheduler: VersionId;
  checker: VersionId;
  exact: VersionId;
  optionsKey: string;
  parentEvidenceId: string | null;
}

export interface StateKey {
  problemKey: ProblemKey;
  branch: BranchId;
  revision: number;
}

function assertFields(value: object, allowed: readonly string[]): void {
  const unknown = Object.keys(value).find((key) => !allowed.includes(key));
  if (unknown !== undefined)
    throw new ProblemInputError("unknown-field", `source contains unknown field ${unknown}`);
  const missing = allowed.find((key) => !Object.hasOwn(value, key));
  if (missing !== undefined)
    throw new ProblemInputError("missing-field", `source is missing ${missing}`);
}

/** What a source reference may contain before validation. */
type SourceClaim = {
  readonly kind?: unknown;
  readonly id?: unknown;
  readonly name?: unknown;
  readonly libraryRevision?: unknown;
  readonly unsaved?: unknown;
};

function copySource(source: SourceRef): SourceRef {
  const claim = source as SourceClaim | null | undefined;
  if (claim === null || typeof claim !== "object" || Array.isArray(claim))
    throw new ProblemInputError("invalid-source", "source must be an object");
  if (claim.kind === "manual" || claim.kind === "paste") {
    assertFields(claim, ["kind"]);
    return Object.freeze({ kind: claim.kind });
  }
  if (claim.kind !== "draft" && claim.kind !== "puzzle")
    throw new ProblemInputError("invalid-source", "source.kind is unsupported");
  assertFields(claim, ["kind", "id", "name", "libraryRevision", "unsaved"]);
  if (
    typeof claim.id !== "string" ||
    claim.id.length === 0 ||
    typeof claim.name !== "string" ||
    typeof claim.libraryRevision !== "number" ||
    !Number.isSafeInteger(claim.libraryRevision) ||
    claim.libraryRevision < 0 ||
    typeof claim.unsaved !== "boolean"
  )
    throw new ProblemInputError("invalid-source", "source metadata is malformed");
  return Object.freeze({
    kind: claim.kind,
    id: claim.id,
    name: claim.name,
    libraryRevision: claim.libraryRevision,
    unsaved: claim.unsaved,
  });
}

/** Captures an isolated, immutable solver input without retaining editor objects. */
export function makeSnapshot(
  problem: EngineProblem,
  source: SourceRef,
  snapshotId: string,
  inputRevision: number,
): SolverSnapshot {
  if (typeof snapshotId !== "string" || snapshotId.length === 0)
    throw new ProblemInputError("invalid-snapshot-id", "snapshotId must be non-empty");
  if (!Number.isSafeInteger(inputRevision) || inputRevision < 0)
    throw new ProblemInputError("invalid-revision", "inputRevision must be non-negative");
  return Object.freeze({
    snapshotId,
    inputRevision,
    problem: canonicalProblem(problem),
    source: copySource(source),
  });
}
