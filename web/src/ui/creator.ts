import type {ScreenServices} from '../app/controller';
import {parsePuzzleString,conflictingCells} from '../domain/classic';
import {createDraft,finishDraft,renameRecord} from '../domain/library';
import {reduceEditor} from '../domain/editor';
import {mountBoard} from './board';
import {el,button,field} from './dom';
import {dialog} from './dialogs';
export function missing(container:HTMLElement,services:ScreenServices):()=>void {container.append(el('h1','Registro não encontrado'),el('p','Este registro não está disponível nesta biblioteca.'),button('Voltar à biblioteca',()=>services.navigate({screen:'library',tab:'puzzles'})));return ()=>{};}
export function mountCreator(container:HTMLElement,services:ScreenServices,id:string):()=>void {
  const initial=Object.hasOwn(services.controller.snapshot().drafts,id)?services.controller.snapshot().drafts[id]:undefined;
  if(!initial)return missing(container,services);
  if(initial.finishedPuzzleId){services.navigate({screen:'play',id:initial.finishedPuzzleId});return ()=>{};}
  const heading=el('div',undefined,'page-heading');heading.append(el('div','CRIAÇÃO · CLÁSSICO 9 × 9','eyebrow'));
  const layout=el('div',undefined,'editor-layout'),boardHost=el('div'),side=el('aside',undefined,'side-panel'),name=el('input');name.value=initial.name;
  name.addEventListener('change',()=>services.controller.update(d=>renameRecord(d,'draft',id,name.value,services.now())));
  const feedback=el('p',undefined,'feedback');feedback.setAttribute('role','status');
  const finish=button('Finalizar',()=>{
    const puzzleId=services.newId();services.controller.update(d=>finishDraft(d,id,puzzleId,services.now()));
    const d=dialog('Seu jogo está pronto');d.body.append(el('p','Pistas finalizadas. Solubilidade e unicidade não foram verificadas.'));
    d.actions.append(button('Jogar agora',()=>{d.close();services.navigate({screen:'play',id:puzzleId});},'primary'),button('Voltar à biblioteca',()=>{d.close();services.navigate({screen:'library',tab:'puzzles'});}));
    d.node.addEventListener('cancel',()=>services.navigate({screen:'library',tab:'puzzles'}));
  },'primary');
  const paste=button('Colar puzzle',()=>{
    const d=dialog('Colar puzzle'),input=el('textarea'),error=el('p',undefined,'error');error.setAttribute('role','alert');
    d.body.append(el('p','Use 1–9 para pistas e 0 ou ponto para vazias. A importação cria um novo rascunho.'),field('81 células',input),error);
    d.actions.append(button('Cancelar',d.close),button('Importar puzzle',()=>{try{const values=parsePuzzleString(input.value),nextId=services.newId();services.controller.update(data=>createDraft(data,nextId,services.now(),values));d.close();services.navigate({screen:'create',id:nextId});}catch(e){error.textContent=(e as Error).message;}},'primary'));input.focus();
  });
  side.append(el('span','SEU RASCUNHO','eyebrow'),el('h1','Crie um desafio.'),field('Nome do rascunho',name),feedback,finish,paste,el('hr'),el('h2','Comece pelas pistas'),el('p','Selecione uma célula e digite de 1 a 9. Você pode salvar um rascunho com conflitos e voltar depois.'),el('p','As pistas ficam fixas ao finalizar. Para alterá-las depois, crie uma cópia.','muted'));
  layout.append(boardHost,side);container.append(heading,layout);
  const context={mode:'create' as const,givens:Array(81).fill(0)};
  const board=mountBoard(boardHost,{context,state:initial.editor,showConflicts:true,onAction(action){services.controller.update(data=>{const draft=data.drafts[id];if(!draft||draft.finishedPuzzleId)return data;const editor=reduceEditor(context,draft.editor,action);return editor===draft.editor?data:{...data,drafts:{...data.drafts,[id]:{...draft,editor,updatedAt:services.now()}}};});}});
  const update=()=>{const draft=services.controller.snapshot().drafts[id];if(!draft)return;board.update(draft.editor,true);const conflicts=conflictingCells(draft.editor.cells.map(c=>c.value));finish.disabled=!!conflicts.length||!!draft.finishedPuzzleId;paste.disabled=!!draft.finishedPuzzleId;name.disabled=!!draft.finishedPuzzleId;feedback.textContent=conflicts.length?'Resolva os conflitos destacados antes de finalizar.':`${draft.editor.cells.filter(c=>c.value).length} pistas · Sem conflitos visíveis.`;feedback.classList.toggle('error',!!conflicts.length);if(document.activeElement!==name)name.value=draft.name;};
  update();const off=services.controller.subscribe(update);return()=>{off();board.destroy();};
}
