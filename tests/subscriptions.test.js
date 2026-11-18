import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {PLANS,regularSubscriber,preparationAvailable} from '../src/subscription-plans.js';
import {createOrderHandler} from '../server/subscriptions.js';
import {createWebhookHandler} from '../api/paysme-webhook.js';
const merchant='123e4567-e89b-42d3-a456-426614174000';
const invoice='SEEKGRN-8A2DD90';
const env={PAYSME_MERCHANT_ID:merchant,PAYSME_API_KEY:'merchant-integration-key',PAYSME_WEBHOOK_SECRET:'private-signing-key',SUPABASE_SERVICE_ROLE_KEY:'private-server-key'};
const response=()=>({headers:{},setHeader(k,v){this.headers[k]=v;},status(code){this.code=code;return this;},json(body){this.body=body;return this;}});
const orderReq=(body={plan:'annual',town:'Okahandja'})=>({method:'POST',headers:{'content-type':'application/json',authorization:'Bearer user-token'},body});
const paid={event:'payment.paid',invoice_id:invoice,transaction_id:'TX_123',amount:360,currency:'NAD',status:'paid',merchant_id:merchant};
const sign=raw=>'sha256='+createHmac('sha256',env.PAYSME_WEBHOOK_SECRET).update(raw).digest('hex');
async function notify(event,mutate={},db={rpc:async()=>({data:{replayed:false}})}){
 const raw=Buffer.from(JSON.stringify(event));const req={method:'POST',headers:{'x-paysme-signature':sign(raw)},...mutate};
 const res=response();await createWebhookHandler({env,client:()=>db,readBody:async()=>raw})(req,res);return res;
}
test('subscription prices, savings, allowances and role visibility match requested packages',()=>{
 assert.deepEqual(Object.values(PLANS).map(p=>[p.monthly,p.months,p.total,p.quota,p.saving]),[[50,1,50,20,0],[40,6,240,30,60],[30,12,360,null,240]]);
 for(const p of Object.values(PLANS)){assert.equal(p.monthly*p.months,p.total);assert.equal(50*p.months-p.total,p.saving);}
 assert.equal(regularSubscriber({id:'user'},false),true);assert.equal(regularSubscriber({id:'admin'},true),false);assert.equal(regularSubscriber(null,false),false);
 assert.equal(preparationAvailable({remaining:0,free_remaining:1}),true);assert.equal(preparationAvailable({remaining:0,free_remaining:0}),false);assert.equal(preparationAvailable({unlimited:true}),true);
});
test('payment creation requires a valid signed-in account and configured merchant',async()=>{
 let calls=0;const db={auth:{getUser:async()=>({error:Error('expired')})},rpc:()=>{calls++;}};
 const handler=createOrderHandler({env,client:()=>db});let res=response();await handler({...orderReq(),headers:{}},res);assert.equal(res.code,415);
 res=response();await handler({...orderReq(),headers:{'content-type':'application/json'}},res);assert.equal(res.code,401);
 res=response();await handler(orderReq(),res);assert.equal(res.code,401);assert.equal(calls,0);
 res=response();await createOrderHandler({env:{},client:()=>assert.fail()})(orderReq(),res);assert.equal(res.code,503);assert.doesNotMatch(JSON.stringify(res.body),/private|integration-key/);
});
test('payment order ignores caller prices and uses the server invoice for SDK configuration',async()=>{
 let args;const db={auth:{getUser:async()=>({data:{user:{id:'user',email:'test@example.com',phone:'+264818083704'}}})},rpc:async(name,input)=>{args={name,input};return {data:{invoice_id:invoice,plan:'annual',amount:360,town:'Okahandja'}};}};
 const res=response();await createOrderHandler({env,client:()=>db})(orderReq({plan:'annual',town:'Okahandja',amount:1,user_id:'another'}),res);
 assert.equal(res.code,200);assert.deepEqual(args,{name:'create_subscription_order',input:{p_plan:'annual',p_town:'Okahandja'}});assert.equal(res.body.checkout.amount_nad,360);assert.equal(res.body.checkout.invoice_id,invoice);assert.equal(res.body.checkout.redirect_url,'https://www.paysme.site/payment/return');assert.equal(res.body.checkout.idempotency_key,'seekgrn-'+invoice);
 assert.doesNotMatch(JSON.stringify(res.body),/private-signing-key|private-server-key/);
});
test('invalid plan and town are rejected before creating an order',async()=>{
 for(const body of [{plan:'toString',town:'Windhoek'},{plan:'annual',town:''},{plan:'annual',town:'<script>'}]){const res=response();await createOrderHandler({env,client:()=>assert.fail()})(orderReq(body),res);assert.equal(res.code,400);}
});
test('only raw-body HMAC signed paid NAD events for this merchant reach activation',async()=>{
 let calls=0;const db={rpc:async(name,args)=>{calls++;assert.equal(name,'apply_subscription_payment');assert.equal(args.p_amount,360);assert.equal(args.p_currency,'NAD');return {data:{replayed:false}};}};
 assert.equal((await notify(paid,{},db)).code,200);assert.equal(calls,1);
 for(const event of [{...paid,currency:'USD'},{...paid,merchant_id:'another'},{...paid,status:'pending'},{...paid,amount:0},{...paid,transaction_id:''}])assert.equal((await notify(event,{},db)).code,400);
 const unsigned=await notify(paid,{headers:{}},db);assert.equal(unsigned.code,401);
 const tampered=await notify(paid,{headers:{'x-paysme-signature':'sha256='+'0'.repeat(64)}},db);assert.equal(tampered.code,401);assert.equal(calls,1);
 const pending=await notify({...paid,event:'payment_request_sent'}, {}, db);assert.equal(pending.body.ignored,true);assert.equal(calls,1);
});
test('webhook acknowledges replay without trusting browser state or exposing errors',async()=>{
 const replay=await notify(paid,{}, {rpc:async()=>({data:{replayed:true}})});assert.deepEqual(replay.body,{ok:true,replayed:true});
 const mismatch=await notify(paid,{}, {rpc:async()=>({error:{code:'P0001',message:'private database data'}})});assert.equal(mismatch.code,400);assert.doesNotMatch(JSON.stringify(mismatch.body),/private/);
 const failed=await notify(paid,{}, {rpc:async()=>{throw Error('private key');}});assert.equal(failed.code,503);assert.doesNotMatch(JSON.stringify(failed.body),/private key/);
});
