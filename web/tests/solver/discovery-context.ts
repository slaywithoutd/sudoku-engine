import { IndexWorkspace } from "../../src/solver/indexes/workspace";
import type { DiscoveryContext } from "../../src/solver/techniques/types";
/** Test harness operation resources, never a production detector default. */
export function discoveryContext(): DiscoveryContext {
  return {
    workspace: new IndexWorkspace({ entryLimit: 1000000, byteLimit: 256000000 }),
    limits: {
      timeMs: 20000,
      workUnits: 10000000,
      exactNodes: 1000000,
      stepNodes: 4096,
      runNodes: 65536,
      proofBytes: 8000000,
      stepBytes: 2000000,
      batchBytes: 65536,
      inFlightBatches: 2,
      workspaceBytes: 256000000,
    },
  };
}
