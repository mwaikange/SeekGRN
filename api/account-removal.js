import {createHash} from 'node:crypto';

// Public so people who cannot sign in can still request removal. Never deletes data.
export function createRemovalHandler({env=process.env,fetcher=fetch,now=Date.now}={}) {
 const attempts=new Map();
 return async function handler(req,res) {
  res.setHeader('Cache-Control','no-store');
  const reply=(code,error)=>res.status(code).json(error?{error}:{ok:true});
  if(req.method!=='POST'){res.setHeader('Allow','POST');return reply(405,'POST required.');}
  const origin=req.headers.origin;
  const allowed=['https://seek-grn.vercel.app',env.VERCEL_URL&&`https://${env.VERCEL_URL}`,env.ACCOUNT_REMOVAL_ORIGIN].filter(Boolean);
  if(origin&&!allowed.includes(origin))return reply(403,'Open the removal form on SeekGRNJobs to send your request.');
  if(!String(req.headers['content-type']||'').startsWith('application/json'))return reply(415,'JSON required.');
  let data=req.body;
  try{if(typeof data==='string')data=JSON.parse(data);}catch{return reply(400,'Invalid request.');}
  if(!data||typeof data!=='object'||Array.isArray(data))return reply(400,'Invalid request.');
  if(JSON.stringify(data).length>6000)return reply(413,'Request is too long.');
  if(data.website)return reply(400,'Unable to send this request. Please contact support.');
  const name=String(data.name||'').trim(), email=String(data.email||'').trim().toLowerCase();
  const phone=String(data.phone||'').trim(), reason=String(data.reason||'').trim();
  if(!name||name.length>120||/[\r\n]/.test(name)||email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||phone.length>24||(phone&&!/^[+\d ()-]+$/.test(phone))||reason.length>2000||data.consent!==true)return reply(400,'Enter your name, a valid account email and confirm the removal request.');
  if(!env.RESEND_API_KEY||!env.ACCOUNT_REMOVAL_FROM)return reply(503,'Online requests are temporarily unavailable. Please email your request to support@paysme.site.');
  // Best-effort instance-local throttle; the provider also deduplicates retries.
  const key=createHash('sha256').update(email).digest('hex');
  const timestamp=now();
  for(const [k,expiry] of attempts)if(expiry<=timestamp)attempts.delete(k);
  if(attempts.has(key)){res.setHeader('Retry-After','60');return reply(429,'Please wait one minute before sending another request.');}
  attempts.set(key,timestamp+60000);
  try {
   const response=await fetcher('https://api.resend.com/emails',{
    method:'POST',headers:{Authorization:`Bearer ${env.RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':`removal-${key}-${Math.floor(timestamp/300000)}`},
    body:JSON.stringify({from:env.ACCOUNT_REMOVAL_FROM,to:['support@paysme.site'],reply_to:email,subject:'SeekGRNJobs account removal request',text:`Account removal requested\n\nName: ${name}\nAccount email: ${email}\nMobile: ${phone||'Not supplied'}\nAdditional information: ${reason||'None'}\n\nThe requester confirmed this is their own account. Verify ownership before deleting any account or data.`}),
    signal:AbortSignal.timeout(10000)
   });
   const result=await response.json();
   if(!response.ok||!result.id){attempts.delete(key);return reply(502,'Your request could not be sent. Please try again or email support@paysme.site.');}
   return reply(200);
  }catch{attempts.delete(key);return reply(502,'Delivery could not be confirmed. Please email support@paysme.site or try again.');}
 };
}
export default createRemovalHandler();
