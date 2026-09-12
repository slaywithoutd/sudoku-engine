import {mountApplication} from '../../src/app/application';
import {openRepository} from '../../src/storage/repository';
import '../../src/styles.css';
const repo=await openRepository(indexedDB,'sudoku-failure-test');let fail=true;
document.querySelector('#allow')!.addEventListener('click',()=>{fail=false;});
mountApplication(document.querySelector('#app')!,{...repo,commit:async(d,r)=>{if(fail)throw new Error('Falha simulada de armazenamento.');return repo.commit(d,r);}},await repo.load());
