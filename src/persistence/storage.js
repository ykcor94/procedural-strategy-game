const DATABASE='atlas-foundry-worlds',STORE='worlds';
function openDB(){return new Promise((resolve,reject)=>{const req=indexedDB.open(DATABASE,1);req.onupgradeneeded=()=>req.result.createObjectStore(STORE,{keyPath:'id'});req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(new Error('Could not open browser storage. Check private browsing or storage permissions.'));});}
async function transaction(mode,operation){const db=await openDB();return new Promise((resolve,reject)=>{const tx=db.transaction(STORE,mode),request=operation(tx.objectStore(STORE));let result;request.onsuccess=()=>{result=request.result;};tx.oncomplete=()=>{db.close();resolve(result);};tx.onerror=()=>{db.close();reject(new Error('Browser storage failed. Export a world file to keep a copy.'));};});}
// Retain metadata only, so the library does not hold every serialized world.
export async function listWorlds(){
  const db=await openDB();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(STORE,'readonly'),request=tx.objectStore(STORE).openCursor(),items=[];
    request.onsuccess=()=>{const cursor=request.result;if(!cursor)return;const {id,name,summary,savedAt}=cursor.value;items.push({id,name,summary,savedAt});cursor.continue();};
    tx.oncomplete=()=>{db.close();resolve(items.sort((a,b)=>b.savedAt-a.savedAt));};
    tx.onabort=tx.onerror=()=>{db.close();reject(new Error('Could not read the world library.'));};
  });
}
export const getWorld=id=>transaction('readonly',store=>store.get(id));
export const deleteWorld=id=>transaction('readwrite',store=>store.delete(id));
export const saveWorld=(name,data,summary,id=crypto.randomUUID())=>transaction('readwrite',store=>store.put({id,name,data,summary,savedAt:Date.now()})).then(()=>id);
