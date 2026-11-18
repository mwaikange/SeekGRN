import {createHmac,timingSafeEqual} from 'node:crypto';
import {database} from '../server/subscriptions.js';
export const config={api:{bodyParser:false}};
async function rawBody(req){
 const chunks=[];let size=0;
 for await(const chunk of req){const part=Buffer.from(chunk);size+=part.length;if(size>32768)throw Error('Too large');chunks.push(part);}
 return Buffer.concat(chunks);
}
export function createWebhookHandler({env=process.env,client=()=>database(env,null,true),readBody=rawBody}={}){
 return async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  const fail=(status,error)=>res.status(status).json({error});
  if(req.method!=='POST'){res.setHeader('Allow','POST');return fail(405,'POST required.');}
  if(!env.PAYSME_WEBHOOK_SECRET||!env.PAYSME_MERCHANT_ID||!env.SUPABASE_SERVICE_ROLE_KEY)return fail(503,'Payment notifications are not configured.');
  let raw;try{raw=await readBody(req);}catch{return fail(413,'Invalid notification body.');}
  const signature=String(req.headers['x-paysme-signature']||'');
  if(!/^sha256=[a-f0-9]{64}$/i.test(signature))return fail(401,'Invalid signature.');
  const expected=createHmac('sha256',env.PAYSME_WEBHOOK_SECRET).update(raw).digest();
  if(!timingSafeEqual(expected,Buffer.from(signature.slice(7),'hex')))return fail(401,'Invalid signature.');
  let event;try{event=JSON.parse(raw.toString('utf8'));}catch{return fail(400,'Invalid notification.');}
  if(event?.event!=='payment.paid')return res.status(200).json({ignored:true});
  // Accept exactly the documented signed completion, never a browser callback.
  const amount=Number(event.amount);
  if(event.status!=='paid'||event.currency!=='NAD'||event.merchant_id!==env.PAYSME_MERCHANT_ID||!/^SG-[a-f0-9-]{36}$/i.test(event.invoice_id||'')||typeof event.transaction_id!=='string'||!event.transaction_id||event.transaction_id.length>150||!Number.isFinite(amount)||amount<=0)return fail(400,'Payment details do not match.');
  try{
   const {data,error}=await client().rpc('apply_subscription_payment',{p_invoice:event.invoice_id,p_transaction:event.transaction_id,p_amount:amount});
   if(error)return fail(error.code==='P0001'?400:503,'Unable to apply this payment.');
   return res.status(200).json({ok:true,replayed:Boolean(data?.replayed)});
  }catch{return fail(503,'Unable to apply this payment.');}
 };
}
export default createWebhookHandler();
