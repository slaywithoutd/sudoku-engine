/**
 * M2.6 T08 benchmark page (spec §5 T08): runs the shipped classic pipeline in
 * a real browser module worker, one request per case, and reports what the
 * Solve screen would show. Driven by tests/e2e/solver-m26-benchmark.spec.ts.
 */
import { startWorker } from "../../src/app/solver-worker";
import { coverageEntries } from "../../src/solver/techniques/manifest";

const tiers = new Map(coverageEntries.map((entry) => [entry.version, entry.tier] as const));
interface Request {
  readonly id: string;
  readonly puzzle: string;
  readonly mode: "explain" | "analyze";
  readonly timeLimitMs: number;
}
function runOne(request: Request): Promise<Record<string, unknown>> {
  return new Promise((done) => {
    const started = performance.now();
    let steps = 0,
      maxTier = -1,
      firstHighTierMs: number | undefined,
      basic = 0,
      progressUnits = 0,
      logicalUnits = 0;
    const handle = startWorker(
      {
        kind: "solve-classic",
        givens: [...request.puzzle].map(Number),
        mode: request.mode,
        requestId: request.id,
        timeLimitMs: request.timeLimitMs,
      },
      {
        onEvent: (raw) => {
          const event = raw as {
            kind: string;
            technique?: string;
            workUnits?: number;
            result?: Record<string, unknown>;
          };
          if (event.kind === "progress") progressUnits = event.workUnits ?? progressUnits;
          if (event.kind === "step") {
            steps += 1;
            logicalUnits = event.workUnits ?? logicalUnits;
            const tier = tiers.get(event.technique ?? "") ?? -1;
            if (tier < 0) basic += 1;
            maxTier = Math.max(maxTier, tier);
            if (tier >= 5 && firstHighTierMs === undefined)
              firstHighTierMs = Math.round(performance.now() - started);
          } else if (event.kind === "terminal") {
            handle.terminate();
            const result = event.result ?? {};
            done({
              id: request.id,
              mode: request.mode,
              timeLimitMs: request.timeLimitMs,
              ms: Math.round(performance.now() - started),
              steps,
              basic,
              maxTier,
              firstHighTierMs,
              progressUnits,
              logicalUnits,
              outcome: result.outcome,
              human: result.human,
              count: result.count,
              stopReason: result.stopReason,
              countVerifiedMs: result.countVerifiedMs,
              highestTierTried: (result.coverage as { highestTierTried?: number } | undefined)
                ?.highestTierTried,
              logicalValues: (result.logicalValues as number[] | undefined)?.join(""),
            });
          }
        },
        onError: () => {
          handle.terminate();
          done({ id: request.id, error: true });
        },
      },
    );
  });
}
(window as unknown as { m26bench: unknown }).m26bench = async (requests: Request[]) => {
  const results = [];
  for (const request of requests) results.push(await runOne(request));
  document.querySelector("#status")!.textContent = "Done";
  return results;
};
document.querySelector("#status")!.textContent = "Ready";
