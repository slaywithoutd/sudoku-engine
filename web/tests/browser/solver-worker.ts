import {startWorker} from "../../src/app/solver-worker";
let handle:{terminate():void}|undefined;
const status=document.querySelector("#status")!;const count=document.querySelector("[data-testid=accepted-step-count]")!;
document.querySelector("#start")!.addEventListener("click",()=>{handle=startWorker({kind:"test-long"},{onEvent:event=>{if(event.kind==="terminal")status.textContent=event.outcome??"Complete";},onError:()=>status.textContent="Error"});});
document.querySelector("#cancel")!.addEventListener("click",()=>{handle?.terminate();status.textContent="Cancelled";count.textContent="0";});
