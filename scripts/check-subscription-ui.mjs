// Isolated UI smoke test: mock Auth, database, payment endpoint and SDK. No live SMS/payment.
import {chromium} from '../install-cache/subscription-runtime/node_modules/playwright-core/index.mjs';
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:process.env.SEEKGRN_BROWSER||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
const user={id:'11111111-1111-4111-8111-111111111111',aud:'authenticated',role:'authenticated',email:'applicant@example.com',phone:'264818083704',email_confirmed_at:'2026-11-18T00:00:00Z',phone_confirmed_at:'2026-11-18T00:00:00Z',user_metadata:{},app_metadata:{provider:'email'}};
const tokenPart=v=>Buffer.from(JSON.stringify(v)).toString('base64url');
const jwt=tokenPart({alg:'HS256',typ:'JWT'})+'.'+tokenPart({sub:user.id,role:'authenticated',aud:'authenticated',exp:Math.floor(Date.now()/1000)+3600})+'.test';
try{
 for(const admin of [false,true]){
  let paid=false,sdkLoads=0;
  const context=await browser.newContext({viewport:{width:390,height:844}});
  await context.addInitScript(({user,jwt})=>localStorage.setItem('sb-dmrtrkhjlarjzhaxyflf-auth-token',JSON.stringify({access_token:jwt,refresh_token:'test-refresh',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,token_type:'bearer',user})),{user,jwt});
  await context.route('https://dmrtrkhjlarjzhaxyflf.supabase.co/**',async route=>{
   const url=route.request().url();let body={};
   if(url.includes('/auth/v1/user'))body=user;
   else if(url.includes('/auth/v1/settings'))body={external:{email:true,phone:true}};
   else if(url.includes('/rest/v1/app_admins'))body=admin?[{user_id:user.id}]:[];
   else if(url.includes('/rest/v1/applicant_data'))body=[];
   else if(url.includes('/rest/v1/circulars'))body=[{id:1,title:'Test circular',jobs:[],closes:'2099-12-31',advertised:'2026-11-18',pdf:null}];
   else if(url.includes('/rest/v1/rpc/subscription_status'))body=paid?{plan:'annual',unlimited:true,free_remaining:1,ends_at:'2027-11-18T00:00:00Z'}:{plan:'free',remaining:0,free_remaining:1};
   else throw Error('Unexpected DB request: '+url);
   await route.fulfill({json:body});
  });
  await context.route('**/api/subscription',route=>route.fulfill({json:{order:{invoice_id:'SG-test',amount:360},checkout:{vendor_uuid:user.id,api_key:'test-key',invoice_id:'SG-test',amount_nad:360,mobile:user.phone,email:user.email,town:'Okahandja',idempotency_key:'seekgrn-SG-test'}}}));
  await context.route('https://www.paysme.site/sdk/v1/paysme.js',async route=>{sdkLoads++;await route.fulfill({contentType:'application/javascript',body:'window.PaySME={renderRequestToPayButton(c){const b=document.createElement("button");b.textContent="Create Payment Request";b.onclick=()=>c.on_request_sent({});c.container.append(b);}}'});});
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:5173/#subscription');
  if(admin){
   await page.waitForSelector('.app-nav');assert.equal(await page.locator('.app-nav a[href="#subscription"]').count(),0);assert.equal(await page.locator('.subscription-page').count(),0);
   await page.getByRole('button',{name:'My account',exact:true}).click();assert.equal(await page.locator('.account-subscription').count(),0);
  }else{
   await page.waitForSelector('.price-card');assert.equal(await page.locator('.price-card').count(),3);
   await page.waitForFunction(()=>document.querySelector('#subscription-status')?.textContent.includes('Free access'));
   assert.match(await page.locator('.subscription-grid').innerText(),/Save N\$60 \(20%\)/);assert.match(await page.locator('.subscription-grid').innerText(),/Save N\$240 \(40%\)/);
   for(const width of [320,360,390,768,1280]){await page.setViewportSize({width,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'horizontal overflow at '+width);}
   await page.setViewportSize({width:390,height:844});await page.locator('[data-plan="annual"]').click();await page.locator('[name=town]').fill('Okahandja');await page.getByRole('button',{name:'Continue with PaySME'}).click();
   await page.getByRole('button',{name:'Create Payment Request'}).click();await page.waitForFunction(()=>document.querySelector('#payment-message').textContent==='Request to Pay Sent. Check your SMS.');assert.match(await page.locator('#subscription-status').innerText(),/Free access/);
   paid=true;await page.getByRole('button',{name:'Refresh status'}).click();await page.waitForFunction(()=>document.querySelector('#subscription-status').textContent.includes('Unlimited preparations'));assert.equal(sdkLoads,1);
   await page.getByRole('button',{name:'My account',exact:true}).click();assert.equal(await page.locator('.account-subscription').count(),1);
  }
  assert.deepEqual(errors,[]);await context.close();
 }
 console.log('PASS: normal/admin icon visibility, package prices/savings, no overflow at 320–1280px, SDK once, SMS stays unpaid, verified-status refresh.');
}finally{await browser.close();}
