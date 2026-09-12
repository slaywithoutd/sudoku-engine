import type {ScreenServices} from '../app/controller';
import {el,field,button} from './dom';
import {downloadBackup} from './backup';
import {parseBackup,previewRestore} from '../domain/backup';
import {dialog} from './dialogs';
export function mountSettings(container:HTMLElement,services:ScreenServices):()=>void {
  container.append(el('h1','Configurações'),el('p','Seu jeito de jogar, neste navegador.','muted'));
  const panel=el('section',undefined,'settings-panel'),input=el('input');input.type='checkbox';input.checked=services.controller.snapshot().settings.showConflicts;
  input.addEventListener('change',()=>services.controller.update(d=>({...d,settings:{...d.settings,showConflicts:input.checked}})));
  panel.append(el('h2','Durante o jogo'),field('Destacar conflitos durante o jogo',input),el('p','A criação sempre mostra conflitos. Este ajuste afeta apenas o modo de jogo.','muted'));container.append(panel);
  const backup=el('section',undefined,'settings-panel'),file=el('input'),error=el('p',undefined,'error');file.type='file';file.accept='.json,application/json';error.setAttribute('role','alert');error.hidden=true;let active=true;
  backup.append(el('h2','Sua biblioteca, com você'),el('p','O backup inclui seus rascunhos, jogos, notas, históricos e configurações. Ao importar, registros diferentes são preservados como cópias.'),button('Exportar backup',()=>downloadBackup(services)),field('Importar backup',file),error);container.append(backup);
  file.addEventListener('change',async()=>{
    const selected=file.files?.[0];file.value='';if(!selected)return;error.hidden=true;
    try {
      const incoming=parseBackup(await selected.text());if(!active)return;
      const d=dialog('Resumo da importação'),summary=el('p'),restore=el('input'),notice=el('p',undefined,'error');restore.type='checkbox';
      let captured=services.controller.snapshot(),preview=previewRestore(captured,incoming,services.newId,false);
      const refresh=()=>{captured=services.controller.snapshot();preview=previewRestore(captured,incoming,services.newId,restore.checked);summary.textContent=`${preview.added} novos · ${preview.copied} cópias · ${preview.skipped} ignorados`;};
      d.body.append(summary,field('Restaurar configurações do backup',restore),notice);restore.addEventListener('change',refresh);refresh();
      d.actions.append(button('Cancelar',d.close),button('Aplicar importação',()=>{
        if(services.controller.snapshot()!==captured){refresh();notice.textContent='A biblioteca mudou. Confira o resumo atualizado e aplique novamente.';return;}
        services.controller.update(()=>preview.data);d.close();
      },'primary'));
    }catch(e){if(active){error.hidden=false;error.textContent=(e as Error).message;}}
  });
  const off=services.controller.subscribe(()=>{input.checked=services.controller.snapshot().settings.showConflicts;});
  return ()=>{active=false;off();};
}
