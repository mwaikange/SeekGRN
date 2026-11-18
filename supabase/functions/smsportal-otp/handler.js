export const SMSPORTAL_ENDPOINT = 'https://rest.smsportal.com/v1/bulkmessages';
const headers = {'Content-Type':'application/json'};
const reply = (status, message) => new Response(JSON.stringify(message ? {error:{http_code:status,message}} : {}), {status,headers});
const hookError = message => new Response(JSON.stringify({error:{http_code:502,message}}), {status:200,headers});

const knownCodes = new Set([
 'InvalidParameter.Format','InvalidParameter.Type','EntityNotFound.Group','EntityNotFound',
 'RequiredParameter.Missing','AuthenticationToken.Invalid','AuthenticationToken.Expired',
 'InvalidCredentials','AuthenticationHeader.Missing','AuthenticationHeader.Invalid',
 'InsufficientCredits','IncorrectScheduledDate','DestinationAddress.NoNetworkFound',
 'DestinationAddress.Invalid','DestinationAddress.Optout','DuplicateMessage',
 'EntityNotFound.ReplyRule','EmptySend.NoValidMessages','InternalServerError'
]);
const messages = {
 'SMS-AUTH':'SMS sending is unavailable. Please contact support@paysme.site.',
 'SMS-ACCESS':'SMS sending is unavailable. Please contact support@paysme.site.',
 'SMS-CREDITS':'SMS sending is unavailable. Please contact support@paysme.site.',
 'SMS-NUMBER':'The mobile number was rejected. Check the number and contact support if it is correct.',
 'SMS-ROUTE':'SMS delivery is unavailable for this mobile network. Please contact support@paysme.site.',
 'SMS-OPTOUT':'This mobile number cannot receive these messages. Please contact support@paysme.site.',
 'SMS-DUPLICATE':'A duplicate SMS was detected. Please wait before requesting another code.',
 'SMS-REQUEST':'The SMS request could not be accepted. Please contact support@paysme.site.',
 'SMS-RATE-LIMIT':'SMS sending is busy. Please wait before requesting another code.',
 'SMS-PROVIDER':'SMS sending is temporarily unavailable. Please try again later.',
 'SMS-REJECTED':'The SMS was not accepted. Please contact support@paysme.site.',
 'SMS-TIMEOUT':'SMS sending timed out. Delivery could not be confirmed. Please wait before trying again.',
 'SMS-NETWORK':'SMS sending could not be confirmed. Please wait before trying again.',
 'SMS-RESPONSE':'SMS sending could not be confirmed. Please wait before trying again.'
};

export function smsPhone(value) {
 let digits = String(value ?? '').trim().replace(/[\s()-]/g,'');
 if(digits.startsWith('+264'))digits=digits.slice(4);
 else if(digits.startsWith('264'))digits=digits.slice(3);
 if(digits.startsWith('0'))digits=digits.slice(1);
 if(!/^8\d{8}$/.test(digits))throw new Error('Invalid Namibian mobile number.');
 return '+264'+digits;
}

// Keep only documented error identifiers and delivery metadata. The provider's
// Sample field and free-text errors can contain the OTP and are never retained.
export function providerResult(body) {
 const codes = new Set();
 let visits=0;
 function scan(value,depth=0) {
  if(++visits>300||depth>5)return;
  if(typeof value==='string'&&knownCodes.has(value))codes.add(value);
  else if(value&&typeof value==='object')for(const child of Object.values(value))scan(child,depth+1);
 }
 scan(body);
 const object = Boolean(body&&typeof body==='object'&&!Array.isArray(body));
 const report = object ? body.errorReport||body.ErrorReport||{} : {};
 const count = value => {
  const n=typeof value==='number'||(typeof value==='string'&&/^\d+$/.test(value))?Number(value):NaN;
  return Number.isInteger(n)&&n>=0&&n<=500?n:undefined;
 };
 const noNetwork=count(report.noNetwork??report.NoNetwork)||0;
 const duplicates=count(report.duplicates??report.Duplicates)||0;
 const optouts=count(report.optedOuts??report.OptedOuts)||0;
 if(noNetwork)codes.add('DestinationAddress.NoNetworkFound');
 if(duplicates)codes.add('DuplicateMessage');
 if(optouts)codes.add('DestinationAddress.Optout');
 const faults=report.faults??report.Faults;
 const faultCount=Array.isArray(faults)?Math.min(faults.length,500):0;
 const errorCount=Math.min(500,Math.max(count(report.noOfErrors??report.NoOfErrors)||0,noNetwork+duplicates+optouts,faultCount));
 const messageCount=object?count(body.messages??body.Messages??body.messageCount??body.MessageCount):undefined;
 const eventId=object?body.eventId??body.EventId:undefined;
 const summary={error_codes:[...codes],error_count:errorCount};
 if(messageCount!==undefined)summary.message_count=messageCount;
 if((typeof eventId==='number'&&Number.isSafeInteger(eventId)&&eventId>=0)||(typeof eventId==='string'&&/^\d{1,30}$/.test(eventId)))summary.event_id=String(eventId);
 const rejected=codes.size>0||errorCount>0||Boolean(object&&(body.error||body.Error))||messageCount===0;
 return {summary,rejected,accepted:object&&!rejected&&messageCount>0};
}

function failureCode(status,codes) {
 if(codes.includes('InsufficientCredits'))return 'SMS-CREDITS';
 if(codes.some(code=>code==='InvalidCredentials'||code.startsWith('Authentication')))return 'SMS-AUTH';
 if(codes.includes('DestinationAddress.Invalid'))return 'SMS-NUMBER';
 if(codes.includes('DestinationAddress.NoNetworkFound'))return 'SMS-ROUTE';
 if(codes.includes('DestinationAddress.Optout'))return 'SMS-OPTOUT';
 if(codes.includes('DuplicateMessage'))return 'SMS-DUPLICATE';
 if(status===401)return 'SMS-AUTH';
 if(status===403)return 'SMS-ACCESS';
 if(status===400)return 'SMS-REQUEST';
 if(status===429)return 'SMS-RATE-LIMIT';
 return status>=400?'SMS-PROVIDER':'SMS-REJECTED';
}

// Runs only on the server, after webhook authentication. Browser callers never
// receive the service-role key or permission to insert/update audit records.
export function createSmsAudit({url,key,fetcher=fetch}) {
 if(!url||!key)return null;
 const endpoint=url.replace(/\/$/,'')+'/rest/v1/sms_logs';
 async function write(method,row,id) {
  const response=await fetcher(endpoint+(id?'?id=eq.'+encodeURIComponent(id):''),{
   method,headers:{...headers,apikey:key,Authorization:'Bearer '+key,Prefer:'return=minimal'},
   body:JSON.stringify(row),signal:AbortSignal.timeout(300)
  });
  if(!response.ok)throw new Error('SMS audit write failed.');
 }
 return {queue:row=>write('POST',row),complete:(id,row)=>write('PATCH',row,id)};
}

export function smsPortalHandler({verify,clientId,apiSecret,fetcher=fetch,audit=null,logger=entry=>console.warn(JSON.stringify(entry))}) {
 const report=(code,stage,details={})=>{try{logger({component:'smsportal-otp',code,stage,...details});}catch{}};
 const timedOut=error=>error?.name==='TimeoutError'||error?.name==='AbortError';
 return async request=>{
  if(request.method!=='POST')return reply(405,'POST required.');
  if(!clientId?.trim()||!apiSecret?.trim()||!verify){
   report('SMS-CONFIG','configuration',{hasClientId:Boolean(clientId?.trim()),hasApiSecret:Boolean(apiSecret?.trim()),hasVerifier:Boolean(verify)});
   return reply(503,'SMS verification is not configured.');
  }
  let event;
  try{event=await verify(await request.text(),Object.fromEntries(request.headers));}
  catch{return reply(401,'Invalid webhook signature.');}
  let phone;
  const otp=String(event?.sms?.otp??'');
  try{
   phone=smsPhone(event?.user?.new_phone||event?.user?.phone_change||event?.user?.phone);
   if(!/^\d{6,10}$/.test(otp))throw new Error('Invalid code.');
  }catch{
   report('SMS-PAYLOAD','validation');
   return new Response(JSON.stringify({error:{http_code:400,message:'The SMS verification request has an invalid mobile number or code.'}}),{status:200,headers});
  }
  const logId=crypto.randomUUID();
  const signedUserId=event?.user?.id;
  const userId=typeof signedUserId==='string'&&/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(signedUserId)?signedUserId:null;
  let auditSaved=false;
  if(audit)try{
   await audit.queue({id:logId,user_id:userId,phone_last4:phone.slice(-4),message_type:'otp',status:'queued'});
   auditSaved=true;
  }catch{report('SMS-AUDIT','audit_queue',{logId});}
  async function finish(status,code,httpStatus=null,summary={}) {
   if(auditSaved)try{
    await audit.complete(logId,{status,error_code:code==='SMS-ACCEPTED'?null:code,provider_http_status:httpStatus,provider_response:summary,completed_at:new Date().toISOString()});
   }catch{auditSaved=false;report('SMS-AUDIT','audit_complete',{logId});}
   report(code,'provider_result',{logId,httpStatus,auditSaved,...summary});
   return code==='SMS-ACCEPTED'?reply(200):hookError(messages[code]+' Reference: '+code+'.');
  }
  let response;
  try{
   response=await fetcher(SMSPORTAL_ENDPOINT,{
    method:'POST',
    headers:{...headers,Accept:'application/json',Authorization:'Basic '+btoa(clientId.trim()+':'+apiSecret.trim())},
    body:JSON.stringify({messages:[{content:'Your SeekGRNJobs verification code is '+otp+'. Do not share this code.',destination:phone}]}),
    signal:AbortSignal.timeout(4000)
   });
  }catch(error){return finish('unknown',timedOut(error)?'SMS-TIMEOUT':'SMS-NETWORK');}
  let body,readError;
  try{body=await response.json();}catch(error){readError=error;}
  const result=providerResult(body);
  if(!response.ok)return finish(response.status>=500?'unknown':'failed',failureCode(response.status,result.summary.error_codes),response.status,result.summary);
  if(readError)return finish('unknown',timedOut(readError)?'SMS-TIMEOUT':'SMS-RESPONSE',response.status);
  if(result.rejected)return finish('failed',failureCode(response.status,result.summary.error_codes),response.status,result.summary);
  if(!result.accepted)return finish('unknown','SMS-RESPONSE',response.status,result.summary);
  return finish('accepted','SMS-ACCEPTED',response.status,result.summary);
 };
}
