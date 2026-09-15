import {expect,test} from "vitest";
import {createSolverController} from "../../../src/app/solver-controller";

function fakeWorker(){let callback:(event:unknown)=>void=()=>{};return {start(_request:unknown,handlers:{onEvent:(event:unknown)=>void;onError:(error:Error)=>void}){callback=handlers.onEvent;return {terminate(){}};},deliver(event:unknown){callback(event);}};}
test("cancel invalidates the request before a late result",()=>{
  const worker=fakeWorker(),solver=createSolverController({clock:{now:()=>0},newId:()=>"r",workerFactory:worker});
  solver.start();solver.cancel("user");worker.deliver({kind:"terminal",outcome:"complete"});expect(solver.snapshot().outcome).toBe("cancelled");solver.dispose();
});
