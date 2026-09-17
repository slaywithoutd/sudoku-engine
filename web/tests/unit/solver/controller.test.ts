import { expect, test } from "vitest";
import { createSolverController } from "../../../src/app/solver-controller";

function fakeWorker() {
  const callbacks: Array<(event: unknown) => void> = [];
  return {
    start(
      _request: unknown,
      handlers: { onEvent(event: unknown): void; onError(error: Error): void },
    ) {
      callbacks.push(handlers.onEvent);
      return { terminate() {} };
    },
    deliver(index: number, event: unknown) {
      callbacks[index](event);
    },
  };
}

test("cancel invalidates the request before a late result", () => {
  const worker = fakeWorker();
  const solver = createSolverController({
    clock: { now: () => 0 },
    newId: () => "r",
    workerFactory: worker,
  });

  solver.start();
  solver.cancel("user");
  worker.deliver(0, { kind: "terminal", outcome: "complete" });

  expect(solver.snapshot().outcome).toBe("cancelled");
  solver.dispose();
});

test("a replacement run rejects the previous worker terminal event", () => {
  const worker = fakeWorker();
  const solver = createSolverController({
    clock: { now: () => 0 },
    newId: () => "r",
    workerFactory: worker,
  });

  solver.start();
  solver.start();
  worker.deliver(0, { kind: "terminal", outcome: "complete" });

  expect(solver.snapshot().outcome).toBe("running");
  worker.deliver(1, { kind: "terminal", outcome: "complete" });
  expect(solver.snapshot().outcome).toBe("complete");
  solver.dispose();
});
