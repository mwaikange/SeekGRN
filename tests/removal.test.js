import test from 'node:test';
import assert from 'node:assert/strict';
import {createRemovalHandler} from '../api/account-removal.js';
import {removalPage} from '../src/removal.js';
import {createSmtpSender,smtpOptions} from '../server/smtp.js';

const details={name:'Example Applicant',email:'example@example.com',phone:'+264 81 000 0000',consent:true};
const env={SMTP_HOST:'mail.example.com',SMTP_PORT:'465',SMTP_USER:'support@paysme.site',SMTP_PASS:'test-only',SMTP_FROM:'SeekGRNJobs <support@paysme.site>'};
async function request(handler,body=details,extra={}){
 const req={method:'POST',headers:{origin:'https://seek-grn.vercel.app','content-type':'application/json'},body,...extra};
 const res={headers:{},setHeader(k,v){this.headers[k]=v;},status(code){this.code=code;return this;},json(data){this.data=data;return this;}};
 await handler(req,res);return res;
}
test('public removal page allows signed-out requests and escapes contact values',()=>{
 const page=removalPage({email:'"><script>alert(1)</script>'});
 assert.ok(page.includes('without signing in'));
 assert.ok(!page.includes('<script>'));assert.ok(page.includes('&lt;script&gt;'));
 assert.ok(page.includes('support@paysme.site'));assert.ok(page.includes('tel:+264836795150'));
});
test('removal endpoint refuses invalid requests before contacting the email provider',async()=>{
 let calls=0;const handler=createRemovalHandler({env,sendMail:async()=>{calls++;throw Error();}});
 for(const body of [{...details,consent:false},{...details,email:'invalid'},{...details,name:'bad\nname'},{...details,reason:'x'.repeat(2001)},{...details,website:'spam'}])assert.equal((await request(handler,body)).code,400);
 assert.equal((await request(handler,details,{method:'GET'})).code,405);
 assert.equal((await request(handler,details,{headers:{origin:'https://other.example','content-type':'application/json'}})).code,403);
 assert.equal(calls,0);
});
test('missing server credentials returns an actionable failure rather than false success',async()=>{
 const response=await request(createRemovalHandler({env:{},sendMail:()=>assert.fail('must not send')}));
 assert.equal(response.code,503);assert.match(response.data.error,/support@paysme.site/);
});
test('SMTP acceptance sends only to support with the applicant as reply-to',async()=>{
 let email;const handler=createRemovalHandler({env,sendMail:async message=>{
  email=message;return {accepted:['support@paysme.site'],rejected:[]};
 }});
 const response=await request(handler,{...details,to:'attacker@example.com'});
 assert.equal(response.code,200);assert.deepEqual(email.to,['support@paysme.site']);assert.equal(email.replyTo,details.email);
 assert.match(email.text,/Verify ownership before deleting/);
 assert.equal((await request(handler)).code,429);
});
test('SMTP rejection and network errors preserve the request for retry without reporting success',async()=>{
 for(const sendMail of [async()=>({accepted:[],rejected:['support@paysme.site']}),async()=>{throw Error('sensitive SMTP credentials');},async()=>({})]){
  const handler=createRemovalHandler({env,sendMail});const response=await request(handler);assert.equal(response.code,502);assert.doesNotMatch(response.data.error,/sensitive SMTP credentials/);assert.equal((await request(handler)).code,502);
 }
});

test('SMTP options require encrypted transport and sender resources close after success or failure',async()=>{
 assert.equal(smtpOptions(env).secure,true);
 const starttls=smtpOptions({...env,SMTP_PORT:'587'});assert.equal(starttls.secure,false);assert.equal(starttls.requireTLS,true);assert.equal(starttls.tls.rejectUnauthorized,undefined);
 assert.throws(()=>smtpOptions({...env,SMTP_PORT:'invalid'}));assert.throws(()=>smtpOptions({...env,SMTP_PASS:''}));
 for(const fail of [false,true]){
  let closed=false;
  const send=createSmtpSender({env,transportFactory:options=>{
   assert.equal(options.host,env.SMTP_HOST);assert.equal(options.auth.pass,'test-only');
   return {sendMail:async message=>{assert.equal(message.subject,'test');if(fail)throw Error('SMTP failure');return {accepted:['support@paysme.site']};},close:()=>{closed=true;}};
  }});
  if(fail)await assert.rejects(send({subject:'test'}),/SMTP failure/);else assert.deepEqual((await send({subject:'test'})).accepted,['support@paysme.site']);
  assert.ok(closed);
 }
});
