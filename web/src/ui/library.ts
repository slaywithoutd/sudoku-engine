import type {ScreenServices} from '../app/controller';
import {copyPuzzleToDraft,deleteRecord,renameRecord} from '../domain/library';
import {effectiveValues,isComplete} from '../domain/classic';
import {el,button} from './dom';
import {confirmDelete,renameDialog} from './dialogs';
import {newDraft} from './home';
export function mountLibrary(container:HTMLElement,services:ScreenServices,tab:'drafts'|'puzzles'):()=>void {
  const heading=el('div',undefined,'page-heading');heading.append(el('h1','Sua biblioteca'),button('Criar',()=>newDraft(services),'primary'));
  const tabs=el('div',undefined,'tabs');for(const [key,label] of [['puzzles','Jogos'],['drafts','Rascunhos']] as const){const b=button(label,()=>services.navigate({screen:'library',tab:key}));b.setAttribute('aria-pressed',String(tab===key));tabs.append(b);}
  const future=button('Explorar — em breve',()=>{});future.disabled=true;tabs.append(future);
  const list=el('div',undefined,'library-list');container.append(heading,tabs,list);let previous:unknown;
  function render(){const data=services.controller.snapshot();const records=tab==='drafts'?data.drafts:data.puzzles;const identity=[records,data.sessions];if(previous&&Array.isArray(previous)&&previous[0]===records&&previous[1]===data.sessions)return;previous=identity;
    list.replaceChildren();const items=tab==='drafts'?Object.values(data.drafts).filter(d=>!d.finishedPuzzleId):Object.values(data.puzzles);
    if(!items.length){list.append(el('div',tab==='drafts'?'Nenhum rascunho por aqui. Crie seu primeiro Sudoku.':'Sua biblioteca está pronta para o primeiro jogo. Crie e finalize um rascunho para começar.','empty-state'));return;}
    for(const record of items){const row=el('article',undefined,'library-item'),info=el('div'),actions=el('div',undefined,'actions');
      let status='Rascunho';if(tab==='puzzles'){const session=data.sessions[record.id];status=!session?'Pronto':isComplete(effectiveValues(session.editor,data.puzzles[record.id].definition.givens))?'Concluído':'Em andamento';}
      info.append(el('span',status,'badge'),el('h2',record.name));if(tab==='puzzles')info.append(el('small','Solubilidade e unicidade não verificadas.'));
      const kind=tab==='drafts'?'draft':'puzzle';
      actions.append(button(tab==='drafts'?'Abrir':data.sessions[record.id]?'Continuar':'Jogar',()=>services.navigate({screen:tab==='drafts'?'create':'play',id:record.id}),'primary'));
      actions.append(button('Renomear',()=>renameDialog(record.name,name=>services.controller.update(d=>renameRecord(d,kind,record.id,name,services.now())))));
      if(tab==='puzzles')actions.append(button('Editar cópia',()=>{const id=services.newId();services.controller.update(d=>copyPuzzleToDraft(d,record.id,id,services.now()));services.navigate({screen:'create',id});}));
      actions.append(button('Excluir',()=>confirmDelete(record.name,()=>services.controller.update(d=>deleteRecord(d,kind,record.id)))));
      row.append(info,actions);list.append(row);
    }
  }render();return services.controller.subscribe(render);
}
