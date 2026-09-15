import {el} from "./dom";
export function mountSolverTrace(container:HTMLElement){const section=el("section",undefined,"solver-trace");section.append(el("h2","Accepted explanations"),el("p","No accepted steps yet."));container.append(section);return ()=>section.remove();}
