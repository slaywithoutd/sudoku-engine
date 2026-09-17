import { expect, test } from "vitest";
import { canonicalProblem } from "../../../src/solver/problem";
import { assemble } from "../../../src/solver/rules/assemble";
import { AllDifferentRule } from "../../../src/solver/rules/all-different";
import { initialize, retainedProof } from "../../../src/solver/state/candidates";
import { verifyCertificate } from "../../../src/solver/proof/checker";
import type { DeductionProposal, ProofNode } from "../../../src/solver/proof/types";
import { discoveryContext } from "../../solver/discovery-context";

function countProof(given=0) {
  const result=assemble(canonicalProblem({schema:1,cells:[0,1],symbols:[1,2],givens:[given,0],
    constraints:[{id:"row:0",type:"all-different@1",cells:[0,1],parameters:{}}]}),[new AllDifferentRule()]);
  if(!result.ok)throw Error("fixture");const view=initialize(result.value,"primary"),retained=retainedProof(view);
  const cover=[...view.facts.values()].find(f=>f.proposition.kind==="cover"&&f.proposition.symbol===1)!.id;
  const scope=[...view.facts.values()].find(f=>f.proposition.kind==="all-different")!.id;
  const id=Math.max(...retained.keys())+1;
  // Twice the lower bound minus one upper bound gives -x0-x1 <= -1.
  const node:ProofNode={id,rule:"cover-count-clause@1",premises:[cover,scope,...view.state.domainFacts],scope:[],
    parameters:{symbol:1,covers:[{premise:cover,coefficient:2}],capacities:[{premise:scope,coefficient:1}]},
    conclusion:{kind:"clause",alternatives:[{cell:0,symbol:1,positive:true},{cell:1,symbol:1,positive:true}]}};
  const proposal:DeductionProposal={technique:"test@1",state:view.state.key,effects:[],pattern:{},proof:{state:view.state.key,nodes:[node],imports:[...node.premises].sort((a,b)=>a-b),roots:[id]}};
  const check=()=>[...verifyCertificate(proposal,{view,retained,limits:discoveryContext().limits,policy:"unconditional",uniqueEvidenceId:null})].at(-1);
  return {node,proposal,check,view,retained};
}
test("signed cover count proves an OR from negative incidences",()=>expect(countProof().check()?.kind).toBe("verified"));
test("signed cover count rejects a false implication under a compatible falsification",()=> {
  const b=countProof();(b.node.conclusion as any).alternatives[0].positive=false;
  expect(b.check()).toMatchObject({kind:"rejected",code:"invalid-count-clause-conclusion"});
});

test("positive incidences prove the negative OR and preserve checked integer weights",()=> {
 const b=countProof();(b.node.parameters as any).covers[0].coefficient=1;(b.node.parameters as any).capacities[0].coefficient=2;
 (b.node.conclusion as any).alternatives.forEach((v:any)=>v.positive=false);expect(b.check()?.kind).toBe("verified");
 (b.node.parameters as any).covers[0].coefficient=40;(b.node.parameters as any).capacities[0].coefficient=81;expect(b.check()?.kind).toBe("verified");
});
test.each(["wrong-symbol","missing-domain","duplicate-domain","duplicate-cover","wrong-bound","weight-zero","weight-fraction","weight-large","extra-parameter","complement","duplicate-literal"])("signed count rejects %s",mode=> {
 const b=countProof(),p=b.node.parameters as any,c=b.node.conclusion as any,n=b.node as any;
 if(mode==="wrong-symbol")c.alternatives[0].symbol=2;
 if(mode==="missing-domain"){n.premises.pop();(b.proposal.proof as any).imports=[...n.premises].sort((a:number,b:number)=>a-b);}
 if(mode==="duplicate-domain")n.premises.push(n.premises.at(-1));
 if(mode==="duplicate-cover")p.covers.push(p.covers[0]);
 if(mode==="wrong-bound")p.covers[0].coefficient=1;
 if(mode==="weight-zero")p.covers[0].coefficient=0;
 if(mode==="weight-fraction")p.covers[0].coefficient=1.5;
 if(mode==="weight-large")p.covers[0].coefficient=82;
 if(mode==="extra-parameter")p.bound=-99;
 if(mode==="complement")c.alternatives.splice(1,0,{...c.alternatives[0],positive:false});
 if(mode==="duplicate-literal")c.alternatives.push(c.alternatives[0]);
 expect(b.check()?.kind).toBe("rejected");
});
test.each([1,2])("singleton/absent domains reject incompatible falsification for given %s",given=> {
 const b=countProof(given);if(given===2)(b.node.conclusion as any).alternatives[0].positive=false;
 expect(b.check()).toMatchObject({kind:"rejected",code:"incompatible-count-clause-falsification"});
});
test("absent counted symbol remains a forced zero in compatible count entailment",()=>expect(countProof(2).check()?.kind).toBe("verified"));

import { CoverCountClauseChecker } from "../../../src/solver/proof/count-clause";
test("signed-count strategy carries every premise's scopes, conditional taint, and original rules",()=> {
 const b=countProof(),metadata=new Map(b.node.premises.map((id,i)=>[id,{conclusion:b.retained.get(id)!.conclusion,openAssumptions:[100+i],conditional:i===1,rules:[`source:${i}`]}]));
 const cursor=new CoverCountClauseChecker().check(b.node,{view:b.view,retained:b.retained,limits:discoveryContext().limits,policy:"discharged",uniqueEvidenceId:null,workspaceRemaining:100000,premiseInferences:metadata});
 let work=0,result;while(true){const n=cursor.next();if(n.done){result=n.value;break;}work+=n.value;}
 expect(work).toBeGreaterThanOrEqual(10);expect(result).toMatchObject({conditional:true,openAssumptions:[100,101,102,103],rules:["source:0","source:1","source:2","source:3"]});
 expect(()=>new CoverCountClauseChecker().check(b.node,{view:b.view,retained:b.retained,limits:discoveryContext().limits,policy:"discharged",uniqueEvidenceId:null,workspaceRemaining:65535,premiseInferences:metadata}).next()).toThrow("count-clause-workspace-limit");
});
