import type { LibraryData } from '../domain/model';
import type { Repository } from '../storage/repository';
import type { Route } from './router';
export type SaveStatus={kind:'saved'|'saving'}|{kind:'error';error:Error};
export interface Controller {
  snapshot():LibraryData; status():SaveStatus; update(transform:(data:LibraryData)=>LibraryData):void;
  subscribe(listener:()=>void):()=>void; flush():Promise<void>; retry():Promise<void>;
}
export interface ScreenServices {controller:Controller;navigate:(route:Route)=>void;newId:()=>string;now:()=>string}
export function createController(repository:Repository,initial:LibraryData):Controller {
  let data=initial,generation=0,savedGeneration=0,committedRevision=initial.revision,status:SaveStatus={kind:'saved'},running:Promise<void>|undefined;
  const listeners=new Set<()=>void>(),notify=()=>listeners.forEach(l=>l());
  async function drain():Promise<void> {
    try {
      while(savedGeneration<generation) {
        const capturedGeneration=generation,capturedData=data;
        const committed=await repository.commit(capturedData,committedRevision);
        committedRevision=committed.revision;data={...data,revision:committedRevision};savedGeneration=capturedGeneration;
        notify();
      }
    } catch(error) {status={kind:'error',error:error instanceof Error ? error : new Error(String(error))};}
  }
  function start():void {
    if(running || status.kind==='error' || savedGeneration===generation)return;
    status={kind:'saving'};
    running=drain().then(()=>{
      running=undefined;
      if(status.kind!=='error')status={kind:savedGeneration===generation?'saved':'saving'};
      notify();
      if(status.kind!=='error'&&savedGeneration<generation)start();
    });
  }
  async function flush():Promise<void> {
    start();while(running)await running;
    if(status.kind==='error')throw status.error;
  }
  return {
    snapshot:()=>data,status:()=>status,
    update(transform){const next=transform(data);if(next===data)return;data=next;generation++;start();notify();},
    subscribe(listener){listeners.add(listener);return()=>{listeners.delete(listener);};},
    flush,
    async retry(){if(running)await running;status={kind:'saving'};start();await flush();},
  };
}
