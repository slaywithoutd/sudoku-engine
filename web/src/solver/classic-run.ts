import type {Limits} from "./limits";
import type {CheckedStep,Effect} from "./proof/types";
import type {CountEvidence,HumanStatus} from "./evidence";
import {normalizeClassic} from "./problem";
import {makeSnapshot,type RunKey} from "./snapshot";
import {assemble} from "./rules/assemble";
import {AllDifferentRule} from "./rules/all-different";
import {initialize,commitChecked} from "./state/candidates";
import {IndexWorkspace} from "./indexes/workspace";
import {schedulingOptions,canonicalOptionsKey,SCHEDULER_VERSION} from "./scheduling/work";
import {assembleTechniqueJobs} from "./techniques/registry";
import {EXACT_METHOD,exactSteps} from "./exact";
import {runSolver} from "./run";
import {coverageEntries} from "./techniques/manifest";

const techniqueNames=new Map<string,string>([["rule-propagation@1","Basic elimination"],...coverageEntries.map(entry=>[entry.version,entry.aliases[0]??entry.id] as [string,string])]);

export type ClassicMode="explain"|"analyze";
/** Plain, structured-cloneable events for the Solve screen. */
export type ClassicSolveEvent =
  | {readonly kind:"step";readonly index:number;readonly technique:string;readonly name:string;readonly effects:readonly Effect[];readonly values:readonly number[]}
  | {readonly kind:"precount";readonly solution:readonly number[]}
  | {readonly kind:"progress";readonly phase:"human"|"exact";readonly workUnits:number}
  | {readonly kind:"result";readonly outcome:"complete"|"timeout"|"resource-limit"|"error";readonly code?:string;
      readonly human:HumanStatus;readonly count:"zero"|"unique"|"multiple"|"unknown";
      readonly solution:readonly number[]|null;readonly logicalValues:readonly number[];readonly steps:number};

const PROFILE="classic-expanded@1";
/** Interactive ceilings for one classic 9x9 run; the exact phase inherits what the logical phase leaves. */
export const CLASSIC_SOLVE_LIMITS:Readonly<Limits>=Object.freeze({timeMs:60_000,workUnits:60_000_000,exactNodes:1_000_000,stepNodes:4096,
  runNodes:65536,proofBytes:8_000_000,stepBytes:2_000_000,batchBytes:65536,inFlightBatches:2,workspaceBytes:64_000_000});

export interface ClassicSolveInput {
  readonly givens:readonly number[];readonly mode?:ClassicMode;readonly requestId?:string;readonly limits?:Readonly<Limits>;
}
export interface ClassicSolvePorts {readonly clock:{now():number};readonly emit:(event:ClassicSolveEvent)=>void;readonly progressEveryMs?:number}

function exactPrecount(problem:ReturnType<typeof normalizeClassic>,assembly:Parameters<typeof exactSteps>[1],limits:Readonly<Limits>,clock:{now():number}):{kind:"zero"|"multiple"|"inconclusive"}|{kind:"unique";solution:readonly number[]}{
  const deadline=clock.now()+Math.floor(limits.timeMs*0.1),cap=Math.floor(limits.workUnits*0.1);let used=0;const witnesses:(readonly number[])[]=[];
  const exact=exactSteps(problem,assembly);
  try{
    for(const event of exact){
      if(event.kind==="work"){used+=event.units;if(used>cap||clock.now()>deadline)return {kind:"inconclusive"};}
      else if(event.kind==="witness")witnesses.push(event.values);
      else if(event.kind==="cap-reached")return {kind:"multiple"};
      else return witnesses.length===0?{kind:"zero"}:witnesses.length===1?{kind:"unique",solution:witnesses[0]}:{kind:"multiple"};
    }
  } finally {exact.return();}
  return {kind:"inconclusive"};
}
function countKind(count:CountEvidence):"zero"|"unique"|"multiple"|"unknown"{return count.kind;}
function solutionOf(count:CountEvidence):readonly number[]|null{
  if(count.kind==="unique")return count.witness;
  return null;
}

/**
 * Composes the existing M2 pipeline for one 9x9 classic grid:
 * normalizeClassic -> assemble -> initialize -> logical phase (auto-accepted) -> independent exact count.
 * Throws ProblemInputError for malformed givens; reports rule conflicts as an "error" result.
 */
export async function solveClassic(input:ClassicSolveInput,ports:ClassicSolvePorts):Promise<void>{
  const limits=input.limits??CLASSIC_SOLVE_LIMITS,mode=input.mode??"explain",requestId=input.requestId??"solve";
  const problem=normalizeClassic({kind:"classic",version:1,width:9,height:9,givens:[...input.givens]});
  const empty=(code:string,human:HumanStatus="not-started")=>ports.emit({kind:"result",outcome:"error",code,human,count:"unknown",solution:null,logicalValues:[...problem.givens],steps:0});
  const assembled=assemble(problem,[new AllDifferentRule()]);
  if(!assembled.ok){empty(assembled.issues.map(issue=>issue.code).join(",")||"assembly-failed");return;}
  const assembly=assembled.value,snapshot=makeSnapshot(problem,{kind:"manual"},requestId,0);
  // Cheap exact pre-count: zero or multiple solutions make the explained logical phase meaningless,
  // so report them immediately. Inconclusive or unique grids continue through the full pipeline,
  // whose own exact phase independently re-establishes the count.
  const precheck=exactPrecount(problem,assembly,limits,ports.clock);
  if(precheck.kind!=="inconclusive"&&precheck.kind!=="unique"){
    ports.emit({kind:"result",outcome:"complete",human:"not-started",count:precheck.kind,solution:null,logicalValues:[...problem.givens],steps:0});return;
  }
  if(precheck.kind==="unique")ports.emit({kind:"precount",solution:[...precheck.solution]});
  let view=initialize(assembly,"primary");
  const workspace=new IndexWorkspace({entryLimit:100_000,byteLimit:limits.workspaceBytes});
  const options=schedulingOptions({limits,mode,profile:PROFILE});
  const run:RunKey={requestId,snapshotId:snapshot.snapshotId,inputRevision:0,problemKey:problem.key,operation:"primary",mode,
    engine:"engine@1",profile:PROFILE,scheduler:SCHEDULER_VERSION,checker:"checker@1",exact:EXACT_METHOD,optionsKey:canonicalOptionsKey(options),parentEvidenceId:null};
  const progressEvery=ports.progressEveryMs??250;let lastProgress=ports.clock.now(),work=0,steps=0;
  let pending:{technique:string;effects:readonly Effect[]}|undefined;
  await runSolver({snapshot,assembly,view,registry:assembleTechniqueJobs(assembly,PROFILE),workspace,limits,options,run,
    accept:(step:CheckedStep)=>{view=commitChecked(view,step).view;return view;}},{
    clock:ports.clock,
    yieldTask:async()=>{},
    awaitAcceptance:async()=>"accepted",
    publish:async(raw:unknown)=>{
      const event=raw as {kind:string;phase?:"human"|"exact";units?:number;step?:CheckedStep;outcome?:"complete"|"timeout"|"resource-limit"|"error";code?:string;human?:HumanStatus;count?:CountEvidence};
      if(event.kind==="work"){
        work+=event.units??0;const now=ports.clock.now();
        if(pending){ports.emit({kind:"step",index:steps,technique:pending.technique,name:techniqueNames.get(pending.technique)??pending.technique,effects:pending.effects,values:[...view.state.values]});pending=undefined;}
        if(now-lastProgress>=progressEvery){lastProgress=now;ports.emit({kind:"progress",phase:event.phase??"human",workUnits:work});}
      } else if(event.kind==="proposal"&&event.step){
        // The step is committed by `accept` after this publish resolves; flush its board on the next event.
        if(pending)ports.emit({kind:"step",index:steps,technique:pending.technique,name:techniqueNames.get(pending.technique)??pending.technique,effects:pending.effects,values:[...view.state.values]});
        steps++;pending={technique:event.step.proposal.technique,effects:event.step.proposal.effects};
      } else if(event.kind==="terminal"){
        if(pending){ports.emit({kind:"step",index:steps,technique:pending.technique,name:techniqueNames.get(pending.technique)??pending.technique,effects:pending.effects,values:[...view.state.values]});pending=undefined;}
        const count=event.count!;
        ports.emit({kind:"result",outcome:event.outcome??"error",code:event.code,human:event.human??"not-started",count:countKind(count),
          solution:solutionOf(count),logicalValues:[...view.state.values],steps});
      }
    },
  });
}
