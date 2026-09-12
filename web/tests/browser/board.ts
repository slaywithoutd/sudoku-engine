import { emptyEditor } from '../../src/domain/model';
import { reduceEditor } from '../../src/domain/editor';
import { mountBoard } from '../../src/ui/board';
import '../../src/styles.css';
const givens=Array(81).fill(0);givens[80]=9;
const context={mode:'play' as const,givens};let state=emptyEditor();
const container=document.querySelector<HTMLElement>('#board')!;
const mount=()=>mountBoard(container,{context,state,showConflicts:true,onAction(action){state=reduceEditor(context,state,action);view.update(state,true);}});
let view=mount();document.querySelector('#remount')!.addEventListener('click',()=>{view.destroy();container.replaceChildren();view=mount();});
