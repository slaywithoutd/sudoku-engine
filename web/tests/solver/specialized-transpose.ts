/** Coordinate transpose of independently authored Exocet fixtures. */
const cell=(c:number)=>c%9*9+Math.floor(c/9);
export function transposed(source:any) {
 const f=structuredClone(source),reorder=(a:number[])=>Array.from({length:81},(_,c)=>a[cell(c)]),house=(s:string)=>{const [k,n]=s.split(":");return `${k==="row"?"column":k==="column"?"row":"box"}:${k==="box"?Number(n)%3*3+Math.floor(Number(n)/3):n}`;};
 f.id+="-transpose";f.givens=reorder([...f.givens].map(Number)).join("");f.preState.values=reorder(f.preState.values);f.preState.domains=reorder(f.preState.domains);
 for(const p of f.expectedPattern.components??[f.expectedPattern]) {
  p.orientation="column";p.base=p.base.map(cell).sort((a:number,b:number)=>a-b);p.targets=p.targets.map(cell);p.companions=p.companions.map(cell);p.sCells=p.sCells.map(cell);p.crossLines=p.crossLines.map(house);
  for(const cv of p.covers){cv.houses=cv.houses.map(house);cv.occurrences=cv.occurrences.map(cell).sort((a:number,b:number)=>a-b);cv.assignedOccurrences=cv.assignedOccurrences.map(cell).sort((a:number,b:number)=>a-b);}
 }
 f.expectedEffects=f.expectedEffects.map((e:any)=>({...e,cell:cell(e.cell)}));return f;
}
