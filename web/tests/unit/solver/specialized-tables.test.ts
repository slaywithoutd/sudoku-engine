import { expect, test } from "vitest";
import { canonicalProblem } from "../../../src/solver/problem";
import { assemble } from "../../../src/solver/rules/assemble";
import { AllDifferentRule } from "../../../src/solver/rules/all-different";
import { initialize, retainedProof } from "../../../src/solver/state/candidates";
import { verifyCertificate } from "../../../src/solver/proof/checker";
import type { ProofNode, Proposition, DeductionProposal } from "../../../src/solver/proof/types";
import { discoveryContext } from "../../solver/discovery-context";

function example(overlap = true) {
  const assembly = assemble(canonicalProblem({ schema: 1, cells: [0,1,2], symbols: [1,2,3], givens: [0,0,0],
    constraints: [{id:"row:0", type:"all-different@1", cells:[0,1,2], parameters:{}}] }), [new AllDifferentRule()]);
  if (!assembly.ok) throw Error("fixture");
  const view = initialize(assembly.value,"primary"), retained = retainedProof(view), nodes: ProofNode[]=[];
  let next = Math.max(...retained.keys())+1;
  const add = (rule:string,premises:number[],conclusion:Proposition,parameters: any={}) => {
    const id=next++; nodes.push({id,rule,premises,conclusion,parameters,scope:[]}); return id;
  };
  const scope = [...view.facts.values()].find(f=>f.proposition.kind==="all-different")!.id;
  const leaf=(cells:number[])=> {
    const subset=add("all-different-subset@1",[scope],{kind:"all-different",cells});
    return add("table-filter@1",[...cells.map(c=>view.state.domainFacts[c]),subset],
      {kind:"table",cells,count:cells.length===1?3:6,definition:next},{cells,box:cells.map(()=>7)});
  };
  const left=leaf(overlap?[0,1]:[0]),right=leaf(overlap?[1,2]:[1]);
  const filter=add("all-different-subset@1",[scope],{kind:"all-different",cells:overlap?[0,2]:[0,1]});
  const cells=overlap?[0,1,2]:[0,1];
  const root=add("table-join-filter@1",[left,right,filter],{kind:"table",cells,count:6,definition:next});
  const proposal=():DeductionProposal=>({technique:"test@1",state:view.state.key,effects:[],pattern:{},
    proof:{state:view.state.key,nodes,imports:[...new Set(nodes.flatMap(n=>n.premises).filter(id=>retained.has(id)))].sort((a,b)=>a-b),roots:[root]}});
  const check=(limits=discoveryContext().limits)=>[...verifyCertificate(proposal(),{view,retained,limits,policy:"discharged",uniqueEvidenceId:null})].at(-1);
  return {nodes,root,left,right,filter,cells,check,proposal,view,retained,add};
}

test.each([true,false])("filtered join checks complete %s overlapping source pairs", overlap=> {
  expect(example(overlap).check()?.kind).toBe("verified");
});

test("join filters preserve every clause alternative and reject one outside the union",()=> {
 const b=example(false),source=[...b.view.facts.values()].find(f=>f.proposition.kind==="cover"&&f.proposition.symbol===1)!.id;
 const root=b.nodes.pop()!,clause=b.add("cover-clause@1",[source],{kind:"clause",alternatives:[0,1,2].map(cell=>({cell,symbol:1,positive:true}))});
 b.nodes.push({...root,id:clause+1,premises:[b.left,b.right,clause],conclusion:{kind:"table",cells:b.cells,count:4,definition:clause+1}});
 // Use a freshly rooted wire after replacing the final allocation.
 const p=b.proposal();(p.proof as any).roots=[clause+1];
 expect([...verifyCertificate(p,{view:b.view,retained:b.retained,limits:discoveryContext().limits,policy:"unconditional",uniqueEvidenceId:null})].at(-1)).toMatchObject({kind:"rejected",code:"invalid-join-filter-constraint"});
});
test.each(["incomplete","copied","parameters","union"])("filtered tables reject %s authority substitutions",mode=> {
 const b=example(),root=b.nodes.at(-1)!;
 if(mode==="incomplete"){const leaf=b.nodes.find(n=>n.id===b.left)!;(leaf.parameters as any).box[0]=1;(leaf.conclusion as any).count=2;}
 if(mode==="copied")(root.conclusion as any).definition=b.left;
 if(mode==="parameters")(root.parameters as any).count=6;
 if(mode==="union")(root as any).rule="table-union@1";
 expect(b.check()?.kind).toBe("rejected");
});

import { TableChecker } from "../../../src/solver/proof/tables";
import type { CheckContext, CheckedInference } from "../../../src/solver/proof/types";
// Direct strategy unit tests use explicit premise metadata to inspect the
// returned provenance; wire authenticity is tested separately above.
function admittedTable() {
 const b=example(),checker=new TableChecker(),retained=new Map(b.retained),metadata=new Map<number,CheckedInference>();
 for(const [id,n]of retained)metadata.set(id,{conclusion:n.conclusion,openAssumptions:[],conditional:false,rules:[`initial:${id}`]});
 const context=(n:ProofNode,workspaceRemaining=1000000):CheckContext=>({view:b.view,retained,limits:discoveryContext().limits,policy:"discharged",uniqueEvidenceId:null,premiseInferences:metadata,currentNode:n,workspaceRemaining});
 for(const n of b.nodes) {
  retained.set(n.id,n);
  if(n.rule==="all-different-subset@1")metadata.set(n.id,{conclusion:n.conclusion,openAssumptions:n.id===b.filter?[999]:[],conditional:n.id===b.filter,rules:[`scope:${n.id}`]});
  else {const cursor=checker.check(n,context(n));while(true){const r=cursor.next();if(r.done){metadata.set(n.id,r.value);break;}}}
 }
 return {...b,checker,retained,metadata,context};
}
test("filtered definition preserves constraint taint and budgets nested recomputation on projection",()=> {
 const b=admittedTable();expect(b.metadata.get(b.root)).toMatchObject({conditional:true,openAssumptions:[999]});
 expect(b.metadata.get(b.root)!.rules).toContain(`scope:${b.filter}`);
 const n:ProofNode={id:b.root+1,rule:"table-project@1",premises:[b.root],parameters:{},scope:[999],conclusion:{kind:"domain",cell:0,mask:7}};
 expect(()=>[...b.checker.check(n,b.context(n,1))]).toThrow("table-workspace-limit");
 expect(()=>[...b.checker.check(n,b.context(n))]).not.toThrow();
 const copied=new TableChecker(),context=b.context(n);
 expect(()=>[...copied.check(n,context)]).toThrow("unauthenticated-table-definition");
 const union:ProofNode={...n,rule:"table-union@1",premises:[b.root,b.root],conclusion:{kind:"table",cells:b.cells,count:12,definition:n.id}};
 expect(()=>[...b.checker.check(union,b.context(union))]).toThrow("mismatched-table-sources");
});
test("filtered row traversal can be closed and restarted without retaining expanded rows",()=> {
 const b=admittedTable(),n:ProofNode={id:b.root+1,rule:"table-project@1",premises:[b.root],parameters:{},scope:[999],conclusion:{kind:"domain",cell:0,mask:7}};
 const cursor=b.checker.check(n,b.context(n));for(let i=0;i<20;i++)expect(cursor.next().done).toBe(false);cursor.return(undefined as never);
 expect(()=>[...b.checker.check(n,b.context(n))]).not.toThrow();
 expect(Object.keys(b.checker.get(b.nodes.at(-1)!)!)).not.toContain("rows");
});
test("filtered join reconstructs counts and checks every supplied filter",()=> {
  const b=example(); (b.nodes.at(-1)!.conclusion as any).count=12;
  expect(b.check()).toMatchObject({kind:"rejected",code:"invalid-table-summary"});
});
