import type {ScreenServices} from "../app/controller";
import {el,button} from "./dom";
import {mountSolverBoard} from "./solver-board";
import {mountSolverTrace} from "./solver-trace";
import {mountSolverCoverage} from "./solver-coverage";
import {solverStatus} from "./solver-copy";
export function mountSolver(container:HTMLElement,_services:ScreenServices){
  const heading=el("div",undefined,"page-heading"),main=el("div",undefined,"solver-layout"),controls=el("div",undefined,"solver-controls");
  heading.append(el("h1","Solve"),el("p","Temporary input and analysis."));
  const mode=el("fieldset"),legend=el("legend","Analysis mode");mode.append(legend);
  for(const label of ["Explain","Analyze"]){const input=document.createElement("input");input.type="radio";input.name="solver-mode";input.value=label.toLowerCase();input.checked=label==="Explain";const text=el("label",label);text.prepend(input);mode.append(text);}
  const start=button("Start",()=>{start.disabled=true;status.textContent=solverStatus("running");verification.hidden=false;});
  const cancel=button("Cancel",()=>{start.disabled=false;status.textContent=solverStatus("cancelled");});
  const status=el("p","Ready");status.setAttribute("role","status");const verification=el("section",undefined,"solver-verification");verification.hidden=true;verification.append(el("h2","Solution verification"),el("p","Logical evidence and independent count evidence are shown separately."));
  controls.append(mode,start,cancel,status);const result=el("section",undefined,"solver-result");result.dataset.testid="solver-result";
  mountSolverBoard(result,{values:Array(81).fill(0),givens:Array(81).fill(false)});main.append(controls,result,verification);mountSolverTrace(main);mountSolverCoverage(main);container.append(heading,main);return ()=>container.replaceChildren();
}
