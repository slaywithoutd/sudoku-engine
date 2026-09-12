import { defineConfig } from "vitest/config";
export default defineConfig({
  server: { host: "localhost", port: 5173, strictPort: true },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts", "tests/storage/**/*.test.ts"],
  },
});
