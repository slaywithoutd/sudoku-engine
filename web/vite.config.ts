import { defineConfig } from "vitest/config";
import { sites } from "@openai/sites-vite-plugin";

export default defineConfig({
  plugins: [sites()],
  server: { host: "localhost", port: 5173, strictPort: true },
  build: {
    rollupOptions: {
      input: {
        index: "index.html",
        sitesWorker: "src/sites-worker.ts",
      },
      output: {
        entryFileNames(chunk) {
          return chunk.name === "sitesWorker" ? "server/index.js" : "assets/[name]-[hash].js";
        },
      },
    },
  },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts", "tests/storage/**/*.test.ts"],
    // These independent proof fixtures are CPU-bound and their limits measure
    // wall time. Run files serially so host scheduling cannot change outcomes.
    fileParallelism: false,
    testTimeout: 120_000,
  },
});
