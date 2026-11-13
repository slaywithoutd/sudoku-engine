import {
  solveClassic,
  countClassic,
  type ClassicSolveEvent,
  type ClassicMode,
} from "../solver/classic-run";
import { solveInputOf } from "./solve-request";

type WorkerRequest =
  | { readonly kind: "test-long" | "stop" }
  | {
      readonly kind: "solve-classic";
      readonly requestId: string;
      readonly givens: readonly number[];
      readonly mode?: ClassicMode;
      readonly timeLimitMs?: number;
      /**
       * A preset or a custom set's switched-off ids (M2.7, D105). Untrusted:
       * `solveProblem` shape-checks it and answers a malformed one with an
       * `error` result, never with a run of the full set.
       */
      readonly techniqueSelection?: unknown;
    }
  | { readonly kind: "count-classic"; readonly givens: readonly number[] };
type WorkerEvent =
  | { readonly kind: "stats" }
  | {
      readonly kind: "terminal";
      readonly outcome: "complete" | "timeout" | "resource-limit" | "error";
      readonly revision?: number;
      readonly result?: unknown;
    }
  | Exclude<ClassicSolveEvent, { kind: "result" }>;

let stopped = false;
const post = (event: WorkerEvent) => self.postMessage(event);
// postMessage data is untrusted; the guards below answer anything but a known request with an error.
self.onmessage = (event: MessageEvent<WorkerRequest | null | undefined>) => {
  const request = event.data;
  if (request?.kind === "stop") {
    stopped = true;
    return;
  }
  if (request?.kind === "solve-classic") {
    // One run per worker: the controller terminates the worker to cancel.
    const input = solveInputOf(request as unknown as Record<string, unknown>);
    if ("error" in input) {
      post({ kind: "terminal", outcome: "error", result: { code: input.error } });
      return;
    }
    solveClassic(input, {
      clock: { now: () => performance.now() },
      emit: (solveEvent) => {
        if (solveEvent.kind === "result")
          post({
            kind: "terminal",
            outcome: solveEvent.outcome,
            revision: solveEvent.steps,
            result: solveEvent,
          });
        else post(solveEvent);
      },
    }).catch((error: unknown) =>
      post({
        kind: "terminal",
        outcome: "error",
        result: { code: error instanceof Error ? error.message : "solver-error" },
      }),
    );
    return;
  }
  if (request?.kind === "count-classic") {
    try {
      post({
        kind: "terminal",
        outcome: "complete",
        result: countClassic(request.givens, { now: () => performance.now() }),
      });
    } catch (error) {
      post({
        kind: "terminal",
        outcome: "error",
        result: { code: error instanceof Error ? error.message : "solver-error" },
      });
    }
    return;
  }
  if (request?.kind !== "test-long") {
    post({ kind: "terminal", outcome: "error" });
    return;
  }
  stopped = false;
  let ticks = 0;
  const step = () => {
    if (stopped) return;
    if (ticks++ >= 1000) {
      post({ kind: "terminal", outcome: "complete" });
      return;
    }
    post({ kind: "stats" });
    setTimeout(step, 0);
  };
  step();
};
