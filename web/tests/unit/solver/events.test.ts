import { expect, test } from "vitest";
import { invalidate } from "../../../src/solver/state/events";
import type { ChangeSet, Ledger } from "../../../src/solver/state/events";

const before = { problemKey: "problem", branch: "primary", revision: 2 }, after = { ...before, revision: 3 };
const changes: ChangeSet = { before, after, removed: [{ cell: 1, symbol: 1, positive: false }], placed: [],
  cells: [1], constraintIds: ["a"], coverIds: ["a:1"], relationIds: ["r"], graphChanged: true };
test("invalidates every affected dependency and all graph consumers while preserving unrelated exhaustion", () => {
  const ledger: Ledger = [
    { technique: "single@1", scopeKey: "one", state: before, status: "exhausted", dependencies: [{ kind: "cell", cell: 1 }], work: 3 },
    { technique: "single@1", scopeKey: "other", state: before, status: "exhausted", dependencies: [{ kind: "cell", cell: 7 }], work: 5 },
    { technique: "chain@1", scopeKey: "graph", state: before, status: "excluded", dependencies: [{ kind: "graph" }], work: 4, reason: "old" },
    ...(["cover", "relation", "constraint", "all"] as const).map(kind => ({ technique: "scope@1", scopeKey: kind, state: before, status: "exhausted" as const,
      dependencies: [kind === "all" ? { kind } : { kind, id: kind === "cover" ? "a:1" : kind === "relation" ? "r" : "a" }], work: 2 })),
  ];
  const result = invalidate(changes, ledger);
  expect(result.map(row => row.status)).toEqual(["pending", "exhausted", "pending", "pending", "pending", "pending", "pending"]);
  expect(result.every(row => row.state.revision === 3)).toBe(true);
  expect(result[2].reason).toBeUndefined();
  expect(ledger[0].status).toBe("exhausted");
  expect(Object.isFrozen(result[0].dependencies[0])).toBe(true);
});
test("retained ledger snapshots do not alias mutable change envelopes", () => {
  const mutable = { ...changes, after: { ...after } };
  const ledger: Ledger = [{ technique: "scan@1", scopeKey: "other", state: before,
    status: "exhausted", dependencies: [{ kind: "cell", cell: 7 }], work: 2 }];
  const result = invalidate(mutable, ledger);
  mutable.after.revision = 99;
  expect(result[0].state.revision).toBe(3);
});
test("discards stale cursors and unscoped exhaustion instead of carrying it to a new revision", () => {
  const ledger: Ledger = [
    { technique: "scan@1", scopeKey: "cursor", state: before, status: "in-progress", dependencies: [{ kind: "cell", cell: 7 }], work: 2 },
    { technique: "scan@1", scopeKey: "missing", state: before, status: "exhausted", dependencies: [], work: 2 },
    { technique: "scan@1", scopeKey: "stale", state: { ...before, revision: 1 }, status: "exhausted", dependencies: [{ kind: "cell", cell: 7 }], work: 2 },
  ];
  expect(invalidate(changes, ledger).map(row => row.status)).toEqual(["pending", "pending", "pending"]);
});
