const reply=(status,message)=>new Response(JSON.stringify(message?{error:{http_code:status,message}}:{}),{status,headers:{'Content-Type':'application/json'}});
// Auth reads the structured error from a successful HTTP hook response.
// HTTP 400 is instead hidden behind "Invalid payload sent to hook".
const hookError=(httpCode,message)=>new Response(JSON.stringify({error:{http_code:httpCode,message}}),{status:200,headers:{'Content-Type':'application/json'}});

export function smsPortalHandler({verify,clientId,apiSecret,fetcher=fetch}) {
 return async request=>{
  if(request.method!=='POST')return reply(405,'POST required.');
  if(!clientId||!apiSecret||!verify)return reply(503,'SMS verification is not configured.');
  let event;
  try{event=await verify(await request.text(),Object.fromEntries(request.headers));}
  catch{return reply(401,'Invalid webhook signature.');}
  // Supabase serializes the pending number as new_phone. Keep phone_change
  // for compatibility, and use phone for ordinary mobile sign-in.
  const phone=String(event?.user?.new_phone||event?.user?.phone_change||event?.user?.phone||'').replace(/^\+/,'');
  const otp=String(event?.sms?.otp||'');
  if(!/^2648\d{8}$/.test(phone)||!/^\d{6,10}$/.test(otp))return hookError(400,'Unable to send SMS: the verification request has an invalid mobile number or code.');
  try{
   const result=await fetcher('https://rest.smsportal.com/v3/BulkMessages',{
    method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json',Authorization:'Basic '+btoa(clientId+':'+apiSecret)},
    body:JSON.stringify({messages:[{destination:phone,content:'Your SeekGRNJobs verification code is '+otp+'. Do not share this code.'}]}),
    signal:AbortSignal.timeout(4000)
   });
   if(!result.ok)return hookError(502,'SMS delivery could not be accepted. Please try again later.');
   const body=await result.json();
   if(body.errorReport?.noOfErrors>0)return hookError(502,'SMS delivery could not be accepted. Please try again later.');
   return reply(200);
  }catch{return hookError(502,'SMS delivery is temporarily unavailable.');}
 };
}
