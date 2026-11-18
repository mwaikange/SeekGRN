import {createClient} from '@supabase/supabase-js';
import {PLANS} from '../src/subscription-plans.js';
import {PAYSME_RETURN_URL} from '../src/payment-config.js';
export const PROJECT_URL='https://dmrtrkhjlarjzhaxyflf.supabase.co';
const PUBLIC_KEY='sb_publishable_zWaAa_AY_6HO8d3PDLRw2Q_tMk6OrmD';
export function merchantConfig(env){
 const merchant=env.PAYSME_MERCHANT_ID?.trim(),key=env.PAYSME_API_KEY?.trim();
 if(!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(merchant||'')||!key||!env.PAYSME_WEBHOOK_SECRET||!env.SUPABASE_SERVICE_ROLE_KEY)return null;
 return {vendor_uuid:merchant,api_key:key};
}
export function database(env,token,privileged=false){
 const key=privileged?env.SUPABASE_SERVICE_ROLE_KEY:(env.SUPABASE_PUBLISHABLE_KEY||env.VITE_SUPABASE_PUBLISHABLE_KEY||PUBLIC_KEY);
 if(!key)throw Error('Service unavailable.');
 return createClient(env.SUPABASE_URL||env.VITE_SUPABASE_URL||PROJECT_URL,key,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:token?{Authorization:'Bearer '+token}:{}}});
}
export function createOrderHandler({env=process.env,client=(token)=>database(env,token)}={}){
 return async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  const fail=(status,error)=>res.status(status).json({error});
  if(req.method!=='POST'){res.setHeader('Allow','POST');return fail(405,'POST required.');}
  if(!String(req.headers['content-type']||'').startsWith('application/json'))return fail(415,'JSON required.');
  const token=/^Bearer (\S+)$/i.exec(req.headers.authorization||'')?.[1];
  if(!token)return fail(401,'Sign in to choose a subscription.');
  let body=req.body;
  try{if(typeof body==='string')body=JSON.parse(body);}catch{return fail(400,'Invalid request.');}
  if(!body||typeof body.plan!=='string'||!Object.hasOwn(PLANS,body.plan)||typeof body.town!=='string'||!body.town.trim()||body.town.length>100||/[<>\r\n]/.test(body.town))return fail(400,'Choose a package and enter your town.');
  const config=merchantConfig(env);
  if(!config)return fail(503,'Subscriptions are not available for payment yet. Please try again later.');
  try{
   const db=client(token);const auth=await db.auth.getUser(token);
   if(auth.error||!auth.data?.user)return fail(401,'Sign in again to continue.');
   const {data,error}=await db.rpc('create_subscription_order',{p_plan:body.plan,p_town:body.town.trim()});
   if(error)return fail(400,error.code==='P0001'?error.message:'Unable to prepare your payment request. Please try again.');
   return res.status(200).json({order:data,checkout:{...config,invoice_id:data.invoice_id,amount_nad:data.amount,mobile:auth.data.user.phone,email:auth.data.user.email,town:data.town,idempotency_key:'seekgrn-'+data.invoice_id,redirect_url:PAYSME_RETURN_URL}});
  }catch{return fail(503,'Unable to prepare your payment request. Please try again.');}
 };
}
