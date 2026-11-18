import test from 'node:test';
import assert from 'node:assert/strict';
import {isAppInvoice,capturePaymentReturn,pendingReturnInvoice,hostedPaymentUrl,PAYSME_RETURN_URL,PAYSME_SHARED_WEBHOOK_URL} from '../src/payment-config.js';
import {createPaymentStatusHandler} from '../api/subscription-status.js';
const invoice='SEEKGRN-8A2DD90';
const store=()=>{const values=new Map();return {getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};};
const response=()=>({setHeader(){},status(code){this.code=code;return this;},json(body){this.body=body;return this;}});
test('short SEEKGRN references are validated without accepting other apps or malformed input',()=>{
 assert.ok(isAppInvoice(invoice));assert.ok(isAppInvoice('SG-123e4567-e89b-42d3-a456-426614174000'));
 for(const value of ['OTHER-8A2DD90','SEEKGRN-8a2dd90','SEEKGRN-1','SEEKGRN-<script>',null,['SEEKGRN-8A2DD90']])assert.equal(isAppInvoice(value),false);
});
test('central app-opening URL preserves the owned invoice across sign-in and ignores success flags',()=>{
 const storage=store();const open=new URL('https://seek-grn.vercel.app/#subscription');open.searchParams.set('invoice_id',invoice);open.searchParams.set('status','success');
 assert.equal(capturePaymentReturn(open,storage),invoice);assert.equal(pendingReturnInvoice(storage),invoice);
 capturePaymentReturn(new URL('https://seek-grn.vercel.app/?code=oauth-return'),storage);assert.equal(pendingReturnInvoice(storage),invoice);
 assert.equal(capturePaymentReturn(new URL('https://seek-grn.vercel.app/?invoice_id=OTHER-8A2DD90'),storage),null);assert.equal(pendingReturnInvoice(storage),null);
});
test('hosted fallback always uses central return and keeps the exact backend invoice',()=>{
 const url=new URL(hostedPaymentUrl({vendor_uuid:'merchant',invoice_id:invoice,amount_nad:50,mobile:'+264818083704',email:'test@example.com',town:'Okahandja',redirect_url:'https://untrusted.example'}));
 assert.equal(url.searchParams.get('redirect_url'),PAYSME_RETURN_URL);assert.equal(url.searchParams.get('invoice_id'),invoice);assert.equal(url.searchParams.get('amount'),'50');
 assert.equal(PAYSME_SHARED_WEBHOOK_URL,'https://merchant-webhook.paysme.app/webhook/00000000-1986-0026-0000-000000000001');
});
test('returned payment status requires authentication and both invoice and account ownership',async()=>{
 const filters=[];let reads=0;
 const query={select(){return this;},eq(key,value){filters.push([key,value]);return this;},async maybeSingle(){return {data:{invoice_id:invoice,app_prefix:'SEEKGRN',currency:'NAD',status:'pending',amount:50}};}};
 const db={auth:{getUser:async()=>({data:{user:{id:'owner'}}})},from:table=>{reads++;assert.equal(table,'subscription_orders');return query;}};
 const handler=createPaymentStatusHandler({client:()=>db});const req={method:'GET',query:{invoice_id:invoice},headers:{authorization:'Bearer owner-token'}};
 let res=response();await handler({...req,headers:{}},res);assert.equal(res.code,401);assert.equal(reads,0);
 res=response();await handler(req,res);assert.equal(res.code,200);assert.equal(res.body.order.status,'pending');assert.deepEqual(filters,[['invoice_id',invoice],['user_id','owner']]);
});
test('unknown or another account invoice never discloses status; failures never fabricate payment',async()=>{
 const req={method:'GET',query:{invoice_id:invoice},headers:{authorization:'Bearer owner-token'}};
 for(const result of [{data:null},{error:{message:'private database error'}}]){
  const db={auth:{getUser:async()=>({data:{user:{id:'owner'}}})},from:()=>({select:()=>({eq:()=>({eq:()=>({maybeSingle:async()=>result})})})})};
  const res=response();await createPaymentStatusHandler({client:()=>db})(req,res);assert.equal(res.code,result.error?503:404);assert.equal(res.body.order,undefined);assert.doesNotMatch(JSON.stringify(res.body),/private/);
 }
});
