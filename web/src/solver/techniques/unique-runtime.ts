import type { ReadView, Literal } from "../state/types";
import type { Effect } from "../proof/types";
import type { Discovery, DiscoveryContext, TechniqueDescriptor, DiscoveryEvent } from "./types";
import { coverageEntries } from "./manifest";
import { uniqueAuthorityMatches } from "../conditional";
import { compileUnique, type UniqueGeometry, type UniquePlan } from "./unique-compiler";
import { UniqueRectangles, uniqueSymbols, type UniqueGeometryCursor } from "./unique-rectangles";
import { UniqueLoops } from "./unique-loops";
import { Bug } from "./bug";
import { buildImplications, type ImplicationIndex } from "../indexes/implications";
import { IndexInterrupted, type WorkspaceReservation } from "../indexes/workspace";
import { ForcingGraph } from "./forcing-runtime";
import { forcingProofFits, opposite, signedKey, type ForcingLink } from "./forcing-proof";
type Work={kind:"work";units:number};

/** Per-invocation graph traversal; authority and solutions never enter recipes. */
class UniqueConsequenceSearch {
  constructor(readonly graph:ForcingGraph,readonly context:DiscoveryContext) {}
  *paths(start:Literal,g:UniqueGeometry):Generator<Work,Map<string,ForcingLink[]>> {
    const lease=this.context.workspace.reserve(1,3000000);
    try {
      const paths=new Map<string,ForcingLink[]>([[signedKey(start),[]]]),queue=[start];
      for(let i=0;i<queue.length;i++) {
        const path=paths.get(signedKey(queue[i]))!;if(path.length===24)continue;
        for(const link of this.graph.arcs.get(signedKey(queue[i]))??[]) {
          yield {kind:"work",units:1};
          if(g.kind==="type3"&&(link.reason.kind==="house-cover"||link.reason.kind==="cell-cover"&&!g.auxiliaryCells.includes(link.from.cell)&&!g.cells.includes(link.from.cell)))continue;
          if(g.strongSymbol!==null&&link.reason.kind==="house-cover"&&link.reason.symbol===g.strongSymbol&&!(g.kind==="type6"?g.causalHouses:g.strongHouses).includes(link.reason.house!))continue;
          const key=signedKey(link.to);if(paths.has(key))continue;
          paths.set(key,[...path,link]);queue.push(link.to);
        }
      }
      return paths;
    }finally{lease.dispose();}
  }
}

function* effects(view:ReadView,g:UniqueGeometry):Generator<Effect> {
  const core=uniqueSymbols(g.coreMasks[0]),roofs=g.cells.filter(c=>g.guardians.some(a=>a.cell===c));
  const peers=(a:number,b:number)=>a!==b&&view.assembly.allDifferent.some(h=>h.cells.includes(a)&&h.cells.includes(b));
  if(g.row==="U04") {yield {kind:"place",cell:g.guardians[0].cell,symbol:g.guardians[0].symbol};return;}
  for(const cell of view.assembly.problem.cells)if(!view.state.values[cell])for(const symbol of uniqueSymbols(view.state.domains[cell]))for(const kind of ["remove","place"] as const) {
    let allowed=true;
    if(g.kind==="type1"||g.kind==="avoidable1")allowed=kind==="remove"&&roofs[0]===cell&&core.includes(symbol);
    if(["type2","type5","avoidable2"].includes(g.kind))allowed=kind==="remove"&&!g.cells.includes(cell)&&symbol===g.guardians[0].symbol&&roofs.every(c=>peers(c,cell));
    if(g.kind==="type3")allowed=kind==="remove"&&!g.cells.includes(cell)&&!g.auxiliaryCells.includes(cell)&&g.guardians.some(a=>a.symbol===symbol)&&!!view.assembly.allDifferent.find(h=>h.id===g.subsetHouse)?.cells.includes(cell);
    if(g.kind==="type4")allowed=kind==="remove"&&roofs.includes(cell)&&core.includes(symbol)&&symbol!==g.strongSymbol;
    if(g.kind==="type6")allowed=kind==="remove"&&roofs.includes(cell)&&symbol===g.strongSymbol;
    if(g.kind==="hidden")allowed=kind==="remove"&&g.cells.includes(cell)&&g.cells.some(c=>Math.floor(c/9)!==Math.floor(cell/9)&&c%9!==cell%9&&view.state.domains[c]===g.coreMasks[0])&&core.includes(symbol)&&symbol!==g.strongSymbol&&g.strongHouses.every(id=>view.assembly.allDifferent.find(h=>h.id===id)!.cells.includes(cell));
    if(allowed)yield {kind,cell,symbol};
  }
}

/** One job fairly owns all lazy subfamily cursors and releases before terminal events. */
export function* discoverUnique(row:UniqueGeometry["row"],view:ReadView,context:DiscoveryContext):Discovery {
  if(!uniqueAuthorityMatches(context.uniqueAuthority,view)){yield {kind:"disabled",reason:"missing-unique-authority"};return;}
  let index:ImplicationIndex|undefined,lease:WorkspaceReservation|undefined,terminal:DiscoveryEvent={kind:"exhausted"};
  const deadline=performance.now()+context.limits.timeMs;let work=0;
  const tick=()=>{context.workspace.checkpoint();if(!uniqueAuthorityMatches(context.uniqueAuthority,view))throw Error("unique-disabled");if(performance.now()>=deadline)throw Error("unique-time-limit");if(++work>context.limits.workUnits)throw Error("unique-work-limit");};
  const cursors:UniqueGeometryCursor[]=row==="U01"||row==="U02"?new UniqueRectangles().cursors(view,row):row==="U03"?[new UniqueLoops().geometries(view)]:[new Bug().geometries(view,row)];
  try {
    lease=context.workspace.reserve(1,65536);const graph=new ForcingGraph(view,context,lease);
    for(const event of buildImplications(view,context.workspace)) {if(event.kind==="ready")index=event.value;else if(event.kind==="interrupted")throw new IndexInterrupted(event.reason);tick();if(event.kind==="work")yield event;}
    for(const e of graph.prepare(index!)){tick();yield e;}
    const search=new UniqueConsequenceSearch(graph,context);
    while(cursors.length)for(let i=0;i<cursors.length;) {
      tick();const next=cursors[i].next();if(next.done){cursors.splice(i,1);continue;}i++;
      if(next.value.kind==="work"){yield next.value;continue;}
      const g=next.value.geometry,storage=context.workspace.reserve(1,4000000+g.guardians.length*1500000);
      try {
        const results:{assumption:Literal;paths:Map<string,ForcingLink[]>;falsePaths?:ForcingLink[][]}[]=[];
        for(const assumption of g.guardians) {
          const cursor=search.paths(assumption,g);let next=cursor.next();
          try{while(!next.done){tick();yield next.value;next=cursor.next();}}finally{cursor.return(new Map());}
          results.push({assumption,paths:next.value,falsePaths:graph.contradiction(assumption,next.value)});
        }
        for(const effect of effects(view,g)) {
          tick();yield {kind:"work",units:1};const target:Literal={cell:effect.cell,symbol:effect.symbol,positive:effect.kind==="place"};
          if(g.kind==="type6"&&effect.cell!==g.cells.find(c=>g.guardians.some(a=>a.cell===c)))continue;
          let plan:UniquePlan|undefined;
          if(g.row==="U01"||g.row==="U02"||g.guardians.length===1) {
            const cursor=search.paths(opposite(target),g);let next=cursor.next();
            try{while(!next.done){tick();yield next.value;next=cursor.next();}}finally{cursor.return(new Map());}
            const paths=g.guardians.map(a=>next.value.get(signedKey(opposite(a))));
            if(paths.every(p=>p!==undefined)&&new Set(paths.flatMap(p=>p!.map(e=>JSON.stringify(e)))).size<=24)plan={geometry:g,consequence:{kind:"denial",paths:paths as ForcingLink[][]}};
          }
          if(!plan&&results.every(r=>r.falsePaths||r.paths.has(signedKey(target))))plan={geometry:g,consequence:{kind:"cases",branches:results.map(r=>({assumption:r.assumption,result:r.falsePaths?"false":target,paths:r.falsePaths??[r.paths.get(signedKey(target))!]}))}};
          if(!plan)continue;
          if(plan.consequence.kind==="cases"&&plan.consequence.branches.some(b=>new Set(b.paths.flat().map(e=>JSON.stringify(e))).size>24))continue;
          if(g.kind==="type6") {
            const cell=g.cells.find(c=>c!==effect.cell&&g.guardians.some(a=>a.cell===c))!,otherEffect:Effect={kind:"remove",cell,symbol:effect.symbol};
            const cursor=search.paths({cell,symbol:effect.symbol,positive:true},g);let next=cursor.next();
            try{while(!next.done){tick();yield next.value;next=cursor.next();}}finally{cursor.return(new Map());}
            const paths=g.guardians.map(a=>next.value.get(signedKey(opposite(a))));
            if(paths.some(p=>!p)||new Set(paths.flatMap(p=>p!.map(e=>JSON.stringify(e)))).size>24)continue;
            plan={...plan,companion:{effect:otherEffect,consequence:{kind:"denial",paths:paths as ForcingLink[][]}}};
          }
          const allPaths=[...(plan.consequence.kind==="denial"?plan.consequence.paths:plan.consequence.branches.flatMap(b=>b.paths)),
            ...(plan.companion?.consequence.kind==="denial"?plan.companion.consequence.paths:[])];
          if((g.kind==="type6"?g.causalHouses:g.strongHouses).some(h=>!allPaths.flat().some(e=>e.reason.kind==="house-cover"&&e.reason.house===h&&e.reason.symbol===g.strongSymbol)))continue;
          if(g.kind==="type3"&&g.auxiliaryCells.some(c=>!allPaths.flat().some(e=>e.reason.kind==="cell-cover"&&e.reason.cell===c)))continue;
          const compilation=context.workspace.reserve(1,5000000);
          try {const proposal=compileUnique(view,plan,effect,context.uniqueAuthority!,compilation);if(!forcingProofFits(proposal,context.limits))throw Error("unique-proof-limit");yield {kind:"proposal",proposal};}
          finally{compilation.dispose();}
        }
      }finally{storage.dispose();}
    }
  }catch(error) {
    if(error instanceof IndexInterrupted)terminal={kind:"interrupted",reason:error.reason};
    else if(error instanceof Error&&error.message==="unique-disabled")terminal={kind:"disabled",reason:"missing-unique-authority"};
    else if(error instanceof Error&&error.message==="unique-work-limit")terminal={kind:"interrupted",reason:"work-limit"};
    else if(error instanceof Error&&error.message==="unique-time-limit")terminal={kind:"interrupted",reason:"time-limit"};
    else if(error instanceof Error&&error.message==="unique-proof-limit")terminal={kind:"interrupted",reason:"proof-step-limit"};
    else throw error;
  }finally{for(const cursor of cursors)cursor.return();index?.dispose();lease?.dispose();}
  yield terminal;
}

function descriptor(row:UniqueGeometry["row"]):TechniqueDescriptor {
  const entry=coverageEntries.find(e=>e.id===row)!,tradeCells=row==="U01"?4:row==="U02"?6:row==="U03"?12:81;
  return Object.freeze({id:entry.version,aliases:entry.aliases,tier:entry.tier,requires:entry.capabilities,assumptionPolicy:"unique-only" as const,
    bounds:{maxLength:24,maxBranchDepth:1,maxAlternatives:row==="U01"?28:row==="U02"?36:row==="U04"?1:4,maxPatternCells:tradeCells,maxSetSize:row==="U01"?4:row==="U02"?3:row==="U03"?2:4,
      uniqueness:{maxTradeCells:tradeCells,maxLoopCells:row==="U03"?12:0,maxGuardianOccurrences:row==="U01"?28:row==="U02"?36:row==="U04"?1:4,maxConsequenceLinksPerBranch:24,maxVirtualSubset:row==="U01"?4:0}},
    watches:()=>[{kind:"all" as const}],eligible:(view:ReadView)=>view.assembly.problem.cells.length===81?{kind:"yes" as const}:{kind:"excluded" as const,reason:"missing-classic-geometry",dependencies:[{kind:"all" as const}]},
    estimate:()=>({hit:1,gain:1,cost:7}),discover:(view:ReadView,context:DiscoveryContext)=>discoverUnique(row,view,context)});
}
export const uniqueTechniques=Object.freeze((["U01","U02","U03","U04","U05"] as const).map(descriptor));
