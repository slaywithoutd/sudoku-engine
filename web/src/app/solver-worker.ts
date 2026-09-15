export interface WorkerHandle{terminate():void}
export interface WorkerCallbacks{readonly onEvent:(event:{readonly kind:string;readonly outcome?:string})=>void;readonly onError?: (error:Error)=>void}
export function startWorker(request:unknown,callbacks:WorkerCallbacks):WorkerHandle{
  let active=true;const worker=new Worker(new URL("../workers/solver.worker.ts",import.meta.url),{type:"module"});
  worker.onmessage=(event:MessageEvent<{kind:string;outcome?:string}>)=>{if(active)callbacks.onEvent(event.data);};
  worker.onerror=(event)=>{if(active){active=false;callbacks.onError?.(new Error(event.message||"solver-worker-error"));}};
  worker.postMessage(request);
  return {terminate(){if(!active)return;active=false;worker.terminate();}};
}
