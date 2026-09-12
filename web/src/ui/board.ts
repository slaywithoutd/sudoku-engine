import type { EditorContext,EditorState,Digit } from '../domain/model';
import type { BoardAction } from '../domain/editor';
import { conflictingCells,effectiveValues } from '../domain/classic';
import { keyboardAction } from './input';
import { el,button } from './dom';
export interface BoardOptions {context:EditorContext;state:EditorState;showConflicts:boolean;onAction:(action:BoardAction)=>void}
export interface BoardView {update(state:EditorState,showConflicts:boolean):void;destroy():void}
export function mountBoard(container:HTMLElement,options:BoardOptions):BoardView {
  const wrapper=el('section',undefined,'board-panel'),grid=el('div',undefined,'sudoku-grid'),keypad=el('div',undefined,'keypad'),toolbar=el('div',undefined,'board-toolbar');
  grid.setAttribute('role','grid');grid.setAttribute('aria-label','Tabuleiro de Sudoku');
  grid.setAttribute('aria-rowcount','9');grid.setAttribute('aria-colcount','9');
  let state=options.state;const abort=new AbortController();
  const focus=()=>cells[state.selected].node.focus({preventScroll:true});
  const dispatch=(action:BoardAction)=>{options.onAction(action);focus();};
  const cells=Array.from({length:81},(_,index)=>{
    const node=el('button',undefined,'cell');node.type='button';node.setAttribute('role','gridcell');node.dataset.cellIndex=String(index);
    if(index%9===2||index%9===5)node.classList.add('box-right');if(Math.floor(index/9)===2||Math.floor(index/9)===5)node.classList.add('box-bottom');
    const value=el('span'),notes=el('span');value.dataset.value='';notes.dataset.notes='';node.append(value,notes);
    node.addEventListener('click',()=>dispatch({type:'select',index}),{signal:abort.signal});
    grid.append(node);return {node,value,notes};
  });
  for(let n=1;n<=9;n++) {
    const key=button(String(n),event=>dispatch({type:'digit',digit:n as Digit,corner:event.shiftKey||state.tool==='corner'}));key.setAttribute('aria-label',`Número ${n}`);keypad.append(key);
  }
  const notesButton=button('Notas',()=>dispatch({type:'tool',tool:state.tool==='corner'?'value':'corner'}));
  if(options.context.mode==='play')toolbar.append(notesButton);
  const undo=button('Desfazer',()=>dispatch({type:'undo'})),redo=button('Refazer',()=>dispatch({type:'redo'}));
  toolbar.append(button('Apagar',()=>dispatch({type:'erase'})),undo,redo,button('Reiniciar',()=>dispatch({type:'reset'})));
  wrapper.append(grid,keypad,toolbar);container.append(wrapper);
  wrapper.addEventListener('keydown',event=>{const action=keyboardAction(event,state.tool==='corner');if(action){event.preventDefault();dispatch(action);}},{signal:abort.signal});
  function update(next:EditorState,showConflicts:boolean):void {
    state=next;const values=effectiveValues(state,options.context.givens),conflicts=new Set(showConflicts?conflictingCells(values):[]);
    cells.forEach(({node,value,notes},i)=>{
      const given=options.context.mode==='play'&&!!options.context.givens[i],selected=i===state.selected;
      node.tabIndex=selected?0:-1;node.setAttribute('aria-selected',String(selected));node.classList.toggle('given',given);node.classList.toggle('conflict',conflicts.has(i));
      node.setAttribute('aria-label',`Linha ${Math.floor(i/9)+1}, coluna ${i%9+1}, ${values[i]||'vazia'}${given?', pista fixa':''}${conflicts.has(i)?', conflito':''}${!values[i]&&state.cells[i].notes.length?', notas '+state.cells[i].notes.join(', '):''}`);
      value.textContent=values[i]?String(values[i]):'';notes.hidden=!!values[i];
      notes.replaceChildren(...state.cells[i].notes.map(n=>el('span',String(n))));
    });
    notesButton.setAttribute('aria-pressed',String(state.tool==='corner'));undo.disabled=!state.past.length;redo.disabled=!state.future.length;
  }
  update(state,options.showConflicts);
  return {update,destroy(){abort.abort();wrapper.remove();}};
}
