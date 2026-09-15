import type {Assembly} from "./rules/types";
import type {ReadView} from "./state/types";
import type {TechniqueJobs} from "./scheduling/ledger";
import type {SelectionOptions} from "./scheduling/select";
import type {IndexWorkspace} from "./indexes/workspace";
import type {RunKey,SolverSnapshot} from "./snapshot";
import type {Limits} from "./limits";
import type {CheckedStep} from "./proof/types";
import {humanSteps,type HumanEvent,type HumanStopStatus} from "./human";
import {exactInitializationReservation,exactSteps,EXACT_METHOD} from "./exact";
import {mergeEvidence,type CountEvidence,type EvidenceContext,type HumanStatus} from "./evidence";
import type {ExactStats} from "./exact";
import {WorkBudget} from "./scheduling/work";

export interface SolverRunRequest {
  readonly snapshot:SolverSnapshot;readonly assembly:Assembly;readonly view:ReadView;readonly registry:TechniqueJobs;
  readonly workspace:IndexWorkspace;readonly limits:Limits;readonly options:SelectionOptions;readonly run:RunKey;
  readonly accept:(step:CheckedStep)=>ReadView;readonly conditional?:boolean;readonly priorCount?:CountEvidence;
}
export interface SolverPorts {
  readonly clock:{now():number};readonly yieldTask:()=>Promise<void>;
  readonly publish:(event:unknown)=>Promise<void>;readonly awaitAcceptance:(stepId:number)=>Promise<"accepted"|"human-stopped">;
}
export interface SolverTerminal {readonly kind:"terminal";readonly outcome:"complete"|"timeout"|"resource-limit"|"error";readonly code?:string;readonly human:HumanStatus;readonly count:CountEvidence}
const unknownCount:CountEvidence=Object.freeze({kind:"unknown",witnesses:Object.freeze([]),lowerBound:0});

function exactStats(stats:ExactStats):ExactStats{return stats;}
function status(value:HumanStopStatus):HumanStopStatus{return value;}

/** Owns the normalize/assemble -> human -> independent exact phase boundary. */
export async function runSolver(request:SolverRunRequest|any,ports:SolverPorts):Promise<void> {
  // A small injected phase driver is useful for protocol/worker tests and keeps
  // this domain module independent of DOM and Worker globals.
  if(request?.human&&typeof request.human==="function"){
    const result=await request.human();await ports.publish({kind:"terminal",outcome:"complete",human:result.human,count:unknownCount});return;
  }
  const start=ports.clock.now(),totalDeadline=start+request.limits.timeMs;
  let view=request.view as ReadView;const accepted:CheckedStep[]=[];let human:"not-started"|"solved"|"stalled-within-profile"|"incomplete"|"contradiction"="not-started";
  const totalBudget=new WorkBudget(request.limits.workUnits);
  const humanOptions={...request.options,workspace:request.workspace,budget:totalBudget,phaseWorkUnits:Math.floor(request.limits.workUnits*0.7),phaseTimeMs:Math.floor(request.limits.timeMs*0.7),clock:ports.clock};
  const cursor=humanSteps(view,request.registry,{...humanOptions,accept:(step:CheckedStep)=>{const next=request.accept(step);view=next;accepted.push(step);return next;}});
  let count:CountEvidence=request.priorCount??unknownCount;
  try {
    let next=cursor.next();
    while(!next.done){
      const event=next.value;
      if(event.kind==="work"){await ports.publish({kind:"work",phase:"human",units:event.units});await ports.yieldTask();}
      else if(event.kind==="proposal"){
        await ports.publish(event);const ack=await ports.awaitAcceptance(event.stepId);next=cursor.next(ack);continue;
      } else {human=status(event.human);await ports.publish(event);break;}
      if(ports.clock.now()>=totalDeadline){human="incomplete";break;}
      next=cursor.next();
    }
    cursor.return();
    if(request.conditional){await ports.publish({kind:"terminal",outcome:"complete",human,count});return;}
    if(ports.clock.now()>=totalDeadline){await ports.publish({kind:"terminal",outcome:"timeout",human,count});return;}
    const exactStart=ports.clock.now(),reservation=exactInitializationReservation(request.snapshot.problem,request.assembly);
    const lease=request.workspace.reserve(1,reservation.workspaceBytes);let used=0;let evidenceRun=request.run;
    try {
      const exact=exactSteps(request.snapshot.problem,request.assembly);let terminal:ExactStats|undefined;
      for(const event of exact){
        if(ports.clock.now()>=totalDeadline)break;
        if(event.kind==="work"){
          if(used+event.units>request.limits.workUnits)break;
          if(!totalBudget.spend(event.units))break;
          used+=event.units;await ports.publish({kind:"work",phase:"exact",units:event.units,stats:event.stats});
        }
        else if(event.kind==="witness"){
          const context:EvidenceContext={run:request.run,snapshot:request.snapshot,assembly:request.assembly,initialView:request.view,acceptedView:view,accepted,human,activeExactRun:evidenceRun,phase:"exact"};
          count=mergeEvidence(count,{kind:"unknown",witnesses:[event.values],lowerBound:1},context).count;await ports.publish({kind:"evidence",count,stats:event.stats});
        } else if(event.kind==="exhausted"){terminal=event.stats;const context:EvidenceContext={run:request.run,snapshot:request.snapshot,assembly:request.assembly,initialView:request.view,acceptedView:view,accepted,human,activeExactRun:evidenceRun,phase:"exact"};
          const proof={kind:"root-exhausted" as const,key:evidenceRun,method:EXACT_METHOD,stats:exactStats(event.stats),frontierEmpty:true as const};
          const witness=count.kind==="unknown"?(count.witnesses[0]??[]):[];
          count=mergeEvidence(count,{kind:"unique",witness,evidenceId:`${evidenceRun.requestId}:count`,proof,rootExhausted:true},context).count;await ports.publish({kind:"evidence",count,stats:event.stats});
        } else {terminal=event.stats;}
      }
      const outcome=terminal?"complete":"timeout";await ports.publish({kind:"terminal",outcome,human,count,stats:terminal});
    } finally {lease.dispose();void exactStart;}
  } catch(error){await ports.publish({kind:"terminal",outcome:"error",code:error instanceof Error?error.message:"solver-error",human,count});}
}
