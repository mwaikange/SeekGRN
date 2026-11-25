import {database} from '../server/subscriptions.js';

export function createPublicStatsHandler({
 env=process.env,
 client=()=>database(env,null,true),
 clock=()=>new Date()
}={}){
 return async(req,res)=>{
  res.setHeader('Cache-Control','public, max-age=300, s-maxage=300, stale-while-revalidate=600');
  const fail=(status,error)=>res.status(status).json({error});
  if(req.method!=='GET'){res.setHeader('Allow','GET');return fail(405,'GET required.');}
  if(!env.SUPABASE_SERVICE_ROLE_KEY)return fail(503,'Statistics are temporarily unavailable.');
  try{
   const db=client();
   let activeAccounts=0,page=1;
   const now=clock();
   const nowMs=now.getTime();
   while(true){
    const {data,error}=await db.auth.admin.listUsers({page,perPage:1000});
    if(error||!Array.isArray(data?.users))return fail(503,'Statistics are temporarily unavailable.');
    activeAccounts+=data.users.filter(account=>{
     const hasContact=Boolean(account.email?.trim()||account.phone?.trim());
     const active=!account.deleted_at&&(!account.banned_until||Date.parse(account.banned_until)<=nowMs);
     return active&&hasContact;
    }).length;
    if(data.users.length<1000)break;
    page++;
   }
   const {count,error}=await db.from('subscription_terms')
    .select('id',{count:'exact',head:true})
    .lte('starts_at',now.toISOString())
    .gt('ends_at',now.toISOString());
   if(error||!Number.isSafeInteger(count))return fail(503,'Statistics are temporarily unavailable.');
   return res.status(200).json({activeAccounts,activeSubscriptions:count});
  }catch{
   return fail(503,'Statistics are temporarily unavailable.');
  }
 };
}

export default createPublicStatsHandler();
