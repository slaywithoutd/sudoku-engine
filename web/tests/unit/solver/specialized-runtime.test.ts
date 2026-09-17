import { expect, test } from "vitest";
import { SpecializedProof, specializedDescriptor } from "../../../src/solver/techniques/specialized-runtime";
import { IndexWorkspace } from "../../../src/solver/indexes/workspace";
import type { ReadView } from "../../../src/solver/state/types";
import { discoveryContext } from "../../solver/discovery-context";
import { specializedState } from "../../solver/specialized-state";
import fireworks from "../../solver/fixtures/C29.json";
import exocets from "../../solver/fixtures/C31.json";
import { FireworksSearch } from "../../../src/solver/techniques/fireworks";
import { ExocetSearch } from "../../../src/solver/techniques/exocet";
import { transposed } from "../../solver/specialized-transpose";

// Structural allocator-only input at the configured retained-node upper bound.
// These synthetic entries are never checked, retained, or used as proof authority.
function largePrefix():ReadView {
 const facts=new Map();for(let id=1;id<=262144;id++)facts.set(id,{});
 return {facts,assembly:{problem:{cells:Array.from({length:81},(_,i)=>i),symbols:[1,2,3,4,5,6,7,8,9]},allDifferent:[]},
  state:{domains:Array(81).fill(511),domainFacts:Array(81).fill(1)}} as unknown as ReadView;
}
test("large retained prefixes construct and allocate the first scope-free local table without argument expansion",()=> {
 const workspace=new IndexWorkspace({entryLimit:1000,byteLimit:100000}),lease=workspace.reserve(0,65536);
 try {
  const b=new SpecializedProof(largePrefix(),lease),cursor=b.local([0]);let table;
  while(true){const n=cursor.next();if(n.done){table=n.value;break;}}
  expect(table.id).toBe(262145);expect(b.nodes[0].conclusion).toMatchObject({kind:"table",definition:262145,count:9});
  expect(b.add("test-only",[],{kind:"false"})).toBe(262146);
 }finally{lease.dispose();}
 expect(workspace.usage).toEqual({entries:0,bytes:0});
});

test("actual Fireworks and Exocet job factories enumerate each required form and orientation independently",()=> {
 const examples=[{search:new FireworksSearch(),fixtures:[fireworks[0],fireworks[1]],aliases:["Triple Fireworks","Quadruple Fireworks"]},
  {search:new ExocetSearch(),fixtures:[exocets[3],exocets[3],transposed(exocets[3]),transposed(exocets[3])],aliases:["Junior Exocet","Double Exocet","Junior Exocet","Double Exocet"]}];
 for(const example of examples){const jobs=example.search.subfamilies();expect(jobs.length).toBe(example.fixtures.length);
  for(const [i,job]of jobs.entries()) {const {view}=specializedState(example.fixtures[i] as any),context=discoveryContext(),lease=context.workspace.reserve(0,2000000),cursor=job.plans(view,lease);let found:any;
   try{for(let n=0;n<100000;n++){const e=cursor.next();if(e.done)break;if(e.value.kind==="plan"){found=e.value.plan;break;}}}
   finally{cursor.return(undefined);lease.dispose();}
   expect(found?.alias).toBe(example.aliases[i]);if(example.search instanceof ExocetSearch)expect((found.components?.[0]??found).orientation).toBe(i<2?"row":"column");
   expect(context.workspace.usage).toEqual({entries:0,bytes:0});
  }
 }
},60000);

test.each(["Fireworks","Exocet"])("actual %s later form is serviced despite a long first search/compiler",family=> {
 const isFireworks=family==="Fireworks",source=isFireworks?fireworks[1]:exocets[3],{view}=specializedState(source as any),search=isFireworks?new FireworksSearch():new ExocetSearch();
 const jobs=search.subfamilies();let started=false,closed=false;
 if(isFireworks) {const original=jobs[0].plans.bind(jobs[0]);jobs[0].plans=function*(v,lease){started=true;try{for(let n=0;n<1000000;n++)yield {kind:"work",units:1};yield* original(v,lease);}finally{closed=true;}};}
 else {const original=jobs[0].compile.bind(jobs[0]);jobs[0].compile=function*(v,p,lease){started=true;try{for(let n=0;n<1000000;n++)yield {kind:"work",units:1};return yield* original(v,p,lease);}finally{closed=true;}};}
 search.subfamilies=()=>jobs;
 const base=discoveryContext(),context={...base,limits:{...base.limits,workUnits:200000,timeMs:60000}},cursor=specializedDescriptor(isFireworks?"C29":"C31",search,[0,0,9,81,4]).discover(view,context);let found=false;
 try{for(const e of cursor)if(e.kind==="proposal"&&(e.proposal.pattern as any).alias===(isFireworks?"Quadruple Fireworks":"Double Exocet")){found=true;break;}}
 finally{cursor.return();}
 expect(started).toBe(true);expect(found).toBe(true);expect(closed).toBe(true);expect(context.workspace.usage).toEqual({entries:0,bytes:0});
},70000);

test.each(["cancelled","close","work","bytes"])("all four live search/compiler leases close after %s",mode=> {
 const {view}=specializedState(fireworks[0] as any),searchClosed:number[]=[],compilerClosed:number[]=[],started:number[]=[];let cancelled=false;
 const jobs=Array.from({length:4},(_,id)=>({*plans(_v:ReadView,lease:any){try{lease.grow(1,64);yield {kind:"plan" as const,plan:id};}finally{searchClosed.push(id);}},
  *compile(_v:ReadView,_p:unknown,lease:any){started.push(id);try{for(let n=0;n<100;n++){yield {kind:"work" as const,units:1};lease.grow(0,1024);}return null;}finally{compilerClosed.push(id);}}}));
 const strategy={...jobs[0],subfamilies:()=>jobs},base=discoveryContext(),context={...base,limits:{...base.limits,workUnits:mode==="work"?16:10000},workspace:new IndexWorkspace({entryLimit:1000,byteLimit:mode==="bytes"?2267000:4000000,cancelled:()=>cancelled})};
 const cursor=specializedDescriptor("C29",strategy,[0,0,9,4,4]).discover(view,context);let ending;
 try{for(const e of cursor){ending=e;if(started.length===4){if(mode==="cancelled")cancelled=true;if(mode==="close")break;}}}finally{cursor.return();}
 expect(started).toHaveLength(4);expect(searchClosed.sort()).toEqual([0,1,2,3]);expect(compilerClosed.sort()).toEqual([0,1,2,3]);expect(context.workspace.usage).toEqual({entries:0,bytes:0});
 if(mode!=="close")expect(ending).toMatchObject({kind:"interrupted"});
});

test("a ready proposal keeps its compiler lease until the borrower closes the cursor",()=> {
 const {view}=specializedState(fireworks[0] as any),base=discoveryContext();let otherClosed=false;
 const proposal={technique:"test-only@1",state:view.state.key,pattern:{},effects:[],proof:{state:view.state.key,nodes:[],imports:[],roots:[]}};
 const ready={*plans(){yield {kind:"plan" as const,plan:0};},*compile(){yield {kind:"work" as const,units:1};return proposal;}},other={*plans(){try{while(true)yield {kind:"work" as const,units:1};}finally{otherClosed=true;}},*compile(){return null;}};
 const cursor=specializedDescriptor("C29",{...ready,subfamilies:()=>[ready,other]},[0,0,9,4,4]).discover(view,base);
 for(const e of cursor)if(e.kind==="proposal"){expect(base.workspace.usage.bytes).toBeGreaterThanOrEqual(2065536);break;}
 cursor.return();expect(otherClosed).toBe(true);expect(base.workspace.usage).toEqual({entries:0,bytes:0});
});

test("a cheap later subfamily completes while the first compiler is still live",()=> {
 const {view}=specializedState(fireworks[0] as any),serviced:string[]=[],closed:string[]=[];
 const job=(label:string,count:number)=>({*plans(){yield {kind:"plan" as const,plan:label};},*compile(){serviced.push(label);try{for(let i=0;i<count;i++)yield {kind:"work" as const,units:1};serviced.push(label+":done");return null;}finally{closed.push(label);}}});
 const first=job("triple",100),later=job("quad",1);
 const strategy={*plans(){yield {kind:"plan" as const,plan:"triple"};yield {kind:"plan" as const,plan:"quad"};},compile:first.compile,subfamilies:()=>[first,later]};
 const base=discoveryContext(),context={...base,limits:{...base.limits,workUnits:20},workspace:new IndexWorkspace({entryLimit:1000,byteLimit:3000000})};
 const events=[...specializedDescriptor("C29",strategy,[0,0,9,4,4]).discover(view,context)];
 expect(serviced).toContain("quad:done");expect(serviced).not.toContain("triple:done");expect(events.at(-1)).toMatchObject({kind:"interrupted",reason:"work-limit"});
 expect(closed.sort()).toEqual(["quad","triple"]);expect(context.workspace.usage).toEqual({entries:0,bytes:0});
});
test("large-prefix first-table interruption disposes its own row/node lease",()=> {
 const workspace=new IndexWorkspace({entryLimit:1000,byteLimit:1000}),lease=workspace.reserve(0,0);
 try {const b=new SpecializedProof(largePrefix(),lease);expect(()=>[...b.local([0])]).toThrow("workspace-byte-limit");}
 finally{lease.dispose();}expect(workspace.usage).toEqual({entries:0,bytes:0});
});
