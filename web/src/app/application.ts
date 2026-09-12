import type {Repository} from '../storage/repository';
import type {LibraryData} from '../domain/model';
import {createController,type ScreenServices} from './controller';
import {parseRoute,routeHash} from './router';
import {mountHome} from '../ui/home';
import {mountLibrary} from '../ui/library';
import {mountCreator} from '../ui/creator';
import {mountPlayer} from '../ui/player';
import {mountSettings} from '../ui/settings';
import {el,button} from '../ui/dom';
import {exportBackup} from '../domain/backup';
export function downloadBackup(services:ScreenServices):void {
  const text=exportBackup(services.controller.snapshot(),services.now()),url=URL.createObjectURL(new Blob([text],{type:'application/json'})),link=el('a');
  link.href=url;link.download=`sudoku-backup-${services.now().slice(0,10)}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),0);
}
export function mountApplication(root:HTMLElement,repository:Repository,initial:LibraryData,initialError?:Error):()=>void {
  root.replaceChildren();const controller=createController(repository,initial),services:ScreenServices={controller,navigate:route=>{location.hash=routeHash(route);},newId:()=>crypto.randomUUID(),now:()=>new Date().toISOString()};
  const header=el('header'),bar=el('div',undefined,'header-inner'),brand=button('▦  sudoku',()=>services.navigate({screen:'home'}),'brand'),nav=el('nav'),main=el('main'),saveArea=el('div',undefined,'save-area'),status=el('span'),error=el('p',undefined,'error');status.dataset.testid='save-status';status.setAttribute('role','status');
  nav.append(button('Início',()=>services.navigate({screen:'home'})),button('Biblioteca',()=>services.navigate({screen:'library',tab:'puzzles'})),button('Configurações',()=>services.navigate({screen:'settings'})));
  const retry=button('Tentar salvar novamente',()=>{void controller.retry().catch(()=>{});}),backup=button('Exportar trabalho',()=>downloadBackup(services));
  saveArea.append(status,retry,backup,error);bar.append(brand,nav);header.append(bar);root.append(header,saveArea,main,el('footer','Seu espaço de Sudoku. Feito para pensar com calma.'));
  const updateStatus=()=>{const s=controller.status();status.textContent=s.kind==='saved'?'Salvo':s.kind==='saving'?'Salvando…':'Não salvo';retry.hidden=backup.hidden=error.hidden=s.kind!=='error';error.textContent=s.kind==='error'?s.error.message:'';};
  const off=controller.subscribe(updateStatus);let dispose=()=>{};
  const render=()=>{dispose();document.querySelectorAll('dialog').forEach(d=>d.remove());main.replaceChildren();const r=parseRoute(location.hash);switch(r.screen){case 'home':dispose=mountHome(main,services);break;case 'library':dispose=mountLibrary(main,services,r.tab);break;case 'create':dispose=mountCreator(main,services,r.id);break;case 'play':dispose=mountPlayer(main,services,r.id);break;case 'settings':dispose=mountSettings(main,services);break;}};
  const beforeUnload=(event:BeforeUnloadEvent)=>{if(controller.status().kind!=='saved'){event.preventDefault();event.returnValue='';}};
  window.addEventListener('hashchange',render);window.addEventListener('beforeunload',beforeUnload);render();updateStatus();
  if(initialError)controller.update(d=>({...d}));
  return()=>{off();dispose();window.removeEventListener('hashchange',render);window.removeEventListener('beforeunload',beforeUnload);repository.close();};
}
