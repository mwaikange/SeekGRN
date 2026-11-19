// Isolated UI smoke test. Auth, payment creation and PaySME SMS delivery are intercepted.
import {chromium} from '../install-cache/subscription-runtime/node_modules/playwright-core/index.mjs';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';

const sdkSource=await readFile(process.env.SEEKGRN_PAYSME_SDK,'utf8');
const browser=await chromium.launch({
 executablePath:process.env.SEEKGRN_BROWSER||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
 headless:true
});
const user={id:'11111111-1111-4111-8111-111111111111',aud:'authenticated',role:'authenticated',email:'applicant@example.com',phone:'264818083704',email_confirmed_at:'2026-11-18T00:00:00Z',phone_confirmed_at:'2026-11-18T00:00:00Z',user_metadata:{},app_metadata:{provider:'email'}};
const tokenPart=v=>Buffer.from(JSON.stringify(v)).toString('base64url');
const jwt=tokenPart({alg:'HS256',typ:'JWT'})+'.'+tokenPart({sub:user.id,role:'authenticated',aud:'authenticated',exp:Math.floor(Date.now()/1000)+3600})+'.test';
const base='http://127.0.0.1:5173';

try{
 for(const kind of ['applicant','admin','unverified','signup']){
  const admin=kind==='admin';
  let account=kind==='unverified'?{...user,phone_confirmed_at:null}:user;
  let subscribed=false,sdkLoads=0,smsRequests=0,orderRequests=0;
  const orders=new Map();
  const context=await browser.newContext({viewport:{width:390,height:844}});
  if(kind!=='signup')await context.addInitScript(({account,jwt})=>localStorage.setItem('sb-dmrtrkhjlarjzhaxyflf-auth-token',JSON.stringify({access_token:jwt,refresh_token:'test-refresh',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,token_type:'bearer',user:account})),{account,jwt});
  await context.route('https://dmrtrkhjlarjzhaxyflf.supabase.co/**',async route=>{
   const request=route.request(),url=request.url();let body={};
   if(url.includes('/auth/v1/user')){
    if(request.method()==='PUT')account={...account,user_metadata:request.postDataJSON().data};
    body=account;
   }else if(url.includes('/auth/v1/settings'))body={external:{email:true,phone:true}};
   else if(url.includes('/rest/v1/app_admins'))body=admin?[{user_id:user.id}]:[];
   else if(url.includes('/rest/v1/applicant_data'))body=[];
   else if(url.includes('/rest/v1/circulars'))body=[{id:1,title:'Test circular',jobs:[],closes:'2099-12-31',advertised:'2026-11-18',pdf:null}];
   else if(url.includes('/rest/v1/rpc/subscription_status')){
    const pending_invoices=[...orders.values()].filter(o=>o.status==='pending').map(o=>o.invoice_id);
    body=subscribed?{plan:'annual',unlimited:true,free_remaining:1,ends_at:'2027-11-18T00:00:00Z',pending_invoices}:{plan:'free',remaining:0,free_remaining:1,pending_invoices};
   }else throw Error('Unexpected DB request: '+url);
   await route.fulfill({json:body});
  });
  await context.route('**/api/subscription',route=>{
   assert.deepEqual(route.request().postDataJSON(),{plan:'annual'});
   assert.equal(account.user_metadata.checkout_town,'Lüderitz');
   const order={invoice_id:'SEEKGRN-8A2DD9'+orderRequests++,amount:360,status:'pending'};
   orders.set(order.invoice_id,order);
   return route.fulfill({json:{order,checkout:{vendor_uuid:user.id,api_key:'test-key',invoice_id:order.invoice_id,amount_nad:360,mobile:user.phone,email:user.email,town:'Lüderitz',idempotency_key:'seekgrn-'+order.invoice_id}}});
  });
  await context.route('**/api/subscription-status?**',route=>{
   const order=orders.get(new URL(route.request().url()).searchParams.get('invoice_id'));
   return route.fulfill(order?{json:{order}}:{status:404,json:{error:'Not found'}});
  });
  await context.route('https://www.paysme.site/sdk/v1/paysme.js',route=>{
   sdkLoads++;return route.fulfill({contentType:'application/javascript',body:sdkSource});
  });
  await context.route('https://zvoqrqdnuupdefsuiurt.supabase.co/functions/v1/mobile-request-to-pay',route=>{
   if(route.request().method()==='OPTIONS')return route.fulfill({headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'POST','Access-Control-Allow-Headers':'*'}});
   const data=route.request().postDataJSON();
   assert.equal(data.town,'Lüderitz');assert.equal(data.amount_nad,360);
   assert.equal(data.idempotency_key,'seekgrn-'+data.invoice_id);
   assert.equal(orders.has(data.invoice_id),true);
   smsRequests++;
   return route.fulfill({headers:{'Access-Control-Allow-Origin':'*'},json:{ok:true,sms_sent:true,transaction_status:'pending'}});
  });
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/#subscription');
  const town=page.locator('select[name=town]');
  if(admin){
   await page.waitForSelector('.app-nav');assert.equal(await page.locator('.app-nav a[href="#subscription"]').count(),0);assert.equal(await page.locator('.subscription-page').count(),0);
   await page.getByRole('button',{name:'My account',exact:true}).click();assert.equal(await page.locator('.account-subscription').count(),0);
  }else if(kind==='signup'||kind==='unverified'){
   if(kind==='signup'){
    if(!await page.locator('.auth-sheet').count())await page.getByRole('button',{name:'Sign in',exact:true}).click();
    await page.getByRole('button',{name:'Create account',exact:true}).click();
   }
   await town.waitFor();
   assert.equal(await town.locator('option').count(),77);
   assert.equal(await page.locator('input[name=phone]').count(),1);
   await town.selectOption('Lüderitz');
   assert.equal(await town.inputValue(),'Lüderitz');
  }else{
   const buttons=page.locator('.paysme-r2p-button');
   const buy=page.locator('[data-plan=annual] button');
   const refresh=page.getByRole('button',{name:'Refresh status'});
   const waitLocked=disabled=>page.waitForFunction(disabled=>[...document.querySelectorAll('.paysme-r2p-button')].length===3&&[...document.querySelectorAll('.paysme-r2p-button')].every(b=>b.disabled===disabled),disabled);
   await waitLocked(true);
   await page.getByRole('button',{name:'Set your town in My account'}).click();
   assert.equal(await town.locator('option').count(),77);
   await town.selectOption('Lüderitz');
   await page.getByRole('button',{name:'Save town'}).click();
   await town.waitFor({state:'detached'});
   await waitLocked(false);
   assert.equal(await buttons.count(),3);
   assert.match(await page.locator('.subscription-grid').innerText(),/Save N\$60 \(20%\)/);
   assert.match(await page.locator('.subscription-grid').innerText(),/Save N\$240 \(40%\)/);
   for(const width of [320,360,390,768,901,1280]){
    await page.setViewportSize({width,height:844});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'horizontal overflow at '+width);
    assert.equal(await buy.evaluate(button=>getComputedStyle(button).whiteSpace),'nowrap');
    assert.equal(await page.locator('.footer-details').evaluate(node=>getComputedStyle(node).textAlign),'center');
   }
   await page.setViewportSize({width:390,height:844});
   await buy.click();
   const toast=page.locator('#paysme-r2p-notice');
   await toast.waitFor();
   assert.equal(await toast.textContent(),'Request to Pay Sent. Check your SMS.');
   assert.deepEqual(await toast.evaluate(node=>[getComputedStyle(node).animationName,getComputedStyle(node).top,getComputedStyle(node).right]),['paysme-toast-slide','16px','16px']);
   assert.equal(smsRequests,1);assert.equal(orderRequests,1);
   await page.getByText('Awaiting payment for SEEKGRN-8A2DD90.',{exact:false}).waitFor();
   await waitLocked(true);
   await page.reload();
   await page.getByText('Awaiting payment for SEEKGRN-8A2DD90.',{exact:false}).waitFor();
   await waitLocked(true);
   orders.get('SEEKGRN-8A2DD90').status='expired';
   await refresh.click();
   await page.getByText('Payment request SEEKGRN-8A2DD90 expired.').waitFor();
   await waitLocked(false);
   await buy.click();
   await page.getByText('Awaiting payment for SEEKGRN-8A2DD91.',{exact:false}).waitFor();
   await waitLocked(true);
   orders.get('SEEKGRN-8A2DD91').status='cancelled';
   await refresh.click();
   await waitLocked(false);
   await buy.click();
   await page.getByText('Awaiting payment for SEEKGRN-8A2DD92.',{exact:false}).waitFor();
   orders.get('SEEKGRN-8A2DD92').status='paid';subscribed=true;
   await refresh.click();
   await page.getByText('Payment confirmed for SEEKGRN-8A2DD92.',{exact:false}).waitFor();
   await waitLocked(true);
   subscribed=false;
   await refresh.click();
   await waitLocked(false);
   assert.equal(smsRequests,3);assert.equal(orderRequests,3);assert.equal(sdkLoads,2,'SDK loads once per page');
   await toast.waitFor({state:'detached',timeout:9000});
  }
  assert.deepEqual(errors,[]);await context.close();
 }
 console.log('PASS: 76-town verification and account selectors, single-click official SDK SMS, top-right toast, invoice and subscription locks, expiry and cancellation, centered footer and mobile card layout.');
}finally{await browser.close();}
