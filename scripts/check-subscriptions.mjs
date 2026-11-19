// Optional isolated PostgreSQL check. See SUBSCRIPTIONS_SETUP.md for the runtime.
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {Readable} from 'node:stream';
import {createWebhookHandler} from '../api/paysme-webhook.js';
const {PGlite}=await import(process.env.SEEKGRN_PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite();
const ids=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333','44444444-4444-4444-8444-444444444444'];
const quote=v=>"'"+String(v).replaceAll("'","''")+"'";
const one=async(sql,args=[])=> (await db.query(sql,args)).rows[0];
const login=async(id,role='authenticated')=>db.exec("reset role;select set_config('request.jwt.claim.sub',"+quote(id)+",false);set role "+role);
const status=async()=> (await one('select public.subscription_status() as value')).value;
const pack=id=>({jobId:id,files:[{},{}],title:'Test pack'});
const save=async id=>(await one('select public.save_prepared_pack($1::jsonb) as value',[JSON.stringify(pack(id))])).value;

async function deliverPaidWebhook(order) {
 const env={
  PAYSME_WEBHOOK_SECRET:'isolated-test-signing-key',
  PAYSME_MERCHANT_ID:'00000000-1986-0026-0000-000000000001',
  SUPABASE_SERVICE_ROLE_KEY:'isolated-test-service-key'
 };
 const handler=createWebhookHandler({env,client:()=>({
  async rpc(name,{p_invoice,p_transaction,p_amount,p_currency}) {
   assert.equal(name,'apply_subscription_payment');
   const row=await one('select public.apply_subscription_payment($1,$2,$3,$4) as value',[
    p_invoice,p_transaction,p_amount,p_currency
   ]);
   return {data:row.value};
  }
 })});
 const body=Buffer.from(JSON.stringify({
  event:'payment.paid',status:'paid',merchant_id:env.PAYSME_MERCHANT_ID,
  invoice_id:order.invoice_id,transaction_id:'TX-1',amount:order.amount,currency:order.currency
 }));
 const signature=createHmac('sha256',env.PAYSME_WEBHOOK_SECRET).update(body).digest('hex');
 const request=Object.assign(Readable.from([body]),{method:'POST',headers:{'x-paysme-signature':`sha256=${signature}`}});
 const response={
  setHeader(){},
  status(code){this.code=code;return this;},
  json(payload){this.payload=payload;}
 };
 await handler(request,response);
 assert.equal(response.code,200);
 return response.payload;
}
try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create schema auth;create table auth.users(id uuid primary key,email_confirmed_at timestamptz,phone_confirmed_at timestamptz,raw_user_meta_data jsonb);
 create function auth.uid() returns uuid language sql stable as 'select nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
 grant usage on schema auth to anon,authenticated,service_role;
 grant execute on function auth.uid() to anon,authenticated,service_role;
 create table public.app_admins(user_id uuid primary key references auth.users);
 create table public.applicant_data(user_id uuid references auth.users,key text,value jsonb,updated_at timestamptz,primary key(user_id,key));
 alter table public.applicant_data enable row level security;
 create policy own_data on public.applicant_data for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
 grant select,insert,update,delete on public.applicant_data to authenticated;
 `);
 for(const id of ids)await db.query("insert into auth.users values($1,now(),now(),'{\"checkout_town\":\"Okahandja\"}')",[id]);
 await db.query("insert into app_admins values($1)",[ids[3]]);
 await db.query("insert into applicant_data values($1,'documents',$2,now())",[ids[2],JSON.stringify([pack('legacy-vacancy')])]);
 const sql=await readFile(new URL('./subscriptions.sql',import.meta.url),'utf8');
 await db.exec(sql);await db.exec(sql);await db.exec(await readFile(new URL('./payment-return-update.sql',import.meta.url),'utf8'));
 const lifecycle=await readFile(new URL('./subscription-lifecycle.sql',import.meta.url),'utf8');
 await db.exec(lifecycle);await db.exec(lifecycle);
 await login(ids[0]);assert.equal((await status()).free_remaining,1);
 await save('free-vacancy');assert.equal((await status()).free_remaining,0);
 await save('free-vacancy');assert.equal((await status()).free_remaining,0);
 await db.query("delete from applicant_data where user_id=$1 and key='documents'",[ids[0]]);
 await assert.rejects(save('another-free-vacancy'),/FORM_ALLOWANCE/);
 await assert.rejects(db.query("insert into applicant_data values($1,'documents',$2,now())",[ids[0],JSON.stringify([pack('bypass')])]),/Use Prepare forms/);
 await assert.rejects(db.query("insert into form_preparations(user_id,job_id,source) values($1,'cheat','admin')",[ids[0]]),/permission denied/);
 await assert.rejects(db.query("select apply_subscription_payment('x','fake',50,'NAD')"),/permission denied/);
 let order=(await one("select create_subscription_order('monthly') as value")).value;
 assert.equal(order.town,'Okahandja');assert.equal(order.amount,50);assert.match(order.invoice_id,/^SEEKGRN-[A-F0-9]{7}$/);assert.equal(order.currency,'NAD');assert.equal(order.app_prefix,'SEEKGRN');
 assert.deepEqual((await status()).pending_invoices,[order.invoice_id]);
 await assert.rejects(db.query("select create_subscription_order('monthly')"),/pending payment/);
 await assert.rejects(db.query("select create_subscription_order('annual')"),/pending payment/);
 await assert.rejects(db.query("select close_subscription_order($1,'expired',50,'NAD')",[order.invoice_id]),/permission denied/);
 await login(ids[0],'service_role');await assert.rejects(db.query("select apply_subscription_payment($1,'TX-1',1,'NAD')",[order.invoice_id]),/do not match/);
 assert.deepEqual(await deliverPaidWebhook(order),{ok:true,replayed:false});
 assert.deepEqual(await deliverPaidWebhook(order),{ok:true,replayed:true});
 await assert.rejects(db.query("select apply_subscription_payment($1,'TX-wrong-currency',50,'USD')",[order.invoice_id]),/do not match/);
 await login(ids[0]);assert.equal((await status()).remaining,20);
 for(let i=0;i<20;i++)await save('monthly-'+i);
 assert.equal((await status()).remaining,0);await assert.rejects(save('monthly-over'),/FORM_ALLOWANCE/);
 await save('monthly-0');assert.equal((await status()).used,20);
 await assert.rejects(db.query("select create_subscription_order('biannual')"),/current subscription ends/);
 await db.exec('reset role');
 await db.query("update subscription_terms set starts_at=now()-interval '2 months',ends_at=now()-interval '1 month' where user_id=$1",[ids[0]]);
 await login(ids[0]);
 const expired=(await one("select create_subscription_order('biannual') as value")).value;
 await login(ids[0],'service_role');
 await assert.rejects(db.query("select close_subscription_order($1,'expired',50,'NAD')",[expired.invoice_id]),/do not match/);
 assert.equal((await one("select close_subscription_order($1,'expired',240,'NAD') as value",[expired.invoice_id])).value.status,'expired');
 await login(ids[0]);
 const cancelled=(await one("select create_subscription_order('annual') as value")).value;
 await login(ids[0],'service_role');
 assert.equal((await one("select close_subscription_order($1,'cancelled',360,'NAD') as value",[cancelled.invoice_id])).value.status,'cancelled');
 const late=(await one("select apply_subscription_payment($1,'TX-late',240,'NAD') as value",[expired.invoice_id])).value;
 assert.equal(late.review_required,true);
 await login(ids[0]);assert.equal((await status()).plan,'free');assert.deepEqual((await status()).pending_invoices,[]);
 await login(ids[1]);order=(await one("select create_subscription_order('biannual') as value")).value;
 await login(ids[1],'service_role');await db.query("select apply_subscription_payment($1,'TX-3',240,'NAD')",[order.invoice_id]);
 await login(ids[1]);for(let i=0;i<30;i++)await save('six-month-'+i);assert.equal((await status()).remaining,0);
 await save('six-month-free');assert.equal((await status()).free_remaining,0);await assert.rejects(save('six-month-over'),/FORM_ALLOWANCE/);
 await db.exec('reset role');
 await db.query("update subscription_terms set starts_at=now()-interval '40 days',ends_at=now()+interval '5 months' where user_id=$1",[ids[1]]);
 await db.query("update form_preparations set created_at=now()-interval '35 days' where user_id=$1 and source='subscription'",[ids[1]]);
 await login(ids[1]);assert.equal((await status()).remaining,30);await save('next-period');assert.equal((await status()).remaining,29);
 await login(ids[2]);assert.equal((await status()).free_remaining,1);await save('legacy-vacancy');assert.equal((await status()).free_remaining,1);
 order=(await one("select create_subscription_order('annual') as value")).value;
 await login(ids[2],'service_role');await db.query("select apply_subscription_payment($1,'TX-4',360,'NAD')",[order.invoice_id]);
 await login(ids[2]);for(let i=0;i<50;i++)await save('annual-'+i);assert.equal((await status()).unlimited,true);
 await login(ids[3]);assert.equal((await status()).plan,'admin');assert.equal((await status()).unlimited,true);
 for(let i=0;i<25;i++)await save('admin-'+i);
 await assert.rejects(db.query("select create_subscription_order('monthly')"),/Administrators have free/);
 await db.exec('reset role');assert.equal((await one('select count(*)::int as n from subscription_terms')).n,3);
 // Force a short-ID collision and prove the database retries without changing the old invoice.
 const firstInvoice=(await one('select invoice_id from subscription_orders order by created_at limit 1')).invoice_id;
 const collisionHex=firstInvoice.slice(8).padEnd(32,'0');
 const candidates=['ABCDEF1','ABCDEF2','ABCDEF3','ABCDEF4','ABCDEF5'];
 const candidate=candidates.find(s=>s!==firstInvoice.slice(8));
 const uniqueHex=candidate.padEnd(32,'1');
 const uuidOf=hex=>hex.slice(0,8)+'-'+hex.slice(8,12)+'-'+hex.slice(12,16)+'-'+hex.slice(16,20)+'-'+hex.slice(20);
 const originalGenerator=(await one("select pg_get_functiondef('public.create_subscription_order(text)'::regprocedure) as definition")).definition;
 await db.exec('create sequence public.invoice_collision_sequence');
 await db.exec("create or replace function public.invoice_test_uuid() returns uuid language plpgsql as $$ begin if nextval('public.invoice_collision_sequence')=1 then return "+quote(uuidOf(collisionHex))+"::uuid; else return "+quote(uuidOf(uniqueHex))+"::uuid; end if; end $$;");
 await db.exec(originalGenerator.replace('gen_random_uuid()', 'public.invoice_test_uuid()'));
 await login(ids[0]);
 const collidedOrder=(await one("select create_subscription_order('annual') as value")).value;
 assert.equal(collidedOrder.invoice_id,'SEEKGRN-'+candidate);
 await db.exec('reset role');assert.equal(Number((await one('select last_value from public.invoice_collision_sequence')).last_value),2);
 await db.exec(originalGenerator);
 console.log('PASS: migration rerun, preserved packs, quota enforcement, pending and active purchase locks, cancelled and expired invoice release, late-payment review, short-ID collision retry and webhook replay.');
}finally{await db.close();}
