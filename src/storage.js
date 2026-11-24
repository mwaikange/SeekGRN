import {supabase,user,isAdmin,encode,decode} from './backend.js';
import {withBundledVacancyUnits} from './circular-parser.js';
import bundledHeadings from './bundled-circular-headings.json';
export async function get(key) {
 if(key==='circular') {
  const {data,error}=await supabase.from('circulars').select('*').eq('id',1).maybeSingle();
  if(error)throw error;
  if(!data)return {title:'No current circular',jobs:[],closes:'2000-01-01',advertised:'2000-01-01',archived:true};
  if(data.pdf==='/circular.pdf')return withBundledVacancyUnits(data,bundledHeadings);
  return {...data,pdf:data.pdf?decode(JSON.parse(data.pdf)):null};
 }
 if(!user)return undefined;
 const {data,error}=await supabase.from('applicant_data').select('value').eq('user_id',user.id).eq('key',key).maybeSingle();
 if(error)throw error;
 return data?decode(data.value):undefined;
}
export async function put(key,value) {
 if(key==='circular') {
  if(!isAdmin)throw new Error('Administrator access is required.');
  const {title,advertised,closes,jobs,pdf}=value;
  const {error}=await supabase.from('circulars').upsert({id:1,title,advertised,closes,jobs,pdf:pdf?JSON.stringify(await encode(pdf)):null,updated_at:new Date().toISOString()});
  if(error)throw error; return;
 }
 if(!user)throw new Error('Sign in to save your profile and documents.');
 const userId=user.id;
 const encoded=await encode(value);
 if(user?.id!==userId)throw new Error('Your session changed. Sign in again to save.');
 const {error}=await supabase.from('applicant_data').upsert({user_id:userId,key,value:encoded,updated_at:new Date().toISOString()});
 if(error)throw error;
}
export async function remove(key) {
 if(!user)throw new Error('Sign in first.');
 const {error}=await supabase.from('applicant_data').delete().eq('user_id',user.id).eq('key',key);
 if(error)throw error;
}
