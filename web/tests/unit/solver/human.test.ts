import {describe,expect,test} from "vitest";
import {humanSteps} from "../../../src/solver/human";
import {initialize} from "../../../src/solver/state/candidates";
import {assemble} from "../../../src/solver/rules/assemble";
import {AllDifferentRule} from "../../../src/solver/rules/all-different";
import {canonicalProblem} from "../../../src/solver/problem";
import {IndexWorkspace} from "../../../src/solver/indexes/workspace";
import {schedulingOptions} from "../../../src/solver/scheduling/work";
import type {ReadView} from "../../../src/solver/state/types";
import type {TechniqueJobs} from "../../../src/solver/scheduling/ledger";

const limits={timeMs:10000,workUnits:10000,exactNodes:10000,stepNodes:4096,runNodes:65536,proofBytes:8000000,stepBytes:1000000,batchBytes:65536,inFlightBatches:2,workspaceBytes:64000000};
function view(){const assembly=assemble(canonicalProblem({schema:1,cells:[0],symbols:[1],givens:[1],constraints:[]}),[new AllDifferentRule()]);if(!assembly.ok)throw Error("fixture");return initialize(assembly.value,"primary");}
function jobs(_view:ReadView):TechniqueJobs{return {rules:[],techniques:[{id:"empty@1",aliases:[],tier:0,requires:[],assumptionPolicy:"unconditional",bounds:{maxLength:0,maxBranchDepth:0,maxAlternatives:0,maxPatternCells:0,maxSetSize:0},watches:()=>[{kind:"all"}],eligible:()=>({kind:"yes"}),estimate:()=>({hit:0,gain:0,cost:1}),*discover(){yield {kind:"exhausted" as const};}}]};}

describe("human logical phase",()=>{
  test("waits for explicit acceptance before allowing the next selection",()=>{
    const initial=view(),workspace=new IndexWorkspace({entryLimit:1000,byteLimit:limits.workspaceBytes});
    const selection=humanSteps(initial,jobs(initial),{...schedulingOptions({limits}),workspace,accept:(_step:unknown)=>initial});
    const first=selection.next();expect(first.done).toBe(false);selection.return();expect(workspace.usage.bytes).toBe(0);
  });
  test("reports logical budget interruption as incomplete",()=>{
    const initial=view(),workspace=new IndexWorkspace({entryLimit:1000,byteLimit:limits.workspaceBytes});
    const result=[...humanSteps(initial,jobs(initial),{...schedulingOptions({limits,phaseWorkUnits:0}),workspace,accept:(_step:unknown)=>initial})].at(-1);
    expect(result).toMatchObject({kind:"logical-stop",human:"incomplete",reason:"logical-budget"});
    expect(workspace.usage.bytes).toBe(0);
  });
});
