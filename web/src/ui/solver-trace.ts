import {el} from "./dom";
import {cellName} from "./solver-copy";
export interface TraceStep {readonly index:number;readonly name:string;readonly effects:readonly {readonly kind:"place"|"remove";readonly cell:number;readonly symbol:number}[]}
export function mountSolverTrace(container:HTMLElement){
  const section=el("section",undefined,"solver-trace"),list=el("ol"),empty=el("p","No accepted steps yet.");
  section.append(el("h2","Accepted explanations"),empty,list);container.append(section);
  return {
    add(step:TraceStep){
      empty.hidden=true;
      const effects=step.effects.map(effect=>`${cellName(effect.cell)}${effect.kind==="place"?"=":"≠"}${effect.symbol}`).join(", ");
      list.append(el("li",`${step.name}: ${effects||"no change"}`));
    },
    clear(){list.replaceChildren();empty.hidden=false;},
  };
}
