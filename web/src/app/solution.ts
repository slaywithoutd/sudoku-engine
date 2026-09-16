import type { Value } from "../domain/model";
import { startWorker } from "./solver-worker";

const cache = new Map<string, Promise<readonly number[] | null>>();
/**
 * The unique solution of a clue set, found by the independent exact search in
 * a worker; null when the puzzle has zero or several solutions or the search
 * was inconclusive. Results are cached per clue string for the session.
 */
export function uniqueSolution(givens: readonly Value[]): Promise<readonly number[] | null> {
  const key = givens.join("");
  let pending = cache.get(key);
  if (!pending) {
    pending = new Promise((resolve) => {
      const handle = startWorker(
        { kind: "count-classic", givens: [...givens] },
        {
          onEvent(event) {
            if (event.kind !== "terminal") return;
            handle.terminate();
            const result = (event as { result?: { kind?: string; solution?: number[] } }).result;
            resolve(result?.kind === "unique" && result.solution ? result.solution : null);
          },
          onError() {
            resolve(null);
          },
        },
      );
    });
    cache.set(key, pending);
  }
  return pending;
}
