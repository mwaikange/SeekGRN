const db = new Promise((resolve,reject)=>{
  const request=indexedDB.open('seekgrnjobs',1);
  request.onupgradeneeded=()=>request.result.createObjectStore('data');
  request.onsuccess=()=>resolve(request.result);
  request.onerror=()=>reject(request.error);
});
async function operate(mode,callback) {
  const database=await db;
  return new Promise((resolve,reject)=>{
    const transaction=database.transaction('data',mode);
    const request=callback(transaction.objectStore('data'));
    transaction.oncomplete=()=>resolve(request.result);
    transaction.onabort=()=>reject(transaction.error ?? request.error);
    transaction.onerror=()=>reject(transaction.error ?? request.error);
  });
}
export const get = key => operate('readonly',store=>store.get(key));
export const put = (key,value) => operate('readwrite',store=>store.put(value,key));
export const remove = key => operate('readwrite',store=>store.delete(key));
