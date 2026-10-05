// Metadata and large model blobs are separate so listing projects never loads GLBs.
export function createProjectStore(factory=globalThis.indexedDB){
  let connection;
  const open=()=>connection ||= new Promise((resolve,reject)=>{
    if(!factory)return reject(new Error('Project storage is unavailable in this browser.'));
    const r=factory.open('forma-projects',1);
    r.onupgradeneeded=()=>{r.result.createObjectStore('projects',{keyPath:'id'});r.result.createObjectStore('assets',{keyPath:'id'});};
    r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.onblocked=()=>reject(new Error('Close other Forma tabs and reload to open project storage.'));
  });
  async function transaction(mode,run){const db=await open();return new Promise((resolve,reject)=>{const tx=db.transaction(['projects','assets'],mode);let result;run(tx,value=>result=value);tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error || new Error('Project save cancelled.'));});}
  return {
    list:()=>transaction('readonly',(tx,done)=>{const r=tx.objectStore('projects').getAll();r.onsuccess=()=>done(r.result.sort((a,b)=>b.updatedAt-a.updatedAt));}),
    get:id=>transaction('readonly',(tx,done)=>{const r=tx.objectStore('assets').get(id);r.onsuccess=()=>done(r.result);}),
    put:project=>transaction('readwrite',tx=>{tx.objectStore('projects').put({id:project.id,name:project.name,updatedAt:project.updatedAt,hasModel:!!project.snapshot.spec});tx.objectStore('assets').put(project);}),
    remove:id=>transaction('readwrite',tx=>{tx.objectStore('projects').delete(id);tx.objectStore('assets').delete(id);})
  };
}
