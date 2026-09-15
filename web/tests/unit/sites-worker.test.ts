import { expect, test } from "vitest";
import worker from "../../src/sites-worker";

test("forwards requests to the static-assets binding", async () => {
  const request = new Request("https://example.test/library");
  const response = new Response("Sudoku Engine");
  let received: Request | undefined;

  const result = await worker.fetch(request, {
    ASSETS: {
      fetch(value: Request) {
        received = value;
        return Promise.resolve(response);
      },
    },
  });

  expect(received).toBe(request);
  expect(await result.text()).toBe("Sudoku Engine");
});
