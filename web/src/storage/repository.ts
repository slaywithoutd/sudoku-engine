import type { LibraryData } from '../domain/model';
import { emptyLibrary } from '../domain/library';
import { validateLibrary } from '../domain/backup';
export interface Repository { load():Promise<LibraryData>; commit(data:LibraryData,expectedRevision:number):Promise<LibraryData>; close():void }
export class RevisionConflictError extends Error {}
export function openRepository(factory:IDBFactory=indexedDB,name='sudoku-engine',onBlocked:()=>void=()=>{}):Promise<Repository> {
  return new Promise((resolve,reject)=>{
    const request=factory.open(name,1);
    request.onblocked=onBlocked;
    request.onerror=()=>reject(request.error ?? new Error('Não foi possível abrir os dados.'));
    request.onupgradeneeded=()=>{request.result.createObjectStore('library');};
    request.onsuccess=()=>{
      const db=request.result; db.onversionchange=()=>db.close();
      const transact=(mode:IDBTransactionMode,data?:LibraryData,expected?:number):Promise<LibraryData> => new Promise((resolve,reject)=>{
        const tx=db.transaction('library',mode),store=tx.objectStore('library');
        let result:LibraryData|undefined,failure:unknown;
        tx.oncomplete=()=>result ? resolve(result) : reject(new Error('A transação não foi concluída.'));
        tx.onabort=()=>reject(failure ?? tx.error ?? new Error('Não foi possível salvar.'));
        tx.onerror=()=>{failure ??= tx.error;};
        const get=store.get('current');
        get.onsuccess=()=>{
          try {
            const current=get.result===undefined ? emptyLibrary() : validateLibrary(get.result);
            if (!data) {result=current;return;}
            if (current.revision!==expected) throw new RevisionConflictError('Os dados foram alterados em outra aba. Exporte seu trabalho e recarregue para recuperar.');
            result={...data,revision:current.revision+1}; store.put(result,'current');
          } catch (error) {failure=error;tx.abort();}
        };
      });
      resolve({load:()=>transact('readonly'),commit:async(data,expected)=>transact('readwrite',validateLibrary(data),expected),close:()=>db.close()});
    };
  });
}
