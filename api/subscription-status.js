import {database} from '../server/subscriptions.js';
import {isAppInvoice} from '../src/payment-config.js';
export function createPaymentStatusHandler({env=process.env,client=token=>database(env,token)}={}){
 return async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  const fail=(status,error)=>res.status(status).json({error});
  if(req.method!=='GET'){res.setHeader('Allow','GET');return fail(405,'GET required.');}
  const invoice=req.query?.invoice_id;
  if(!isAppInvoice(invoice))return fail(400,'Invalid SeekGRNJobs payment reference.');
  const token=/^Bearer (\S+)$/i.exec(req.headers.authorization||'')?.[1];
  if(!token)return fail(401,'Sign in with the account used for this payment.');
  try{
   const db=client(token);const auth=await db.auth.getUser(token);
   if(auth.error||!auth.data?.user)return fail(401,'Sign in again to check this payment.');
   const {data,error}=await db.from('subscription_orders').select('invoice_id,app_prefix,app_name,plan,amount,currency,status,paid_at').eq('invoice_id',invoice).eq('user_id',auth.data.user.id).maybeSingle();
   if(error)return fail(503,'Unable to check your payment. Please try again.');
   if(!data||data.app_prefix!=='SEEKGRN'||data.currency!=='NAD')return fail(404,'This payment was not found in your account.');
   return res.status(200).json({order:data});
  }catch{return fail(503,'Unable to check your payment. Please try again.');}
 };
}
export default createPaymentStatusHandler();
