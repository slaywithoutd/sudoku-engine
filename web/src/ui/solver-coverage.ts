import {el} from "./dom";
export function mountSolverCoverage(container:HTMLElement){const section=el("section",undefined,"solver-coverage");section.append(el("h2","Technique coverage"),el("p","Coverage will appear as analysis runs."));container.append(section);return ()=>section.remove();}
