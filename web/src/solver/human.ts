import type {ReadView} from "./state/types";
import type {CheckedStep} from "./proof/types";
import type {TechniqueJobs} from "./scheduling/ledger";
import {StepSelection,type SelectionEvent, type SelectionOptions} from "./scheduling/select";
import {isWitness} from "./exact";
import type {IndexWorkspace} from "./indexes/workspace";

export type HumanEvent =
  | {readonly kind:"work";readonly units:number}
  | {readonly kind:"proposal";readonly stepId:number;readonly step:CheckedStep;readonly budgetLimited:boolean}
  | {readonly kind:"logical-stop";readonly human:"solved"|"stalled-within-profile"|"incomplete"|"contradiction";readonly reason:string;readonly accepted:readonly CheckedStep[]};
export type HumanStopStatus="solved"|"stalled-within-profile"|"incomplete"|"contradiction";
export type HumanAcceptance = "accepted"|"human-stopped";
export interface HumanOptions extends SelectionOptions {
  readonly workspace:IndexWorkspace;
  readonly accept:(step:CheckedStep)=>ReadView;
}

function stopStatus(view:ReadView,event:Extract<SelectionEvent,{kind:"logical-stop"}>):HumanStopStatus {
  if(event.reason==="logical-budget"||event.reason==="selection-window"||event.reason==="work-limit"||event.reason==="time-limit")return "incomplete";
  if(event.complete)return isWitness(view.assembly.problem,view.assembly,view.state.values)?"solved":"stalled-within-profile";
  return event.reason.includes("contradiction")?"contradiction":"incomplete";
}

/** Resumable logical phase. A productive proposal is never advanced until its caller ACKs it. */
export function* humanSteps(initial:ReadView,registry:TechniqueJobs,options:HumanOptions):Generator<HumanEvent,void,HumanAcceptance|undefined> {
  let view=initial;const accepted:CheckedStep[]=[];let selection:StepSelection|undefined;let activeCursor:Generator<SelectionEvent,void,unknown>|undefined;let nextStep=0;
  try {
    try { selection=new StepSelection(view,registry,options); }
    catch(error) { if(error instanceof Error&&/work-limit|time-limit/.test(error.message)){yield {kind:"logical-stop",human:"incomplete",reason:"logical-budget",accepted:Object.freeze([...accepted])};return;} throw error; }
    for(;;){
      let stopped:Extract<SelectionEvent,{kind:"logical-stop"}>|undefined;
      let proposal:Extract<SelectionEvent,{kind:"checked-step"}>|undefined;
      const cursor=selection.select();activeCursor=cursor;
      for(;;){
        const result=cursor.next();if(result.done)break;
        const event=result.value;
        if(event.kind==="work"){yield event;continue;}
        if(event.kind==="logical-stop"){stopped=event;break;}
        proposal=event;
        // A checked successor is the final event of this selection pass. Drain
        // the owner before exposing it to the acceptance barrier.
        const done=cursor.next();if(!done.done)throw Error("selection-not-drained");break;
      }
      if(proposal){
        const ack=yield {kind:"proposal",stepId:++nextStep,step:proposal.step,budgetLimited:proposal.budgetLimited};
        if(ack!=="accepted"){
          if(ack==="human-stopped"){yield {kind:"logical-stop",human:"incomplete",reason:"logical-budget",accepted:Object.freeze([...accepted])};return;}
          throw Error("missing-human-acceptance");
        }
        const next=options.accept(proposal.step);accepted.push(proposal.step);selection.advance(next);view=next;continue;
      }
      if(stopped){const human=stopStatus(view,stopped);yield {kind:"logical-stop",human,reason:human==="incomplete"?"logical-budget":stopped.reason,accepted:Object.freeze([...accepted])};return;}
    }
  } finally { activeCursor?.return();selection?.dispose(); }
}
