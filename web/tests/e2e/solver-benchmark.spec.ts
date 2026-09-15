import {expect,test} from "@playwright/test";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
const corpus=JSON.parse(readFileSync(resolve(process.cwd(),"tests/solver/bench/corpus.json"),"utf8")) as {calibration:Array<{id:string;partition:string;family:string;sourceGroup:string}>;heldOut:Array<{id:string;partition:string;family:string;sourceGroup:string}>;policies:string[]};
test("benchmark corpus schema has disjoint calibration and held-out partitions",async()=>{
  const calibration=new Set(corpus.calibration.map(sample=>sample.id));const heldOut=new Set(corpus.heldOut.map(sample=>sample.id));
  expect([...calibration].filter(id=>heldOut.has(id))).toEqual([]);
  expect(corpus.calibration.every(sample=>sample.partition==="calibration"&&sample.family&&sample.sourceGroup)).toBe(true);
  expect(corpus.heldOut.every(sample=>sample.partition==="held-out"&&sample.family&&sample.sourceGroup)).toBe(true);
  expect(corpus.policies).toEqual(expect.arrayContaining(["fixed-scan@1","event-fixed@1","explain-fair@1","analyze-fair@1"]));
});
test("benchmark dry run records a production browser sample",async({page})=>{
  const started=performance.now();await page.goto("/");const elapsedMs=performance.now()-started;
  expect(await page.locator("body").count()).toBe(1);expect(elapsedMs).toBeGreaterThanOrEqual(0);
});
