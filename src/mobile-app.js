const appAgent = typeof window !== 'undefined' ? navigator.userAgent.match(/\bSeekGRNApp\/1-(Play|Preview)\b/) : null;
export const inMobileApp = Boolean(appAgent);
export const playStoreApp = appAgent?.[1] === 'Play' || (typeof window !== 'undefined' &&
 (location.pathname === '/' || location.pathname === '/mobile') && new URLSearchParams(location.search).get('client') === 'play');

const bridge = 'seekgrn-mobile-v1';
const calls = new Map();
let session, nextId = 0;

function send(message) {
 window.ReactNativeWebView.postMessage(JSON.stringify({bridge,session,...message}));
}

export function mobileUnavailable() {
 if(inMobileApp&&window.ReactNativeWebView)send({action:'workspace-error'});
}

export function mobileReady() {
 if(!inMobileApp)return;
 session ??= globalThis.crypto?.randomUUID?.() || Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
 window.seekGrnNativeReply=({session:replySession,id,value,error})=>{
  const call=calls.get(id);
  if(replySession!==session||!call)return;
  calls.delete(id);
  if(error)call.reject(new Error(error));
  else call.resolve(value);
 };
 window.seekGrnNativeReady=()=>{
  if(window.ReactNativeWebView)send({action:'ready',mode:playStoreApp?'play':'preview'});
 };
 window.seekGrnNativeReady();
}

function request(action,payload={}) {
 return new Promise((resolve,reject)=>{
  if(!window.ReactNativeWebView||!session)throw new Error('The Android file tools are unavailable.');
  const id=++nextId;
  calls.set(id,{resolve,reject});
  try { send({id,action,...payload}); }
  catch(error) { calls.delete(id); reject(error); }
 });
}

export async function pickMobileUpload(kind) {
 const selection=await request(kind==='signature'?'pick-photo':'pick-pdf');
 if(!selection)return null;
 const bytes=Uint8Array.from(atob(selection.base64),character=>character.charCodeAt(0));
 return new File([bytes],selection.name,{type:selection.type});
}

export async function exportMobileFile(action,blob,name) {
 if(blob.size>15*1024*1024)throw new Error('Choose a file no larger than 15 MB.');
 const data=await new Promise((resolve,reject)=>{
  const reader=new FileReader();
  reader.onload=()=>resolve(reader.result);
  reader.onerror=()=>reject(reader.error);
  reader.readAsDataURL(blob);
 });
 return request(action,{name,type:blob.type,base64:data.slice(data.indexOf(',')+1)});
}
