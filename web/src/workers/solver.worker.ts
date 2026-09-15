interface WorkerRequest{readonly kind:"test-long"|"stop"}
interface WorkerEvent{readonly kind:"stats"|"terminal";readonly outcome?:"complete"|"timeout"|"resource-limit"|"error"}
let stopped=false;
const post=(event:WorkerEvent)=>self.postMessage(event);
self.onmessage=(event:MessageEvent<WorkerRequest>)=>{
  if(event.data?.kind==="stop"){stopped=true;return;}
  if(event.data?.kind!=="test-long"){post({kind:"terminal",outcome:"error"});return;}
  stopped=false;let ticks=0;
  const step=()=>{if(stopped)return;if(ticks++>=1000){post({kind:"terminal",outcome:"complete"});return;}post({kind:"stats"});setTimeout(step,0);};
  step();
};
