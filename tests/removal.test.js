import test from 'node:test';
import assert from 'node:assert/strict';
import {createRemovalHandler} from '../api/account-removal.js';
import {removalPage} from '../src/removal.js';

const details={name:'Example Applicant',email:'example@example.com',phone:'+264 81 000 0000',consent:true};
const env={RESEND_API_KEY:'test-only',ACCOUNT_REMOVAL_FROM:'SeekGRNJobs <support@paysme.site>'};
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
 let calls=0;const handler=createRemovalHandler({env,fetcher:async()=>{calls++;throw Error();}});
 for(const body of [{...details,consent:false},{...details,email:'invalid'},{...details,name:'bad\nname'},{...details,reason:'x'.repeat(2001)},{...details,website:'spam'}])assert.equal((await request(handler,body)).code,400);
 assert.equal((await request(handler,details,{method:'GET'})).code,405);
 assert.equal((await request(handler,details,{headers:{origin:'https://other.example','content-type':'application/json'}})).code,403);
 assert.equal(calls,0);
});
test('missing server credentials returns an actionable failure rather than false success',async()=>{
 const response=await request(createRemovalHandler({env:{},fetcher:()=>assert.fail('must not send')}));
 assert.equal(response.code,503);assert.match(response.data.error,/support@paysme.site/);
});
test('verified email-provider acceptance sends only to support with the applicant as reply-to',async()=>{
 let email;const handler=createRemovalHandler({env,fetcher:async(url,options)=>{
  assert.equal(url,'https://api.resend.com/emails');assert.equal(options.headers.Authorization,'Bearer test-only');
  email=JSON.parse(options.body);return Response.json({id:'mock-message-id'});
 }});
 const response=await request(handler,{...details,to:'attacker@example.com'});
 assert.equal(response.code,200);assert.deepEqual(email.to,['support@paysme.site']);assert.equal(email.reply_to,details.email);
 assert.match(email.text,/Verify ownership before deleting/);
 assert.equal((await request(handler)).code,429);
});
test('provider rejection and network errors preserve the request for retry without reporting success',async()=>{
 for(const fetcher of [async()=>Response.json({message:'rejected'},{status:403}),async()=>{throw Error('network');},async()=>Response.json({})]){
  const handler=createRemovalHandler({env,fetcher});assert.equal((await request(handler)).code,502);assert.equal((await request(handler)).code,502);
 }
});
