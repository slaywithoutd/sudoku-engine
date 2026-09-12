import type {ScreenServices} from '../app/controller';
import {el,field} from './dom';
export function mountSettings(container:HTMLElement,services:ScreenServices):()=>void {
  container.append(el('h1','Configurações'),el('p','Seu jeito de jogar, neste navegador.','muted'));
  const panel=el('section',undefined,'settings-panel'),input=el('input');input.type='checkbox';input.checked=services.controller.snapshot().settings.showConflicts;
  input.addEventListener('change',()=>services.controller.update(d=>({...d,settings:{...d.settings,showConflicts:input.checked}})));
  panel.append(el('h2','Durante o jogo'),field('Destacar conflitos durante o jogo',input),el('p','A criação sempre mostra conflitos. Este ajuste afeta apenas o modo de jogo.','muted'));container.append(panel);
  return services.controller.subscribe(()=>{input.checked=services.controller.snapshot().settings.showConflicts;});
}
