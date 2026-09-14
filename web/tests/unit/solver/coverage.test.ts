import { discoveryContext } from "../../solver/discovery-context";
import { expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { coverageEntries, validateCoverage, aliasMappings, unsupportedAliases } from "../../../src/solver/techniques/manifest";
import { getTechniques, assembleTechniqueJobs } from "../../../src/solver/techniques/registry";
import { fixtureCase, fixtureView } from "../../solver/acceptance";

test("preserves exact UTF8 matrix bounds for every catalogue row", () => {
  const source=readFileSync(new URL("../../../../docs/superpowers/specs/2026-09-12-m2-technique-coverage.md",import.meta.url),"utf8");
  const rows=source.split(/\r?\n/).filter(line=>/^\| [CU]\d\d/.test(line));
  expect(rows).toHaveLength(38);
  for(const line of rows){
    const columns=line.split("|").slice(1,-1).map(value=>value.trim());
    const id=columns[0].slice(0,3), direct=id.startsWith("C") && Number(id.slice(1))<=24;
    expect(coverageEntries.find(entry=>entry.id===id)?.bounds,id).toBe(columns[direct?3:2]);
  }
});

test("catalogues all 38 exact matrix rows and only independently accepted implementations", () => {
  expect(coverageEntries).toHaveLength(38);
  expect(new Set(coverageEntries.map(e => e.id)).size).toBe(38);
  expect(coverageEntries.filter(e => e.id > "C33").every(e => e.status === "independently-verified")).toBe(true);
  expect(coverageEntries.find(e=>e.id==="C33")?.status).toBe("independently-verified");
  expect(coverageEntries.filter(e=>e.id>="C25"&&e.id<="C28").every(e=>e.status==="implemented")).toBe(true);
  expect(validateCoverage(coverageEntries)).toEqual([]);
  expect(coverageEntries.filter(e=>e.status==="independently-verified").map(e=>e.id)).toEqual(["C01","C02","C03","C04","C05","C06","C07","C08","C09","C10","C11","C12","C13","C14","C15","C16","C17","C18","C19","C20","C21","C22","C23","C24","C29","C30","C31","C32","C33","U01","U02","U03","U04","U05"]);
  expect(new Set(aliasMappings.map(e=>e.alias)).size).toBe(aliasMappings.length);
  expect(unsupportedAliases.every(e=>e.reason && e.nearestSupportedForm)).toBe(true);
  expect(getTechniques("classic-expanded@1")).toHaveLength(33);
  expect(getTechniques("classic-conditional@1")).toHaveLength(38);
});
test("partial catalogue cannot start an expanded run or silently stall as exhausted", () => {
  const view=fixtureView(fixtureCase("C01-one-hole"));
  expect(()=>assembleTechniqueJobs(view.assembly,"classic-expanded@1")).toThrow("profile-incomplete");
  const fake={...view.assembly,problem:{...view.assembly.problem,constraints:Array(230).fill(view.assembly.problem.constraints[0])}};
  expect(()=>assembleTechniqueJobs(fake,"classic-expanded@1")).toThrow("profile-job-limit");
  const future=getTechniques("classic-conditional@1").find(t=>t.id==="u01@1")!;
  expect(future.eligible(view)).toEqual({kind:"yes"});
  expect([...future.discover(view, discoveryContext())]).toEqual([{kind:"disabled",reason:"missing-unique-authority"}]);
});
test("refuses unsupported profile versions and verified rows lacking independent evidence", () => {
  expect(() => getTechniques("classic-expanded@2")).toThrow("unknown-profile");
  const fake = coverageEntries.map((e,i) => i ? e : { ...e, status: "independently-verified" as const,
    evidence: e.evidence.filter(record=>record.kind!=="independent-oracle") });
  expect(validateCoverage(fake)).toContain("missing-independent-evidence");
  const unknown = coverageEntries.map((e,i)=>i?e:{...e,aliases:[...e.aliases,"invented technique alias"]});
  expect(validateCoverage(unknown)).toContain("unknown-alias");
});

test("reviewed U rows retain complete per-alias evidence",()=>{
 const proposed=coverageEntries.map(e=>e.id.startsWith("U")?{...e,status:"independently-verified" as const}:e);
 expect(validateCoverage(proposed)).toEqual([]);
 expect(coverageEntries.filter(e=>e.id.startsWith("U")).every(e=>e.status==="independently-verified")).toBe(true);
});

test("C25-C28 have complete evidence for review without promoting live statuses", () => {
  const pending = coverageEntries.filter(
    (entry) => entry.id >= "C25" && entry.id <= "C28",
  );
  expect(pending).toHaveLength(4);
  expect(pending.every((entry) => entry.status === "implemented")).toBe(true);

  const projected = coverageEntries.map((entry) =>
    entry.id >= "C25" && entry.id <= "C28"
      ? { ...entry, status: "independently-verified" as const }
      : entry,
  );
  expect(validateCoverage(projected)).toEqual([]);

  const view = fixtureView(fixtureCase("C01-one-hole"));
  expect(() =>
    assembleTechniqueJobs(view.assembly, "classic-expanded@1"),
  ).toThrow("profile-incomplete");
});
