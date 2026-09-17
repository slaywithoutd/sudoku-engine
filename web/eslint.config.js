// typescript-eslint is loaded from tooling/lint so it can use its own
// TypeScript 6 compiler API while `tsc` stays on TypeScript 7.
import { globals, tseslint } from "./tooling/lint/index.js";

const readabilityRules = {
  "max-statements-per-line": ["error", { max: 1 }],
  "@typescript-eslint/no-non-null-assertion": "error",
  "@typescript-eslint/no-unnecessary-condition": "error",
  "id-length": ["warn", { min: 2, exceptions: ["i", "j", "k", "x", "y", "n", "_"] }],
  "max-len": ["warn", { code: 100, ignoreStrings: true, ignoreUrls: true }],
  complexity: ["warn", 15],
  "max-lines-per-function": ["warn", { max: 60, skipBlankLines: true, skipComments: true }],
};

export default tseslint.config(
  {
    ignores: ["dist/", "node_modules/", "tooling/", "test-results/", "playwright-report/"],
  },
  {
    files: ["src/**/*.ts", "tests/**/*.ts"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        project: ["./tsconfig.json", "./tsconfig.worker.json"],
        tsconfigRootDir: import.meta.dirname,
      },
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: { "@typescript-eslint": tseslint.plugin },
    rules: readabilityRules,
  },
  {
    files: ["*.config.ts"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        projectService: {
          allowDefaultProject: [
            "playwright.benchmark.config.ts",
            "playwright.production.config.ts",
          ],
        },
        tsconfigRootDir: import.meta.dirname,
      },
      globals: globals.node,
    },
    plugins: { "@typescript-eslint": tseslint.plugin },
    rules: readabilityRules,
  },
);
