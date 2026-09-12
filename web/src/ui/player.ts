import type {ScreenServices} from '../app/controller';
import {startPlay} from '../domain/library';
import {reduceEditor} from '../domain/editor';
import {effectiveValues,isComplete} from '../domain/classic';
import {mountBoard} from './board';
import {missing} from './creator';
import {el,button} from './dom';
export function mountPlayer(container:HTMLElement,services:ScreenServices,id:string):()=>void {
  const puzzle=Object.hasOwn(services.controller.snapshot().puzzles,id)?services.controller.snapshot().puzzles[id]:undefined;if(!puzzle)return missing(container,services);
  services.controller.update(d=>startPlay(d,id,services.now()));
  const layout=el('div',undefined,'editor-layout'),host=el('div'),side=el('aside',undefined,'side-panel'),completion=el('div',undefined,'completion'),title=el('h1',puzzle.name);
  completion.setAttribute('role','status');completion.hidden=true;completion.append(el('h2','Sudoku concluído!'),el('p','Todas as linhas, colunas e caixas obedecem às regras do Sudoku clássico.'),button('Fechar mensagem',()=>{completion.hidden=true;}));
  side.append(el('span','JOGAR · CLÁSSICO 9 × 9','eyebrow'),title,el('p','Solubilidade e unicidade não verificadas.','muted'),completion,el('hr'),el('h2','No seu ritmo'),el('p','Setas movem a seleção. Shift + número faz uma nota de canto. Ou ative o botão Notas.'),el('p','Apagar revela as notas guardadas sob um número. Reiniciar limpa seu progresso em uma ação que pode ser desfeita.','muted'));
  layout.append(host,side);container.append(layout);const context={mode:'play' as const,givens:puzzle.definition.givens};let wasComplete=false;
  const board=mountBoard(host,{context,state:services.controller.snapshot().sessions[id].editor,showConflicts:services.controller.snapshot().settings.showConflicts,onAction(action){services.controller.update(data=>{const session=data.sessions[id];if(!session)return data;const editor=reduceEditor(context,session.editor,action);return editor===session.editor?data:{...data,sessions:{...data.sessions,[id]:{...session,editor,updatedAt:services.now()}}};});}});
  const update=()=>{const data=services.controller.snapshot(),session=data.sessions[id];if(!session)return;board.update(session.editor,data.settings.showConflicts);title.textContent=data.puzzles[id].name;const complete=isComplete(effectiveValues(session.editor,context.givens));if(complete&&!wasComplete)completion.hidden=false;if(!complete)completion.hidden=true;wasComplete=complete;};
  update();const off=services.controller.subscribe(update);return()=>{off();board.destroy();};
}
