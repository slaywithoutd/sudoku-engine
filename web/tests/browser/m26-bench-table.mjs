// M2.6 T08: the per-case table of docs/history/m26-benchmark.md from the raw
// rows of solver-m26-benchmark.spec.ts (M26_BENCH_OUT). Usage:
//   node tests/browser/m26-bench-table.mjs <rows.json> [<rows.json> ...]
// Runs of one case, mode and preset are grouped in file order. "Same result"
// compares the step sequence, final grid, status and stop reason.
import { readFileSync } from "node:fs";

const rows = process.argv.slice(2).flatMap((file) => JSON.parse(readFileSync(file, "utf8")).rows);
const groups = new Map();
for (const row of rows) {
  if (row.error) throw new Error(`worker error on ${row.id}`);
  const key = `${row.timeLimitMs}|${row.id}|${row.mode}`;
  groups.set(key, [...(groups.get(key) ?? []), row]);
}
const all = (list, field) => list.map((r) => r[field] ?? "–").join(" / ");
const same = (list, field) => list.every((r) => r[field] === list[0][field]);
console.log(
  "| Case | Mode | Preset | ms | Count verified ms | Logic | Stop reason | Steps | Highest tier tried | First tier-5/6 step ms | Same result |",
);
console.log("| --- | --- | ---: | ---: | ---: | --- | --- | ---: | ---: | ---: | :-: |");
for (const list of groups.values()) {
  const [first] = list;
  const result = ["stepTrace", "logicalValues", "human", "stopReason"].every((f) => same(list, f));
  const steps = same(list, "steps") ? first.steps : all(list, "steps");
  const tier = same(list, "highestTierTried") ? first.highestTierTried : all(list, "highestTierTried");
  console.log(
    `| ${first.id} | ${first.mode} | ${first.timeLimitMs / 1000} s | ${all(list, "ms")} | ${all(list, "countVerifiedMs")} | ${all(list, "human")} | ${all(list, "stopReason")} | ${steps} | ${tier} | ${all(list, "firstHighTierMs")} | ${result ? "yes" : "no"} |`,
  );
}
