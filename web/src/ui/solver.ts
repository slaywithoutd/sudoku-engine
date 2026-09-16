import type {ScreenServices} from "../app/controller";
import type {EditorState,Value} from "../domain/model";
import {emptyEditor} from "../domain/model";
import {reduceEditor} from "../domain/editor";
import {conflictingCells,parsePuzzleString} from "../domain/classic";
import {createSolverController,type SolverController} from "../app/solver-controller";
import {startWorker} from "../app/solver-worker";
import {mountBoard,type BoardView} from "./board";
import {mountSolverTrace,type TraceStep} from "./solver-trace";
import {countSummary,logicalSummary,solverStatus} from "./solver-copy";
import {el,button,field} from "./dom";
import {dialog} from "./dialogs";

interface SolveResult {readonly outcome:string;readonly code?:string;readonly human:string;readonly count:string;readonly solution:readonly number[]|null;readonly logicalValues:readonly number[];readonly steps:number}
type SolveEvent =
  | ({readonly kind:"step";readonly values:readonly number[]}&TraceStep)
  | {readonly kind:"precount";readonly solution:readonly number[]}
  | {readonly kind:"progress";readonly phase:string;readonly workUnits:number};

const editorFrom=(values:readonly number[]):EditorState=>({...emptyEditor(),cells:values.map(value=>({value:value as Value,notes:[]}))});

/** Default wiring: the controller owns one real module worker per run. */
export function classicSolverController(services:ScreenServices):SolverController{
  return createSolverController({clock:{now:()=>Date.now()},newId:services.newId,workerFactory:{start:(request,handlers)=>{
    const {requestId,input,options}=request as {requestId:string;input:{givens:number[]};options:{mode:"explain"|"analyze"}|null};
    return startWorker({kind:"solve-classic",requestId,givens:input.givens,mode:options?.mode},{onEvent:handlers.onEvent,onError:handlers.onError});
  }}});
}

/**
 * Volatile Solve screen. Clues are entered on the same board/editor used by
 * Create (nothing is persisted); results are shown on that board in play mode,
 * so the original clues stay visually fixed.
 */
export function mountSolver(container:HTMLElement,services:ScreenServices,solver:SolverController=classicSolverController(services)){
  const heading=el("div",undefined,"page-heading"),main=el("div",undefined,"solver-layout"),controls=el("div",undefined,"solver-controls");
  heading.append(el("h1","Solve"),el("p","Temporary input and analysis. Enter clues, paste a puzzle or load one from your library."));
  // Analyze is a real engine mode, but its 4,096-unit selection window and phase
  // share are still unmeasured for a full 9x9 grid (docs/decisions.md D063):
  // rule propagation alone on a cold board usually exceeds that window, so a
  // whole-puzzle Analyze run reports "incomplete" after zero accepted steps.
  // Disabled here until those defaults are benchmarked; Explain is unaffected.
  const mode=el("fieldset");mode.append(el("legend","Analysis mode"));
  for(const label of ["Explain","Analyze"]){const input=document.createElement("input");input.type="radio";input.name="solver-mode";input.value=label.toLowerCase();input.checked=label==="Explain";input.disabled=label==="Analyze";const text=el("label",label);text.prepend(input);mode.append(text);}
  mode.append(el("p","Analyze is experimental and not yet available for full puzzles.","muted"));
  const selectedMode=()=>(mode.querySelector<HTMLInputElement>("input:checked")?.value??"explain") as "explain"|"analyze";

  const inputContext={mode:"create" as const,givens:Array<Value>(81).fill(0)};
  let editor=emptyEditor(),clues:readonly Value[]=inputContext.givens,board:BoardView|undefined,showingResult=false;
  const boardHost=el("div"),keypadHost=el("div"),boardColumn=el("section",undefined,"solver-result");
  boardColumn.append(boardHost,keypadHost);
  const status=el("p","Ready");status.setAttribute("role","status");status.dataset.testid="solver-status";
  const feedback=el("p",undefined,"feedback");
  const verification=el("section",undefined,"solver-verification");verification.hidden=true;verification.dataset.testid="solver-verification";
  const countLine=el("p"),logicLine=el("p");verification.append(el("h2","Solution verification"),countLine,logicLine);

  const values=()=>editor.cells.map(cell=>cell.value);
  const showInput=()=>{
    board?.destroy();showingResult=false;keypadHost.hidden=false;
    board=mountBoard(boardHost,{context:inputContext,state:editor,showConflicts:true,controlsContainer:keypadHost,onAction(action){
      if(solver.snapshot().outcome==="running")return;
      const next=reduceEditor(inputContext,editor,action);if(next===editor)return;
      editor=next;board?.update(editor,true);renderControls();
    }});
  };
  const showGrid=(shown:readonly number[])=>{
    board?.destroy();showingResult=true;keypadHost.hidden=true;
    let state=editorFrom(shown);const context={mode:"play" as const,givens:clues};
    board=mountBoard(boardHost,{context,state,showConflicts:false,controlsContainer:keypadHost,onAction(action){
      if(action.type==="select"){state={...state,selected:action.index};board?.update(state,false);}
    }});
  };
  const reset=()=>{verification.hidden=true;countLine.textContent="";logicLine.textContent="";trace.clear();};
  const loadValues=(next:readonly Value[])=>{solver.cancel("input");editor=editorFrom(next);reset();showInput();renderControls();};

  const start=button("Start",()=>{
    const current=values();if(conflictingCells(current).length)return;
    clues=current;reset();solver.replaceInput({givens:current});solver.setOptions({mode:selectedMode()});solver.start();
  },"primary");
  const cancel=button("Cancel",()=>solver.cancel("user"));
  const edit=button("Edit puzzle",()=>{solver.cancel("edit");reset();showInput();renderControls();});
  const clear=button("Clear",()=>loadValues(Array<Value>(81).fill(0)));
  const paste=button("Paste puzzle",()=>{
    const d=dialog("Paste puzzle"),input=el("textarea"),error=el("p",undefined,"error");error.setAttribute("role","alert");
    d.body.append(el("p","Use 1–9 for clues and 0 or a dot for empty cells."),field("81 cells",input),error);
    d.actions.append(button("Cancel",d.close),button("Load puzzle",()=>{
      try{const parsed=parsePuzzleString(input.value);d.close();loadValues(parsed);}catch(e){error.textContent=(e as Error).message;}
    },"primary"));
    input.focus();
  });
  const library=el("select");library.setAttribute("aria-label","Load from library");
  const fillLibrary=()=>{
    const data=services.controller.snapshot(),options=[new Option("Load from library…","")];
    for(const puzzle of Object.values(data.puzzles))options.push(new Option(`Puzzle: ${puzzle.name}`,`puzzle:${puzzle.id}`));
    for(const draft of Object.values(data.drafts))if(!draft.finishedPuzzleId)options.push(new Option(`Draft: ${draft.name}`,`draft:${draft.id}`));
    library.replaceChildren(...options);renderControls();
  };
  library.addEventListener("change",()=>{
    const separator=library.value.indexOf(":"),kind=library.value.slice(0,separator),id=library.value.slice(separator+1),data=services.controller.snapshot();
    library.value="";
    if(kind==="puzzle"&&Object.hasOwn(data.puzzles,id))loadValues(data.puzzles[id].definition.givens);
    else if(kind==="draft"&&Object.hasOwn(data.drafts,id))loadValues(data.drafts[id].editor.cells.map(cell=>cell.value));
  });

  controls.append(mode,paste,library,clear,start,cancel,edit,status,feedback);
  main.append(controls,boardColumn,verification);
  const trace=mountSolverTrace(main);
  container.append(heading,main);

  function renderControls(){
    const running=solver.snapshot().outcome==="running",current=values(),conflicts=conflictingCells(current).length;
    start.disabled=running||showingResult||!!conflicts;cancel.disabled=!running;edit.hidden=!showingResult||running;
    paste.disabled=running;clear.disabled=running;mode.disabled=running;library.disabled=running||library.options.length<2;
    feedback.hidden=showingResult;
    feedback.textContent=conflicts?"Resolve the highlighted conflicts before solving.":`${current.filter(Boolean).length} clues · No visible conflicts.`;
    feedback.classList.toggle("error",!!conflicts);
  }
  let seenEvent:unknown=null,seenOutcome="idle",seenRequest="";
  const onSolver=()=>{
    const snapshot=solver.snapshot();
    if(snapshot.requestId!==seenRequest){seenRequest=snapshot.requestId;seenEvent=null;}
    const event=snapshot.lastEvent as SolveEvent|null;
    if(snapshot.outcome==="running"&&event&&event!==seenEvent){
      seenEvent=event;
      if(event.kind==="step"){trace.add(event);status.textContent=`${solverStatus("running")} · ${event.index} steps`;if(selectedMode()==="explain")showGrid(event.values);}
      else if(event.kind==="precount"){verification.hidden=false;countLine.textContent="A solution exists. Verifying uniqueness…";if(selectedMode()==="analyze")showGrid(event.solution);}
    }
    if(snapshot.outcome!==seenOutcome){
      seenOutcome=snapshot.outcome;status.textContent=solverStatus(snapshot.outcome);
      const result=snapshot.result as (Partial<SolveResult>&{error?:string})|null;
      if(snapshot.outcome==="running")showGrid(clues);
      else if(result&&typeof result.count==="string"){
        verification.hidden=false;status.textContent=solverStatus(result.outcome??snapshot.outcome);
        countLine.textContent=countSummary(result.count);logicLine.textContent=logicalSummary(result.human??"",result.steps??0);
        showGrid(result.solution??result.logicalValues??clues);
      } else if(snapshot.outcome==="error"){verification.hidden=false;countLine.textContent=`The solver stopped with an error${result?.error||result?.code?`: ${result.error??result.code}`:""}.`;logicLine.textContent="";}
    }
    renderControls();
  };
  showInput();fillLibrary();renderControls();
  const offSolver=solver.subscribe(onSolver),offLibrary=services.controller.subscribe(fillLibrary);
  return ()=>{offSolver();offLibrary();solver.dispose();board?.destroy();container.replaceChildren();};
}
