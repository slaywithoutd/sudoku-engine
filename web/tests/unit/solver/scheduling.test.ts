import { describe, expect, test } from "vitest";
import { WorkBudget, canonicalOptionsKey, schedulingOptions } from "../../../src/solver/scheduling/work";
import { SchedulingLedger } from "../../../src/solver/scheduling/ledger";
import { FairPolicy } from "../../../src/solver/scheduling/policy";
import { canonicalProblem } from "../../../src/solver/problem";
import { assemble } from "../../../src/solver/rules/assemble";
import { AllDifferentRule } from "../../../src/solver/rules/all-different";
import { initialize } from "../../../src/solver/state/candidates";
import type { TechniqueDescriptor } from "../../../src/solver/techniques/types";

export const limits = { timeMs: 10000, workUnits: 1000000, exactNodes: 10000, stepNodes: 4096,
  runNodes: 65536, proofBytes: 8000000, stepBytes: 1000000, batchBytes: 65536,
  inFlightBatches: 2, workspaceBytes: 64000000 };
export function fixture(givens = [1,0,0,0]) {
  const assembly = assemble(canonicalProblem({schema:1,cells:[0,1,2,3],symbols:[1,2],givens,
    constraints:[{id:"a",type:"all-different@1",cells:[0,1],parameters:{}},
      {id:"b",type:"all-different@1",cells:[1,2],parameters:{}}]}),[new AllDifferentRule()]);
  if(!assembly.ok) throw Error("fixture");
  return initialize(assembly.value,"primary");
}
export function descriptor(id:string,tier=0,cost=1):TechniqueDescriptor {
  return {id,aliases:[],tier,requires:[],assumptionPolicy:"unconditional",
    bounds:{maxLength:0,maxBranchDepth:0,maxAlternatives:0,maxPatternCells:0,maxSetSize:0},
    watches:()=>[{kind:"all"}],eligible:()=>({kind:"yes"}),estimate:()=>({hit:0,gain:0,cost}),
    *discover(){for(let i=0;i<100000;i++)yield {kind:"work",units:1};yield {kind:"exhausted"};}};
}

describe("deterministic scheduling ownership",()=>{
  test("atomic finite budget never overspends or accepts invalid work",()=>{
    const budget=new WorkBudget(10);
    expect(budget.spend(7)).toBe(true); expect(budget.spend(4)).toBe(false);
    expect(budget.remaining()).toBe(3); expect(budget.used).toBe(7);
    for(const value of [-1,NaN,Infinity,0.5])expect(()=>budget.spend(value)).toThrow();
  });
  test("versioned canonical options include every logical cap and omit no selected policy",()=>{
    const options=schedulingOptions({limits});
    expect(options.mode).toBe("explain");expect(options.rollout).toBe(false);
    const encoded=canonicalOptionsKey(options);
    expect(encoded).toContain('"policy":"explain-fair@1"');
    expect(canonicalOptionsKey({...options,limits:{...limits,workUnits:limits.workUnits+1}})).not.toBe(encoded);
    expect(canonicalOptionsKey({...options,phaseWorkUnits:options.phaseWorkUnits-1})).not.toBe(encoded);
    expect(canonicalOptionsKey({...options,limits:Object.fromEntries(Object.entries(limits).reverse()) as typeof limits})).toBe(encoded);
    expect(()=>schedulingOptions({limits,rollout:true})).toThrow("rollout-requires-analyze");
  });
  test("every zero-score job receives service within four times the active count",()=>{
    const view=fixture(),jobs=Array.from({length:10},(_,i)=>descriptor(`test-${i}@1`,0,i===0?1:1024));
    const ledger=new SchedulingLedger(view,{rules:[],techniques:jobs});
    const policy=new FairPolicy("analyze-fair@1",jobs);
    const served:number[][]=jobs.map(()=>[]);
    for(let ticket=1;ticket<=100;ticket++){
      const key=policy.next(ledger,view);ledger.service(key);served[jobs.findIndex(j=>j.id===key.technique)].push(ticket);
    }
    for(const tickets of served){expect(tickets[0]).toBeLessThanOrEqual(40);
      for(let i=1;i<tickets.length;i++)expect(tickets[i]-tickets[i-1]).toBeLessThanOrEqual(40);}
  });
  test("interrupted cheaper tiers cannot certify simpler exhaustion; disabled is incomplete",()=>{
    const view=fixture(),ledger=new SchedulingLedger(view,{rules:[],techniques:[descriptor("a@1",0),descriptor("b@1",1)]});
    ledger.status({technique:"a@1",scopeKey:""},"interrupted","work-limit");
    expect(ledger.simplerExhausted(1)).toBe(false);expect(ledger.complete).toBe(false);
    ledger.status({technique:"a@1",scopeKey:""},"disabled","missing-unique-authority");
    expect(ledger.complete).toBe(false);
  });
  test("retained terminal exclusions preserve event dependencies across source changes",()=>{
    const view=fixture(),job=descriptor("watch@1"),ledger=new SchedulingLedger(view,{rules:[],techniques:[job]});
    ledger.status({technique:"watch@1",scopeKey:""},"excluded","not-ready",[{kind:"graph"}]);
    const next={...view,state:{...view.state,key:{...view.state.key,revision:view.state.key.revision}}} as typeof view;
    ledger.advance(next,{before:view.state.key,after:next.state.key,removed:[],placed:[],cells:[],coverIds:[],relationIds:[],constraintIds:[],graphChanged:false,sourceChanged:true});
    expect(ledger.rows[0].status).toBe("excluded");
    expect(ledger.rows[0].dependencies).toEqual([{kind:"graph"}]);
  });
});

import {StepSelection,selectStep} from "../../../src/solver/scheduling/select";
import {IndexWorkspace} from "../../../src/solver/indexes/workspace";
import {assembleTechniqueJobs} from "../../../src/solver/techniques/registry";
import {commitChecked,retainedProof,retainCheckedFacts} from "../../../src/solver/state/candidates";
import {checkProposal,checkUsage} from "../../../src/solver/proof/checker";
import {prepareSources} from "../../../src/solver/state/source-index";

function workspace(){return new IndexWorkspace({entryLimit:1000000,byteLimit:limits.workspaceBytes});}
describe("selection windows and accepted publications",()=>{
  test("production profile is ready and drains actual original-rule maintenance first",()=>{
    const view=fixture(),registry=assembleTechniqueJobs(view.assembly,"classic-expanded@1"),w=workspace();
    expect(registry.rules).toHaveLength(2);expect(registry.techniques).toHaveLength(33);
    const events=[...selectStep(view,registry,{...schedulingOptions({limits}),workspace:w})];
    const selected=events.find(e=>e.kind==="checked-step");expect(selected?.kind).toBe("checked-step");
    if(selected?.kind!=="checked-step")throw Error("no selection");
    expect(selected.step.proposal.technique).toBe("rule-propagation@1");expect(view.state.key.revision).toBe(0);
    expect(w.usage).toEqual({entries:0,bytes:0});
  });
  test("wall-task grouping cannot change quanta or accepted checked proofs",()=>{
    function run(slice:number){
      const view=fixture(),w=workspace(),selection=new StepSelection(view,assembleTechniqueJobs(view.assembly,"classic-expanded@1"),{...schedulingOptions({limits}),workspace:w});
      const keys:string[]=[];
      try {for(let i=0;i<3;i++){
        const cursor=selection.select();let found:ReturnType<typeof cursor.next>["value"] = undefined;
        let done=false;while(!done){for(let j=0;j<slice;j++){const next=cursor.next();if(next.done){done=true;break;}if(next.value.kind==="checked-step")found=next.value;}}
        if(!found||found.kind!=="checked-step")break;
        keys.push(JSON.stringify(found.step.proposal));selection.advance(commitChecked(selection.view,found.step).view);
      }}finally{selection.dispose();}
      expect(w.usage).toEqual({entries:0,bytes:0});return keys;
    }
    const one=run(1);expect(one.length).toBeGreaterThan(0);expect(one).toEqual(run(256));
  });
  test("receiver must actually accept the exact bundle before dependent selection",()=>{
    const view=fixture(),w=workspace(),selection=new StepSelection(view,assembleTechniqueJobs(view.assembly,"classic-expanded@1"),{...schedulingOptions({limits}),workspace:w});
    const events=[...selection.select()],event=events.find(e=>e.kind==="checked-step");
    if(event?.kind!=="checked-step")throw Error("no step");
    expect(()=>[...selection.select()]).toThrow("awaiting-step-acceptance");
    expect(()=>selection.advance(view)).toThrow("unaccepted-scheduler-successor");
    expect(()=>selection.advance(initialize(view.assembly,"primary"))).toThrow();
    selection.advance(commitChecked(view,event.step).view);expect(selection.view.state.key.revision).toBe(1);selection.dispose();
  });
  test("oversized work event carries debt across quanta without becoming exhaustion",()=>{
    const d={...descriptor("slow@1"),*discover(){yield {kind:"work" as const,units:1000};yield {kind:"exhausted" as const};}};
    const view=fixture(),w=workspace(),selection=new StepSelection(view,{rules:[],techniques:[d]},{...schedulingOptions({limits,phaseWorkUnits:600}),workspace:w});
    const events=[...selection.select()],last=events.at(-1);expect(last?.kind).toBe("logical-stop");
    if(last?.kind!=="logical-stop")throw Error("no stop");expect(last.complete).toBe(false);expect(last.reason).toBe("work-limit");
    expect(selection.usedWork).toBeLessThanOrEqual(600);selection.dispose();expect(w.usage.bytes).toBe(0);
  });
  test("two source preparations own independent storage and exact lifetimes",()=>{
    const view=fixture(),w=workspace();
    const prepare=()=>{const cursor=prepareSources(view,w);let next=cursor.next();while(!next.done)next=cursor.next();return next.value;};
    const a=prepare(),b=prepare();const max=b.maximumId;a.dispose();expect(b.maximumId).toBe(max);b.dispose();expect(w.usage.bytes).toBe(0);
    expect(()=>a.maximumId).toThrow("disposed-source-index");
  });
  test("competing service cannot reuse a large event's prepaid work debt",()=>{
    const view=fixture(),w=workspace(),budget=new WorkBudget(1700);let observed=0;
    const a={...descriptor("a@1"),*discover(){yield {kind:"work" as const,units:1200};yield {kind:"exhausted" as const};}};
    const b={...descriptor("b@1"),*discover(){observed=budget.used;yield {kind:"work" as const,units:600};yield {kind:"exhausted" as const};}};
    const selection=new StepSelection(view,{rules:[],techniques:[a,b]},{...schedulingOptions({limits,mode:"analyze",phaseWorkUnits:1700}),workspace:w,budget});
    const events=[...selection.select()];expect(observed).toBeGreaterThanOrEqual(1200);
    expect(selection.ledger.rows[0].work).toBe(768);
    expect(events.at(-1)).toMatchObject({kind:"logical-stop",complete:false,reason:"work-limit"});
    expect(budget.used).toBeLessThanOrEqual(1700);selection.dispose();expect(w.usage.bytes).toBe(0);
  });
});

test("live checker credit narrows frozen limits and accounts rejected work",()=>{
  const view=fixture(),rule=view.assembly.problem.constraints[0];
  const event=[...view.assembly.modules.get(rule.id)!.propagate(view,rule)].find(e=>e.kind==="proposal");
  if(event?.kind!=="proposal")throw Error("fixture");let remaining=100000;
  const cursor=checkProposal(event.proposal,{view,retained:retainedProof(view),limits,policy:"unconditional",uniqueEvidenceId:null,remainingWork:()=>remaining});
  expect(cursor.next().done).toBe(false);const before=checkUsage(cursor).workUnits;remaining=0;
  expect([...cursor].at(-1)).toMatchObject({kind:"rejected",code:"proof-work-limit"});
  expect(checkUsage(cursor).workUnits).toBe(before);expect(Object.isFrozen(checkUsage(cursor))).toBe(true);
});

import {CertificateBuilder,literal} from "../../../src/solver/proof/builder";
import {preparedSources} from "../../../src/solver/state/source-index";
import {conflict} from "../../../src/solver/techniques/pattern-contracts";
import {chainFixture,independentChainCertificate} from "../../solver/chains-acceptance";
import {fixtureView} from "../../solver/acceptance";

test("proof-only acceptance invalidates source watches despite unchanged revision and deduplicates a repeated cache",()=>{
  const assembly=assemble(canonicalProblem({schema:1,cells:[0],symbols:[1],givens:[0],constraints:[]}),[new AllDifferentRule()]);
  if(!assembly.ok)throw Error("fixture");const initial=initialize(assembly.value,"primary");
  let scans=0;
  const cache={...descriptor("c01@1"),*discover(view:typeof initial){
    scans++;yield {kind:"work" as const,units:1};
    const b=new CertificateBuilder(view),root=b.add("cover-clause@1",[view.state.domainFacts[0]],literal(0,1,true));
    const proposal={technique:"c01@1",state:view.state.key,effects:[],pattern:{kind:"single",alias:"Naked Single",cell:0,symbol:1,house:null},
      proof:{state:view.state.key,nodes:[{id:root,rule:"cover-clause@1",premises:[view.state.domainFacts[0]],conclusion:literal(0,1,true),parameters:{},scope:[]}],imports:[view.state.domainFacts[0]],roots:[root]}};
    yield {kind:"proposal" as const,proposal};yield {kind:"exhausted" as const};
  }};
  const watcher={...descriptor("watcher@1"),watches:()=>[{kind:"graph" as const}],*discover(){yield {kind:"exhausted" as const};}};
  for(const policy of ["fixed-scan@1","event-fixed@1"] as const){
    const w=workspace(),selection=new StepSelection(initial,{rules:[],techniques:[cache,watcher]},{...schedulingOptions({limits,policy}),workspace:w});
    const result=[...selection.select()].find(e=>e.kind==="checked-step");if(result?.kind!=="checked-step")throw Error("missing cache");
    const successor=retainCheckedFacts(initial,result.step);expect(successor.state.key.revision).toBe(initial.state.key.revision);
    selection.advance(successor);expect(selection.ledger.rows.every(e=>e.status==="pending")).toBe(true);
    const again=[...selection.select()];expect(again.filter(e=>e.kind==="checked-step")).toHaveLength(0);
    expect(again.at(-1)).toMatchObject({kind:"logical-stop",complete:true});selection.dispose();expect(w.usage.bytes).toBe(0);
  }
  expect(scans).toBe(4);
  const rolloutWorkspace=workspace();
  const rolloutSelection=new StepSelection(initial,{rules:[],techniques:[cache]},{...schedulingOptions({limits,mode:"analyze",rollout:true}),workspace:rolloutWorkspace});
  expect(()=>[...rolloutSelection.select()]).not.toThrow();
  rolloutSelection.dispose();expect(rolloutWorkspace.usage.bytes).toEqual(0);
});

test("prepared source projections preserve genuine coloring checks and are immutable",()=>{
  const fixture=chainFixture("C14-multi"),view=fixtureView(fixture),proposal=independentChainCertificate(fixture),w=workspace();
  const context={view,retained:retainedProof(view),policy:"discharged" as const,uniqueEvidenceId:null,limits:{...limits,workUnits:10000000}};
  expect([...checkProposal(proposal,context)].at(-1)?.kind).toBe("checked");
  const cursor=prepareSources(view,w);let next=cursor.next();while(!next.done)next=cursor.next();const index=next.value;
  try{
    expect([...checkProposal(proposal,context)].at(-1)?.kind).toBe("checked");
    const facts=index.kind("all-different");expect(Object.isFrozen(facts)).toBe(true);expect(()=>((facts as unknown as unknown[]).pop())).toThrow();
    expect(preparedSources({...view})).toBeUndefined();expect("add" in index).toBe(false);
    expect("source" in index).toBe(false);expect("lease" in index).toBe(false);
    for(const a of view.assembly.problem.cells.slice(0,9))for(const b of view.assembly.problem.cells.slice(0,9)){
      const x={cell:a,symbol:1,positive:true},y={cell:b,symbol:1,positive:true};
      expect(conflict(view,x,y)).toBe(conflict({...view},x,y));
    }
  }finally{index.dispose();}expect(w.usage.bytes).toBe(0);
},30000);

test("cancellation and explicit generator return release preparation and every scheduler lease",()=>{
  let cancelled=false;const w=new IndexWorkspace({entryLimit:100000,byteLimit:limits.workspaceBytes,cancelled:()=>cancelled}),view=fixture();
  const preparing=prepareSources(view,w);preparing.next();preparing.return(undefined as never);expect(w.usage.bytes).toBe(0);
  const selection=new StepSelection(view,{rules:[],techniques:[descriptor("slow@1")]},{...schedulingOptions({limits}),workspace:w});
  const cursor=selection.select();cursor.next();cancelled=true;
  expect([...cursor].at(-1)).toMatchObject({kind:"logical-stop",complete:false,reason:"cancelled"});selection.dispose();expect(w.usage.bytes).toBe(0);
});

import {mockRuleRegistry} from "../../solver/mock-rules";
import {vi} from "vitest";
import * as grammar from "../../../src/solver/techniques/grammar";
import {PrimitiveRegistry} from "../../../src/solver/proof/primitives";
import type {CheckContext,ProofNode} from "../../../src/solver/proof/types";
import type {TableDefinition} from "../../../src/solver/proof/tables";

test("named source-read exhaustion remains a resource diagnostic",()=>{
  const view=fixture(),rule=view.assembly.problem.constraints[0];
  const proposal=[...view.assembly.modules.get(rule.id)!.propagate(view,rule)].find(e=>e.kind==="proposal");
  if(proposal?.kind!=="proposal")throw Error("fixture");let remaining=100000,entered=false;
  const original=grammar.checkTechniqueGrammarSteps;
  const spy=vi.spyOn(grammar,"checkTechniqueGrammarSteps").mockImplementation(function*(...args){entered=true;remaining=0;yield* original(...args);});
  try{
    const cursor=checkProposal(proposal.proposal,{view,retained:retainedProof(view),limits,policy:"unconditional",uniqueEvidenceId:null,remainingWork:()=>remaining});
    expect([...cursor].at(-1)).toMatchObject({kind:"rejected",code:"proof-work-limit"});
    expect(entered).toBe(true);expect(checkUsage(cursor).workUnits).toBeGreaterThan(0);
  }finally{spy.mockRestore();}
});

test("prepared relation conflicts match cold current-domain checks and mixed capability owners",()=>{
  const assembly=assemble(canonicalProblem({schema:1,cells:[0,1],symbols:[1,2,3],givens:[1,0],constraints:[
    {id:"s",type:"sum@1",cells:[0,1],parameters:{total:4}},{id:"o",type:"order@1",cells:[0,1],parameters:{}}
  ]}),mockRuleRegistry);
  if(!assembly.ok)throw Error(JSON.stringify(assembly));const view=initialize(assembly.value,"primary"),w=workspace();
  const completeCursor=prepareSources(view,w);let c=completeCursor.next();while(!c.done)c=completeCursor.next();const complete=c.value;
  const factsCursor=prepareSources(view,w,{level:"facts"});let f=factsCursor.next();while(!f.done)f=factsCursor.next();const facts=f.value;
  for(let a=1;a<=3;a++)for(let b=1;b<=3;b++)expect(conflict(view,{cell:0,symbol:a,positive:true},{cell:1,symbol:b,positive:true}))
    .toBe(conflict({...view},{cell:0,symbol:a,positive:true},{cell:1,symbol:b,positive:true}));
  expect(preparedSources(view,"complete")).toBe(complete);facts.dispose();expect(preparedSources(view,"complete")).toBe(complete);
  const againCursor=prepareSources(view,w,{level:"facts"});let again=againCursor.next();while(!again.done)again=againCursor.next();
  complete.dispose();expect(()=>preparedSources(view,"complete")).toThrow("incomplete-conflict-sources");again.value.dispose();expect(w.usage.bytes).toBe(0);
});

test("incremental retained-table seeding preserves constructor identity and collision semantics",()=>{
  const node:ProofNode={id:9,rule:"table-filter@1",premises:[],scope:[],parameters:{},conclusion:{kind:"table",cells:[0],count:1,definition:9}};
  const definition:TableDefinition={cells:[0],count:1,complete:true,depth:0,operation:"filter",sources:[],domains:[1],box:[1],constraints:[],children:[]};
  const constructed=new PrimitiveRegistry([[node,definition]]),incremental=new PrimitiveRegistry();incremental.seedRetainedTable(node,definition);
  expect(incremental.tableDefinition(node)).toBe(constructed.tableDefinition(node));
  expect(incremental.tableDefinition({...node})).toBeUndefined();
});

test("retained checker stage cannot see future proof nodes after the generator completes",()=>{
  const view=fixture(),rule=view.assembly.problem.constraints[0],proposal=[...view.assembly.modules.get(rule.id)!.propagate(view,rule)].find(e=>e.kind==="proposal");
  if(proposal?.kind!=="proposal")throw Error("fixture proposal");
  const stages:CheckContext[]=[],original=PrimitiveRegistry.prototype.checkSteps;
  const spy=vi.spyOn(PrimitiveRegistry.prototype,"checkSteps").mockImplementation(function*(this:PrimitiveRegistry,input,context){stages.push(context);return yield* original.call(this,input,context);});
  try{expect([...checkProposal(proposal.proposal,{view,retained:retainedProof(view),limits,policy:"unconditional",uniqueEvidenceId:null})].at(-1)?.kind).toBe("checked");}
  finally{spy.mockRestore();}
  expect(stages.length).toBeGreaterThan(1);const first=stages[0];
  for(const stage of stages)expect(first.retained.has(stage.currentNode!.id)).toBe(false);
  for(const [id,node] of first.retained)expect(retainedProof(view).get(id)).toBe(node);
});

test("source reservations account failed capture and release held work on generator closure",()=>{
  const view=fixture(),budget=new WorkBudget(10000),w=workspace();
  const cursor=prepareSources(view,w,{level:"facts",reserveWork:n=>budget.reserve(n)});cursor.next();cursor.return(undefined as never);
  expect(budget.used).toBeGreaterThan(0);expect(budget.remaining()+budget.used).toBe(10000);expect(w.usage.bytes).toBe(0);
  const before=budget.used,tight=new IndexWorkspace({entryLimit:1,byteLimit:100000});
  const failed=prepareSources(view,tight,{level:"facts",reserveWork:n=>budget.reserve(n)});
  expect(()=>failed.next()).toThrow();expect(budget.used).toBe(before+65);expect(budget.remaining()+budget.used).toBe(10000);expect(tight.usage.bytes).toBe(0);
});

test("Analyze collects at most four authentic candidates in a4096-unit window",()=>{
  const assembly=assemble(canonicalProblem({schema:1,cells:[0,1,2,3,4,5,6,7],symbols:[1,2],givens:[1,0,1,0,1,0,1,0],
    constraints:[0,2,4,6].map(c=>({id:`pair:${c}`,type:"all-different@1",cells:[c,c+1],parameters:{}}))}),[new AllDifferentRule()]);
  if(!assembly.ok)throw Error("fixture");let view=initialize(assembly.value,"primary");const w=workspace();
  for(const rule of view.assembly.problem.constraints)for(const event of view.assembly.modules.get(rule.id)!.propagate(view,rule))if(event.kind==="proposal"){
    const checked=[...checkProposal(event.proposal,{view,retained:retainedProof(view),limits,policy:"unconditional",uniqueEvidenceId:null})].at(-1);
    if(checked?.kind!=="checked")throw Error("maintenance");view=commitChecked(view,checked.step).view;
  }
  const real=assembleTechniqueJobs(view.assembly,"classic-expanded@1").techniques.find(d=>d.id==="c01@1")!;let proposals=0;
  const observed={...real,*discover(...args:Parameters<typeof real.discover>){for(const event of real.discover(...args)){if(event.kind==="proposal")proposals++;yield event;}}};
  const selection=new StepSelection(view,{rules:[],techniques:[observed]},{...schedulingOptions({limits,mode:"analyze"}),workspace:w});
  const events=[...selection.select()],selected=events.find(e=>e.kind==="checked-step");expect(proposals).toBe(4);
  if(selected?.kind!=="checked-step")throw Error("no candidate");expect(selected.step.proposal.effects).toEqual([{kind:"place",cell:1,symbol:2}]);
  expect(selection.ledger.rows[0].work).toBeLessThanOrEqual(4096);selection.dispose();expect(w.usage.bytes).toBe(0);
});

test("Analyze never services beyond the approved 4096-unit window",()=>{
  const view=fixture(),w=workspace();
  const first={...descriptor("first@1"),*discover(){yield {kind:"work" as const,units:46};yield {kind:"exhausted" as const};}};
  const second={...descriptor("second@1"),*discover(){yield {kind:"work" as const,units:4096};yield {kind:"exhausted" as const};}};
  const selection=new StepSelection(view,{rules:[],techniques:[first,second]},{...schedulingOptions({limits,mode:"analyze"}),workspace:w});
  [...selection.select()];
  expect(selection.ledger.rows.reduce((total,row)=>total+row.work,0)).toBeLessThanOrEqual(4096);
  selection.dispose();expect(w.usage.bytes).toBe(0);
});

test("disabled discovery is revisited at the same revision when readiness changes",()=>{
  const view=fixture(),w=workspace();let ready=false;
  const conditional={...descriptor("u01@1"),*discover(){if(!ready)yield {kind:"disabled" as const,reason:"missing-unique-authority" as const};else yield {kind:"exhausted" as const};}};
  const selection=new StepSelection(view,{rules:[],techniques:[conditional]},{...schedulingOptions({limits}),workspace:w});
  expect([...selection.select()].at(-1)).toMatchObject({kind:"logical-stop",complete:false});
  expect(selection.ledger.rows[0].status).toBe("disabled");ready=true;
  expect([...selection.select()].at(-1)).toMatchObject({kind:"logical-stop",complete:true});selection.dispose();expect(w.usage.bytes).toBe(0);
});
