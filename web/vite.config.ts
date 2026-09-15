import { defineConfig } from "vitest/config";
export default defineConfig({
  server: { host: "localhost", port: 5173, strictPort: true },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts", "tests/storage/**/*.test.ts"],
    // These independent proof fixtures are CPU-bound and their limits measure
    // wall time. Run files serially so host scheduling cannot change outcomes.
    fileParallelism: false,
    testTimeout: 120_000,
  },
});
