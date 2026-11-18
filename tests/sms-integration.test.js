import test from 'node:test';
import assert from 'node:assert/strict';
import {smsPortalHandler,smsPhone,providerResult,createSmsAudit,SMSPORTAL_ENDPOINT} from '../supabase/functions/smsportal-otp/handler.js';

const userId='123e4567-e89b-42d3-a456-426614174000';
const event={user:{id:userId,email:'example@example.com',phone:'',new_phone:'264818083704'},sms:{otp:'123456'}};
const accepted={Messages:1,EventId:'9876543210',Sample:'Your code is 123456',ErrorReport:{NoNetwork:0,Duplicates:0,OptedOuts:0,Faults:[]}};
const invoke=handler=>handler(new Request('https://example.com',{method:'POST',body:JSON.stringify(event)}));
const options={clientId:'client',apiSecret:'secret',verify:()=>event,logger:()=>{}};

test('guide phone formatting preserves one +264 prefix and rejects foreign or malformed numbers',()=>{
 for(const value of ['0818083704','818083704','264818083704','+264818083704','+264 81 808 3704','(081) 808-3704'])assert.equal(smsPhone(value),'+264818083704');
 for(const value of ['',null,'+27818083704','264264818083704','81808370','abc'])assert.throws(()=>smsPhone(value));
});

test('guide v1 request uses Basic API credentials and signed server OTP, never caller-supplied message data',async()=>{
 let outgoing;const handler=smsPortalHandler({...options,clientId:' client ',apiSecret:' secret ',fetcher:async(url,init)=>{outgoing={url,init};return Response.json(accepted);}});
 assert.deepEqual(await(await invoke(handler)).json(),{});
 assert.equal(outgoing.url,SMSPORTAL_ENDPOINT);assert.equal(outgoing.url,'https://rest.smsportal.com/v1/bulkmessages');
 assert.equal(outgoing.init.headers.Authorization,'Basic '+btoa('client:secret'));
 const payload=JSON.parse(outgoing.init.body);assert.equal(payload.messages[0].destination,'+264818083704');assert.match(payload.messages[0].content,/123456/);assert.equal(payload.sendOptions,undefined);
});

test('v1 response parsing supports both casings and excludes the provider Sample and free text',()=>{
 for(const body of [accepted,{messages:1,eventId:'9876543210',sample:'code 123456',errorReport:{noNetwork:0,duplicates:0,optedOuts:0,faults:[]}}]){
  const result=providerResult(body);assert.ok(result.accepted);assert.equal(result.summary.message_count,1);assert.doesNotMatch(JSON.stringify(result.summary),/123456|sample/i);
 }
 for(const body of [{},null,[],{success:true},{Messages:0}])assert.equal(providerResult(body).accepted,false);
});

test('documented v1 error codes distinguish credit, credentials, routing and opt-out failures even on HTTP 200',async()=>{
 for(const [status,body,code] of [
  [403,{ErrorCode:'InsufficientCredits'},'SMS-CREDITS'],
  [401,{code:'InvalidCredentials'},'SMS-AUTH'],
  [400,{code:'DestinationAddress.Invalid'},'SMS-NUMBER'],
  [200,{Messages:0,ErrorReport:{NoNetwork:1}},'SMS-ROUTE'],
  [200,{Messages:0,ErrorReport:{Duplicates:1}},'SMS-DUPLICATE'],
  [200,{Messages:0,ErrorReport:{OptedOuts:1}},'SMS-OPTOUT'],
  [200,{Messages:0,ErrorReport:{Faults:[{code:'InsufficientCredits',description:'secret phone 264818083704 code 123456'}]}},'SMS-CREDITS']
 ]){
  const logs=[];const handler=smsPortalHandler({...options,logger:entry=>logs.push(entry),fetcher:async()=>Response.json(body,{status})});
  const result=await(await invoke(handler)).json();assert.equal(result.error.http_code,502);assert.match(result.error.message,new RegExp(code));
  assert.doesNotMatch(JSON.stringify(logs),/123456|264818083704|secret phone/);
 }
});

test('audit records queued before sending and accepted afterwards without storing OTP or full phone',async()=>{
 const order=[],rows=[];
 const audit={queue:async row=>{order.push('queue');rows.push(row);},complete:async(id,row)=>{order.push('complete');assert.equal(id,rows[0].id);rows.push(row);}};
 const handler=smsPortalHandler({...options,audit,fetcher:async()=>{order.push('provider');return Response.json(accepted);}});
 assert.deepEqual(await(await invoke(handler)).json(),{});assert.deepEqual(order,['queue','provider','complete']);
 assert.equal(rows[0].user_id,userId);assert.equal(rows[0].phone_last4,'3704');assert.equal(rows[0].status,'queued');assert.equal(rows[1].status,'accepted');
 assert.doesNotMatch(JSON.stringify(rows),/123456|264818083704|Your code|secret/);
});

test('audit failures do not block or repeat a valid OTP send',async()=>{
 for(const failAt of ['queue','complete']){
  let sends=0;const logs=[];
  const audit={queue:async()=>{if(failAt==='queue')throw Error('private database failure');},complete:async()=>{if(failAt==='complete')throw Error('private database failure');}};
  const handler=smsPortalHandler({...options,audit,logger:entry=>logs.push(entry),fetcher:async()=>{sends++;return Response.json(accepted);}});
  assert.deepEqual(await(await invoke(handler)).json(),{});assert.equal(sends,1);assert.ok(logs.some(row=>row.code==='SMS-AUDIT'));assert.doesNotMatch(JSON.stringify(logs),/private database failure|123456/);
 }
});

test('timeout is recorded as unknown and never retried automatically',async()=>{
 let sends=0,completion;
 const handler=smsPortalHandler({...options,audit:{queue:async()=>{},complete:async(id,row)=>{completion=row;}},fetcher:async()=>{sends++;throw new DOMException('private timeout','TimeoutError');}});
 const result=await(await invoke(handler)).json();assert.match(result.error.message,/SMS-TIMEOUT/);assert.equal(sends,1);assert.equal(completion.status,'unknown');
});

test('unreadable or unrecognised success bodies never mark an OTP as sent',async()=>{
 for(const body of ['not json','{}','null','{"success":true}']){
  const handler=smsPortalHandler({...options,fetcher:async()=>new Response(body)});
  const result=await(await invoke(handler)).json();assert.match(result.error.message,/SMS-RESPONSE/);
 }
});

test('unauthenticated requests cannot send or create privileged audit rows',async()=>{
 const handler=smsPortalHandler({...options,verify:()=>{throw Error('signature');},audit:{queue:()=>assert.fail('must not log untrusted user'),complete:()=>assert.fail()},fetcher:()=>assert.fail('must not send')});
 assert.equal((await invoke(handler)).status,401);
});

test('audit adapter writes only the dedicated table using server credentials',async()=>{
 const calls=[];const audit=createSmsAudit({url:'https://project.supabase.co/',key:'server-test-key',fetcher:async(url,init)=>{calls.push({url,init});return new Response(null,{status:201});}});
 await audit.queue({id:userId,status:'queued'});await audit.complete(userId,{status:'accepted'});
 assert.equal(calls[0].url,'https://project.supabase.co/rest/v1/sms_logs');assert.equal(calls[0].init.method,'POST');assert.equal(calls[0].init.headers.Authorization,'Bearer server-test-key');assert.match(calls[1].url,/sms_logs\?id=eq\./);assert.equal(calls[1].init.method,'PATCH');
 assert.equal(createSmsAudit({}),null);
 const failed=createSmsAudit({url:'https://project.supabase.co',key:'test',fetcher:async()=>new Response('private database detail',{status:403})});
 await assert.rejects(failed.queue({}),/SMS audit write failed/);
});
