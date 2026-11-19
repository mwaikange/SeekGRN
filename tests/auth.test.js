import test from 'node:test';
import assert from 'node:assert/strict';
import {namibianPhone,verifiedContacts,registerAccount,sendPhoneCode,verifyContact,contactProgress,continueContactVerification} from '../src/auth-service.js';
import {checkoutTown,PAYSME_TOWNS} from '../src/paysme-towns.js';
import {smsPortalHandler as createSmsPortalHandler} from '../supabase/functions/smsportal-otp/handler.js';
const smsPortalHandler=options=>createSmsPortalHandler({logger:()=>{},...options});

test('normalises Namibian contacts without duplicating the fixed country prefix',()=>{
 for(const value of ['0818083704','818083704','+264818083704','264818083704','81 808 3704'])assert.equal(namibianPhone(value),'+264818083704');
 for(const value of ['','+27818083704','264264818083704','81808370','8180837040','abc'])assert.throws(()=>namibianPhone(value));
});
test('registration creates one email identity and retains the phone for verification',async()=>{
 let call;
 const auth={signUp:async args=>{call=args;return {data:{user:{id:'one',identities:[{}]},session:null}};}};
 const result=await registerAccount(auth,{email:' Example@Example.com ',phone:'0818083704',town:'Windhoek',password:'example-password',redirectTo:'https://example.com/'});
 assert.equal(call.email,'example@example.com');assert.equal(call.phone,undefined);
 assert.deepEqual(call.options.data,{contact_phone:'+264818083704',checkout_town:'Windhoek'});assert.equal(result.phone,'+264818083704');
 assert.equal(result.town,'Windhoek');
});
test('the PaySME selector matches 76 unique choices and rejects a free-text town',async()=>{
 assert.equal(new Set(PAYSME_TOWNS).size,76);
 for(const town of ['Grünau','Koës','Lüderitz','Maltahöhe'])assert.ok(PAYSME_TOWNS.includes(town));
 assert.equal(checkoutTown({user_metadata:{checkout_town:'Lüderitz'}}),'Lüderitz');
 assert.equal(checkoutTown({user_metadata:{checkout_town:'Elsewhere'}}),'');
 await assert.rejects(sendPhoneCode({updateUser:()=>assert.fail()},'818083704','Elsewhere'),/Choose your town/);
});
test('failed or duplicate signup cannot proceed to phone verification',async()=>{
 const details={email:'example@example.com',phone:'818083704',town:'Windhoek',password:'example-password'};
 await assert.rejects(registerAccount({signUp:async()=>({error:new Error('Rate limit')})},details),/Rate limit/);
 await assert.rejects(registerAccount({signUp:async()=>({data:{user:{identities:[]}}})},details),/Sign in/);
});
test('phone verification calls Auth even when the cached provider flag is false or missing',async()=>{
 const calls=[];const auth={updateUser:async value=>{calls.push(value);return {};}};
 assert.equal(await sendPhoneCode(auth,'818083704','Windhoek'),'+264818083704');
 assert.equal(await sendPhoneCode(auth,'0818083704','Okahandja'),'+264818083704');
 assert.deepEqual(calls,[{phone:'+264818083704',data:{checkout_town:'Windhoek'}},{phone:'+264818083704',data:{checkout_town:'Okahandja'}}]);
 await assert.rejects(sendPhoneCode({updateUser:async()=>({error:new Error('Phone sign-in disabled by server')})},'818083704','Windhoek'),/disabled by server/);
});

test('provider-confirmed email skips email OTP and sends only the mobile challenge',async()=>{
 const account={id:'one',email:'example@example.com',email_confirmed_at:'today',app_metadata:{provider:'google'}};
 const calls=[];const auth={updateUser:async value=>{calls.push(value);return {};},signInWithOtp:()=>assert.fail('verified email must not receive another OTP')};
 const result=await continueContactVerification(auth,account,{email:account.email,phone:'0818083704',town:'Windhoek'});
 assert.deepEqual(contactProgress(account),{email:true,mobile:false,next:'mobile'});
 assert.deepEqual(result.challenge,{phone:'+264818083704',type:'phone_change'});assert.deepEqual(calls,[{phone:'+264818083704',data:{checkout_town:'Windhoek'}}]);
});

test('email confirmation progresses to SMS and an SMS failure never restarts email verification',async()=>{
 const account={id:'one',email:'example@example.com'};let emails=0,sms=0;
 const auth={signInWithOtp:async()=>{emails++;return {};},updateUser:async()=>{sms++;return {error:new Error('SMS hook unavailable')};}};
 assert.equal((await continueContactVerification(auth,account,{email:account.email,phone:'818083704'})).challenge.type,'email');
 account.email_confirmed_at='today';
 await assert.rejects(continueContactVerification(auth,account,{email:account.email,phone:'818083704',town:'Windhoek'}),/SMS hook unavailable/);
 await assert.rejects(continueContactVerification(auth,account,{email:account.email,phone:'818083704',town:'Windhoek'}),/SMS hook unavailable/);
 assert.equal(emails,1);assert.equal(sms,2);
});

test('verified accounts finish without more messages and editable provider metadata cannot verify an email',async()=>{
 const account={id:'one',email:'example@example.com',phone:'264818083704',email_confirmed_at:'today',phone_confirmed_at:'today'};
 assert.deepEqual(await continueContactVerification({},account,{phone:'+264818083704'}),{complete:true});
 assert.equal(contactProgress(account,'811111111').mobile,false);
 assert.equal(contactProgress({...account,email_confirmed_at:undefined,user_metadata:{email_verified:true,provider:'apple'}}).next,'email');
 await assert.rejects(continueContactVerification({},null,{}),/Sign in again/);
});

test('mobile-only accounts add and verify an email on the same user before the next step',async()=>{
 let call;const result=await continueContactVerification({updateUser:async value=>{call=value;return {}; }},{id:'one',phone:'264818083704',phone_confirmed_at:'today'},{email:'example@example.com',phone:'+264818083704'});
 assert.deepEqual(call,{email:'example@example.com'});assert.deepEqual(result.challenge,{email:'example@example.com',type:'email_change'});
});
test('verification rejects a swapped identity and never treats contact metadata as proof',async()=>{
 let signedOut=false;
 const auth={verifyOtp:async()=>({data:{user:{id:'other'}}}),signOut:async()=>{signedOut=true;}};
 await assert.rejects(verifyContact(auth,{email:'example@example.com',type:'email'},'123456','original'),/account changed/);
 assert.equal(signedOut,true);
 assert.equal(verifiedContacts({email:'example@example.com',phone:'264818083704',user_metadata:{verified:true}}),false);
 assert.equal(verifiedContacts({email:'example@example.com',email_confirmed_at:'today',phone:'264818083704',phone_confirmed_at:'today'}),true);
});
test('SMSPortal hook rejects unsigned requests without sending an SMS',async()=>{
 let sends=0;const handler=smsPortalHandler({verify:()=>{throw new Error('invalid');},clientId:'test',apiSecret:'test',fetcher:()=>{sends++;}});
 const response=await handler(new Request('https://example.com',{method:'POST',body:'{}'}));
 assert.equal(response.status,401);assert.equal(sends,0);
});
test('SMSPortal sends the Supabase code to the pending new phone with server credentials',async()=>{
 let outgoing;const handler=smsPortalHandler({clientId:'client',apiSecret:'secret',
  verify:()=>({user:{phone:'264811111111',phone_change:'+264818083704'},sms:{otp:'123456'}}),
  fetcher:async(url,options)=>{outgoing={url,options};return Response.json({Messages:1,EventId:'9876543210',ErrorReport:{NoNetwork:0,Duplicates:0,OptedOuts:0,Faults:[]}});}});
 assert.equal((await handler(new Request('https://example.com',{method:'POST',body:'{}'}))).status,200);
 assert.equal(outgoing.url,'https://rest.smsportal.com/v1/bulkmessages');
 assert.equal(outgoing.options.headers.Authorization,'Basic '+btoa('client:secret'));
 const body=JSON.parse(outgoing.options.body);assert.equal(body.messages[0].destination,'+264818083704');assert.match(body.messages[0].content,/123456/);
 assert.equal(body.sendOptions,undefined);
});
test('SMSPortal failure never reports a code as delivered or exposes provider details',async()=>{
 const handler=smsPortalHandler({clientId:'client',apiSecret:'secret',verify:()=>({user:{phone:'264818083704'},sms:{otp:'123456'}}),fetcher:async()=>new Response('sensitive provider detail',{status:401})});
 const response=await handler(new Request('https://example.com',{method:'POST',body:'{}'}));
 assert.equal(response.status,200);const body=await response.json();assert.equal(body.error.http_code,502);assert.doesNotMatch(JSON.stringify(body),/sensitive provider detail|123456|secret/);
});

test('SMSPortal accepts the Supabase new_phone payload when adding a mobile to an email account',async()=>{
 let outgoing;
 const event={user:{id:'email-account',email:'example@example.com',email_confirmed_at:'2026-11-18T08:00:00Z',phone:'',new_phone:'264818083704',is_anonymous:false},sms:{otp:'123456'}};
 const handler=smsPortalHandler({clientId:'client',apiSecret:'secret',verify:payload=>JSON.parse(payload),fetcher:async(url,options)=>{outgoing=JSON.parse(options.body);return Response.json({Messages:1,EventId:'9876543210',ErrorReport:{NoNetwork:0,Duplicates:0,OptedOuts:0,Faults:[]}});}});
 const response=await handler(new Request('https://example.com',{method:'POST',body:JSON.stringify(event)}));
 assert.equal(response.status,200);assert.deepEqual(await response.json(),{});assert.equal(outgoing.messages[0].destination,'+264818083704');
});

test('SMSPortal uses new_phone before the old number and supports ordinary mobile sign-in',async()=>{
 for(const user of [{phone:'264811111111',new_phone:'+264818083704'},{phone:'264811111111',phone_change:'264822222222',new_phone:'+264818083704'},{phone:'+264818083704'}]){
  let destination;
  const handler=smsPortalHandler({clientId:'client',apiSecret:'secret',verify:()=>({user,sms:{otp:'123456'}}),fetcher:async(url,options)=>{destination=JSON.parse(options.body).messages[0].destination;return Response.json({Messages:1,EventId:'9876543210',ErrorReport:{NoNetwork:0,Duplicates:0,OptedOuts:0,Faults:[]}});}});
  assert.equal((await handler(new Request('https://example.com',{method:'POST',body:'{}'}))).status,200);assert.equal(destination,'+264818083704');
 }
});

test('malformed signed SMS events return a structured Auth error without sending or leaking a code',async()=>{
 const events=[null,{}, {user:{new_phone:'invalid',phone:'264818083704'},sms:{otp:'123456'}},{user:{new_phone:'264818083704'},sms:{otp:'invalid'}},{user:{user_metadata:{contact_phone:'264818083704'}},sms:{otp:'123456'}}];
 for(const event of events){
  const handler=smsPortalHandler({clientId:'client',apiSecret:'secret',verify:()=>event,fetcher:()=>assert.fail('must not send malformed events')});
  const response=await handler(new Request('https://example.com',{method:'POST',body:'{}'}));
  assert.equal(response.status,200);const body=await response.json();assert.equal(body.error.http_code,400);assert.match(body.error.message,/invalid mobile number or code/);assert.doesNotMatch(JSON.stringify(body),/123456|secret/);
 }
});

test('SMSPortal message rejection and timeouts remain structured errors instead of false success',async()=>{
 for(const fetcher of [async()=>Response.json({errorReport:{noOfErrors:1}}),async()=>{throw Error('sensitive network detail');}]){
  const handler=smsPortalHandler({clientId:'client',apiSecret:'secret',verify:()=>({user:{new_phone:'264818083704'},sms:{otp:'123456'}}),fetcher});
  const response=await handler(new Request('https://example.com',{method:'POST',body:'{}'}));
  assert.equal(response.status,200);const body=await response.json();assert.equal(body.error.http_code,502);assert.doesNotMatch(JSON.stringify(body),/sensitive network detail|123456|secret/);
 }
});

test('SMS diagnostics distinguish provider HTTP failures without logging request or response secrets',async()=>{
 for(const [status,code] of [[400,'SMS-REQUEST'],[401,'SMS-AUTH'],[403,'SMS-ACCESS'],[429,'SMS-RATE-LIMIT'],[500,'SMS-PROVIDER']]){
  const logs=[];
  const handler=smsPortalHandler({clientId:'private-client',apiSecret:'private-api-key',logger:entry=>logs.push(entry),verify:()=>({user:{new_phone:'264818083704'},sms:{otp:'123456'}}),fetcher:async()=>new Response('secret provider body with 123456 and 264818083704',{status})});
  const response=await handler(new Request('https://example.com',{method:'POST',body:'{}'}));const body=await response.json();
  assert.equal(response.status,200);assert.equal(body.error.http_code,502);assert.match(body.error.message,new RegExp(code));
  assert.equal(logs.at(-1).component,'smsportal-otp');assert.equal(logs.at(-1).code,code);assert.equal(logs.at(-1).httpStatus,status);
  assert.doesNotMatch(JSON.stringify({logs,body}),/private-client|private-api-key|123456|264818083704|secret provider body/);
 }
});

test('SMS diagnostics distinguish timeouts, connection failures, and unreadable provider responses',async()=>{
 for(const [fetcher,code] of [
  [async()=>{throw new DOMException('private timeout detail','TimeoutError');},'SMS-TIMEOUT'],
  [async()=>{throw Error('private network detail');},'SMS-NETWORK'],
  [async()=>new Response('private response detail'),'SMS-RESPONSE'],
  [async()=>Response.json(null),'SMS-RESPONSE'],
  [async()=>Response.json({errorReport:{noOfErrors:1}}),'SMS-REJECTED']
 ]){
  const logs=[];const handler=smsPortalHandler({clientId:'client',apiSecret:'secret',logger:entry=>logs.push(entry),verify:()=>({user:{new_phone:'264818083704'},sms:{otp:'123456'}}),fetcher});
  const body=await(await handler(new Request('https://example.com',{method:'POST',body:'{}'}))).json();
  assert.equal(body.error.http_code,502);assert.match(body.error.message,new RegExp(code));assert.equal(logs[0].code,code);assert.doesNotMatch(JSON.stringify(logs),/private|123456|264818083704/);
 }
});
