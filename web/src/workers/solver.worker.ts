import {solveClassic,type ClassicSolveEvent,type ClassicMode} from "../solver/classic-run";

type WorkerRequest =
  | {readonly kind:"test-long"|"stop"}
  | {readonly kind:"solve-classic";readonly requestId:string;readonly givens:readonly number[];readonly mode?:ClassicMode};
type WorkerEvent =
  | {readonly kind:"stats"}
  | {readonly kind:"terminal";readonly outcome:"complete"|"timeout"|"resource-limit"|"error";readonly revision?:number;readonly result?:unknown}
  | Exclude<ClassicSolveEvent,{kind:"result"}>;

let stopped=false;
const post=(event:WorkerEvent)=>self.postMessage(event);
self.onmessage=(event:MessageEvent<WorkerRequest>)=>{
  const request=event.data;
  if(request?.kind==="stop"){stopped=true;return;}
  if(request?.kind==="solve-classic"){
    // One run per worker: the controller terminates the worker to cancel.
    solveClassic({givens:request.givens,mode:request.mode,requestId:request.requestId},{
      clock:{now:()=>performance.now()},
      emit:(solveEvent)=>{
        if(solveEvent.kind==="result")post({kind:"terminal",outcome:solveEvent.outcome,revision:solveEvent.steps,result:solveEvent});
        else post(solveEvent);
      },
    }).catch((error:unknown)=>post({kind:"terminal",outcome:"error",result:{code:error instanceof Error?error.message:"solver-error"}}));
    return;
  }
  if(request?.kind!=="test-long"){post({kind:"terminal",outcome:"error"});return;}
  stopped=false;let ticks=0;
  const step=()=>{if(stopped)return;if(ticks++>=1000){post({kind:"terminal",outcome:"complete"});return;}post({kind:"stats"});setTimeout(step,0);};
  step();
};
