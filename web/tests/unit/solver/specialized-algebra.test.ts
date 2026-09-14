import { expect, test } from "vitest";
import fixtures from "../../solver/fixtures/C31.json";
import { independentExocet } from "../../solver/specialized-algebra";

test.each(fixtures)("$id independently proves every declared Junior/Double removal",f=> {
 const relation=independentExocet(f);expect(relation.rows.length).toBeGreaterThan(0);
 for(const effect of f.expectedEffects)expect(relation.rows.filter(row=>row[relation.cells.indexOf(effect.cell)]===effect.symbol),JSON.stringify(effect)).toEqual([]);
});
test.each(["companion","cross-line","S-cells","assigned-S","cover-house","base-symbols"])("independent Junior checker rejects malformed %s geometry",mutation=> {
 const f:any=structuredClone(fixtures[0]),p=f.expectedPattern;
 if(mutation==="companion")p.companions[0]=p.base[0];
 if(mutation==="cross-line")p.crossLines[0]=p.crossLines[1];
 if(mutation==="S-cells")p.sCells.pop();
 if(mutation==="assigned-S")p.covers.find((c:any)=>c.assignedOccurrences.length).assignedOccurrences=[];
 if(mutation==="cover-house")p.covers[0].houses=["row:0"];
 if(mutation==="base-symbols")p.baseSymbols.pop();
 expect(()=>independentExocet(f)).toThrow();
});
