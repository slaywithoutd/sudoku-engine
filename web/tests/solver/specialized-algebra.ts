/** Independent direct-coordinate finite checker. No production imports,
 * detector helpers, primitive arithmetic or exact solver participates. */
export const independentDigits=(mask:number)=>[1,2,3,4,5,6,7,8,9].filter(s=>Math.floor(mask/2**(s-1))%2===1);
export const independentPeer=(a:number,b:number)=>a!==b&&(Math.floor(a/9)===Math.floor(b/9)||a%9===b%9||Math.floor(a/27)===Math.floor(b/27)&&Math.floor(a%9/3)===Math.floor(b%9/3));
export function* independentProduct(sets:readonly (readonly number[])[]):Generator<number[]> {
 const indexes=sets.map(()=>0);if(sets.some(s=>!s.length))return;
 while(true){yield sets.map((s,i)=>s[indexes[i]]);let i=sets.length-1;while(i>=0&&++indexes[i]===sets[i].length){indexes[i]=0;i--;}if(i<0)return;}
}
export function independentFireworks(f:any):number[][] {
 const p=f.expectedPattern,rows=[];
 for(const assignment of independentProduct(p.selected.map((c:number)=>independentDigits(f.preState.domains[c]))))
  if(p.components.every((part:any)=>part.symbols.every((s:number)=>[part.intersection,part.rowWing,part.columnWing].some(c=>assignment[p.selected.indexOf(c)]===s))))rows.push(assignment);
 return rows;
}
export function independentRing(f:any) {
 const p=f.expectedPattern,choices:number[][][]=p.groups.map((g:number[])=>[...independentProduct(g.map(c=>independentDigits(f.preState.domains[c])))].filter(row=>row[0]!==row[1]));
 const assigned=new Map<number,number>();let survivors=0,visited=0;
 const walk=(i:number)=> {
  if(i===8){survivors++;for(let k=0;k<8;k++)for(const s of p.links[k].symbols)if(![...p.groups[k],...p.groups[(k+1)%8]].some(c=>assigned.get(c)===s))throw Error("independent-nonclosing-ring");return;}
  for(const row of choices[i]){visited++;if(row.some((s,j)=>[...assigned].some(([c,t])=>s===t&&independentPeer(c,p.groups[i][j]))))continue;
   row.forEach((s,j)=>assigned.set(p.groups[i][j],s));walk(i+1);p.groups[i].forEach((c:number)=>assigned.delete(c));}
 };
 walk(0);return {survivors,visited,local:choices.map(c=>c.length)};
}
export function independentExocet(f:any,parts=f.expectedPattern.components??[f.expectedPattern]) {
 const cells=[...new Set<number>(parts.flatMap((p:any)=>[...p.base,...p.targets]))].sort((a,b)=>a-b),rows:number[][]=[];
 for(const p of parts)for(const cover of p.covers) {
  const expected=[...p.sCells].filter(c=>independentDigits(f.preState.domains[c]).includes(cover.symbol)).sort((a,b)=>a-b);
  if(JSON.stringify(expected)!==JSON.stringify(cover.occurrences)||JSON.stringify(expected.filter(c=>f.preState.values[c]===cover.symbol))!==JSON.stringify(cover.assignedOccurrences))throw Error("independent-incomplete-S-count");
  for(const c of expected)if(!cover.houses.some((h:string)=>{const [kind,n]=h.split(":");return (kind==="row"?Math.floor(c/9):kind==="column"?c%9:Math.floor(c/27)*3+Math.floor(c%9/3))===Number(n);}))throw Error("independent-uncovered-S-occurrence");
 }
 for(const row of independentProduct(cells.map(c=>independentDigits(f.preState.domains[c])))) {
  if(cells.some((a,i)=>cells.slice(i+1).some((b,j)=>independentPeer(a,b)&&row[i]===row[i+j+1])))continue;
  if(parts.every((p:any)=>JSON.stringify(p.base.map((c:number)=>row[cells.indexOf(c)]).sort())===JSON.stringify(p.targets.map((c:number)=>row[cells.indexOf(c)]).sort())))rows.push(row);
 }
 return {cells,rows};
}
export function independentCore(f:any,p=f.expectedPattern) {
 const permutations:number[][][]=p.triples.map((cells:number[])=>[...independentProduct(cells.map(c=>independentDigits(f.preState.domains[c]).filter(s=>p.coreSymbols.includes(s))))].filter(row=>new Set(row).size===3));
 const cells=p.triples.flat();let survivors=0,combinations=0;
 for(const indices of independentProduct(permutations.map(ps=>ps.map((_,i)=>i)))) {
  combinations++;const row=indices.flatMap((j,i)=>permutations[i][j]);
  if(!cells.some((a:number,i:number)=>cells.slice(i+1).some((b:number,j:number)=>independentPeer(a,b)&&row[i]===row[i+j+1])))survivors++;
 }
 const guardians=cells.flatMap((cell:number)=>independentDigits(f.preState.domains[cell]).filter(s=>!p.coreSymbols.includes(s)).map(symbol=>({cell,symbol}))).sort((a:any,b:any)=>a.cell-b.cell||a.symbol-b.symbol);
 return {counts:permutations.map(p=>p.length),combinations,survivors,guardians};
}
