import test from 'node:test';
import assert from 'node:assert/strict';
import {namibianPhone,verifiedContacts,registerAccount,sendPhoneCode,verifyContact} from '../src/auth-service.js';
import {smsPortalHandler} from '../supabase/functions/smsportal-otp/handler.js';

test('normalises Namibian contacts without duplicating the fixed country prefix',()=>{
 for(const value of ['0818083704','818083704','+264818083704','264818083704','81 808 3704'])assert.equal(namibianPhone(value),'+264818083704');
 for(const value of ['','+27818083704','264264818083704','81808370','8180837040','abc'])assert.throws(()=>namibianPhone(value));
});
test('registration creates one email identity and retains the phone for verification',async()=>{
 let call;
 const auth={signUp:async args=>{call=args;return {data:{user:{id:'one',identities:[{}]},session:null}};}};
 const result=await registerAccount(auth,{email:' Example@Example.com ',phone:'0818083704',password:'example-password',redirectTo:'https://example.com/'});
 assert.equal(call.email,'example@example.com');assert.equal(call.phone,undefined);
 assert.equal(call.options.data.contact_phone,'+264818083704');assert.equal(result.phone,'+264818083704');
});
test('failed or duplicate signup cannot proceed to phone verification',async()=>{
 const details={email:'example@example.com',phone:'818083704',password:'example-password'};
 await assert.rejects(registerAccount({signUp:async()=>({error:new Error('Rate limit')})},details),/Rate limit/);
 await assert.rejects(registerAccount({signUp:async()=>({data:{user:{identities:[]}}})},details),/Sign in/);
});
test('phone verification attaches to the signed-in identity and fails when SMS is disabled',async()=>{
 const calls=[];const auth={updateUser:async value=>{calls.push(value);return {};}};
 await assert.rejects(sendPhoneCode(auth,'818083704',false),/awaiting activation/);assert.equal(calls.length,0);
 assert.equal(await sendPhoneCode(auth,'0818083704',true),'+264818083704');assert.deepEqual(calls,[{phone:'+264818083704'}]);
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
  fetcher:async(url,options)=>{outgoing={url,options};return Response.json({errorReport:{noOfErrors:0}});}});
 assert.equal((await handler(new Request('https://example.com',{method:'POST',body:'{}'}))).status,200);
 assert.equal(outgoing.url,'https://rest.smsportal.com/v3/BulkMessages');
 assert.equal(outgoing.options.headers.Authorization,'Basic '+btoa('client:secret'));
 const body=JSON.parse(outgoing.options.body);assert.equal(body.messages[0].destination,'264818083704');assert.match(body.messages[0].content,/123456/);
 assert.equal(body.sendOptions,undefined);
});
test('SMSPortal failure never reports a code as delivered or exposes provider details',async()=>{
 const handler=smsPortalHandler({clientId:'client',apiSecret:'secret',verify:()=>({user:{phone:'264818083704'},sms:{otp:'123456'}}),fetcher:async()=>new Response('sensitive provider detail',{status:401})});
 const response=await handler(new Request('https://example.com',{method:'POST',body:'{}'}));
 assert.equal(response.status,502);assert.doesNotMatch(await response.text(),/sensitive provider detail|123456|secret/);
});
