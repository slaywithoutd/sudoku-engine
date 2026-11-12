import { expect, test } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * M2.6 T08 benchmark (spec §5 T08, §6): the evaluation corpus's named cases
 * and every unique case through the real worker at the UI presets, in this
 * Playwright browser. Runs only with M26_BENCH=1; M26_BENCH_OUT=<file>
 * receives the raw rows; tests/browser/m26-bench-table.mjs turns them into the
 * table of docs/history/m26-benchmark.md.
 */
const corpus = JSON.parse(
  readFileSync(resolve(process.cwd(), "tests/solver/bench/eval-corpus.json"), "utf8"),
) as { cases: { id: string; puzzle: string; family: string; count: string }[] };
const bench = process.env.M26_BENCH === "1";
test.skip(!bench, "set M26_BENCH=1");
test("M2.6 presets on the evaluation corpus", async ({ page, browserName }) => {
  test.setTimeout(3_600_000);
  await page.goto("/tests/browser/solver-bench.html");
  await expect(page.getByRole("status")).toHaveText("Ready");
  const presets = (process.env.M26_BENCH_PRESETS ?? "15000").split(",").map(Number);
  const runs = Number(process.env.M26_BENCH_RUNS ?? 1);
  const ids = process.env.M26_BENCH_IDS?.split(",");
  const cases = corpus.cases.filter((entry) =>
    ids
      ? ids.includes(entry.id)
      : entry.family === "named" || entry.family === "derived" || entry.count === "1",
  );
  const modes = (process.env.M26_BENCH_MODES ?? "explain,analyze").split(",") as (
    "explain" | "analyze"
  )[];
  const requests = presets.flatMap((timeLimitMs) =>
    Array.from({ length: runs }, () =>
      cases.flatMap((entry) =>
        modes.map((mode) => ({
          id: entry.id,
          puzzle: entry.puzzle,
          mode,
          timeLimitMs,
        })),
      ),
    ).flat(),
  );
  const rows = await page.evaluate(
    (all) => (window as unknown as { m26bench: (r: unknown) => Promise<unknown[]> }).m26bench(all),
    requests,
  );
  if (process.env.M26_BENCH_OUT)
    writeFileSync(process.env.M26_BENCH_OUT, JSON.stringify({ browserName, rows }, null, 1));
  expect(rows.length).toBe(requests.length);
  // A worker error is a failed benchmark, not a row.
  expect(rows.filter((row) => (row as { error?: boolean }).error)).toEqual([]);
});
