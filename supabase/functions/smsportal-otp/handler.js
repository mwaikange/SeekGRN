const reply=(status,message)=>new Response(JSON.stringify(message?{error:{http_code:status,message}}:{}),{status,headers:{'Content-Type':'application/json'}});
const hookError=(httpCode,message)=>new Response(JSON.stringify({error:{http_code:httpCode,message}}),{status:200,headers:{'Content-Type':'application/json'}});

const messages={
 'SMS-AUTH':'SMS sending is unavailable. Please contact support@paysme.site.',
 'SMS-REQUEST':'The SMS request could not be accepted. Please contact support@paysme.site.',
 'SMS-RATE-LIMIT':'SMS sending is busy. Please wait before requesting another code.',
 'SMS-PROVIDER':'SMS sending is temporarily unavailable. Please try again later.',
 'SMS-REJECTED':'The SMS service did not accept the message. Please contact support@paysme.site.',
 'SMS-TIMEOUT':'SMS sending timed out. Delivery could not be confirmed. Please wait before trying again.',
 'SMS-NETWORK':'Could not connect to the SMS service. Please try again later.',
 'SMS-RESPONSE':'SMS sending could not be confirmed. Please wait before trying again.'
};

export function smsPortalHandler({verify,clientId,apiSecret,fetcher=fetch,logger=entry=>console.warn(JSON.stringify(entry))}) {
 const report=(code,stage,details={})=>{
  // Only fixed categories, numeric statuses/counts and presence flags.
  // Never log request/response bodies, OTPs, phones, credentials or exceptions.
  try{logger({component:'smsportal-otp',code,stage,...details});}catch{}
 };
 const fail=(code,stage,details={})=>{
  report(code,stage,details);
  return hookError(502,messages[code]+' Reference: '+code+'.');
 };
 const timedOut=error=>error?.name==='TimeoutError'||error?.name==='AbortError';
 return async request=>{
  if(request.method!=='POST')return reply(405,'POST required.');
  if(!clientId||!apiSecret||!verify){
   report('SMS-CONFIG','configuration',{hasClientId:Boolean(clientId),hasApiSecret:Boolean(apiSecret),hasVerifier:Boolean(verify)});
   return reply(503,'SMS verification is not configured.');
  }
  let event;
  try{event=await verify(await request.text(),Object.fromEntries(request.headers));}
  catch{return reply(401,'Invalid webhook signature.');}
  // Auth serializes a pending number as new_phone, not phone_change.
  const phone=String(event?.user?.new_phone||event?.user?.phone_change||event?.user?.phone||'').replace(/^\+/,'');
  const otp=String(event?.sms?.otp||'');
  if(!/^2648\d{8}$/.test(phone)||!/^\d{6,10}$/.test(otp)){
   report('SMS-PAYLOAD','validation');
   return hookError(400,'Unable to send SMS: the verification request has an invalid mobile number or code.');
  }
  let result;
  try{
   result=await fetcher('https://rest.smsportal.com/v3/BulkMessages',{
    method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json',Authorization:'Basic '+btoa(clientId+':'+apiSecret)},
    body:JSON.stringify({messages:[{destination:phone,content:'Your SeekGRNJobs verification code is '+otp+'. Do not share this code.'}]}),
    signal:AbortSignal.timeout(4000)
   });
  }catch(error){return fail(timedOut(error)?'SMS-TIMEOUT':'SMS-NETWORK','provider_fetch');}
  if(!result.ok){
   const status=result.status;
   const code=status===401||status===403?'SMS-AUTH':status===400?'SMS-REQUEST':status===429?'SMS-RATE-LIMIT':'SMS-PROVIDER';
   return fail(code,'provider_http',{httpStatus:status});
  }
  let body;
  try{body=await result.json();}
  catch(error){return fail(timedOut(error)?'SMS-TIMEOUT':'SMS-RESPONSE','provider_response',{httpStatus:result.status});}
  if(!body||typeof body!=='object'||Array.isArray(body))return fail('SMS-RESPONSE','provider_response',{httpStatus:result.status});
  if(body.errorReport?.noOfErrors>0){
   const count=Number(body.errorReport.noOfErrors);
   return fail('SMS-REJECTED','provider_response',{httpStatus:result.status,errorCount:Number.isInteger(count)&&count<=500?count:1});
  }
  report('SMS-ACCEPTED','provider_response',{httpStatus:result.status});
  return reply(200);
 };
}
